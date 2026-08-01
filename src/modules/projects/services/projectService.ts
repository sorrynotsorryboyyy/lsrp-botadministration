import {
  Member,
  PoleName,
  Priority,
  Prisma,
  Project,
  ProjectStatus,
} from '@prisma/client';
import prisma from '@database/prisma';
import logger from '@core/Logger';
import { canTransitionProject, PROJECT_STATUS_LABELS } from '../workflow';

export type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: {
    manager: true;
    pole: true;
    members: { include: { member: true } };
    _count: { select: { tasks: true; comments: true } };
  };
}>;

const WITH_RELATIONS = {
  manager: true,
  pole: true,
  members: { include: { member: true } },
  _count: { select: { tasks: true, comments: true } },
} as const;

export interface CreateProjectInput {
  title: string;
  description: string;
  manager: Member;
  priority: Priority;
  pole?: PoleName;
  dueDate?: Date;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectWithRelations> {
  const pole = input.pole ? await prisma.pole.findUnique({ where: { name: input.pole } }) : null;

  const project = await prisma.project.create({
    data: {
      title: input.title,
      description: input.description,
      managerId: input.manager.id,
      priority: input.priority,
      poleId: pole?.id,
      dueDate: input.dueDate,
      // Le responsable est aussi membre : cela simplifie tous les contrôles
      // de participation, qui n'ont pas à traiter son cas à part.
      members: { create: { memberId: input.manager.id } },
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Projet créé : "${project.title}" (${project.id}) par ${input.manager.username}`);

  return project;
}

export async function getProject(id: string): Promise<ProjectWithRelations | null> {
  return prisma.project.findUnique({ where: { id }, include: WITH_RELATIONS });
}

/**
 * Recherche par titre partiel, pour l'autocomplétion.
 *
 * Les projets archivés sont exclus : ils encombreraient les suggestions sans
 * qu'aucune action ne soit possible dessus.
 */
export async function searchProjects(query: string, limit = 25): Promise<Project[]> {
  return prisma.project.findMany({
    where: {
      status: { not: ProjectStatus.ARCHIVE },
      ...(query ? { title: { contains: query } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
}

export interface StatusChangeResult {
  project: ProjectWithRelations;
  previousStatus: ProjectStatus;
}

/**
 * Change le statut d'un projet et trace l'opération.
 *
 * La transition est revalidée ici même si l'interface ne propose que des choix
 * licites : le `customId` d'un select menu peut être rejoué, et l'état a pu
 * changer entre l'affichage et le clic.
 */
export async function updateProjectStatus(
  projectId: string,
  newStatus: ProjectStatus,
  actor: Member,
): Promise<StatusChangeResult> {
  const current = await prisma.project.findUnique({ where: { id: projectId } });
  if (!current) throw new Error('Projet introuvable.');

  if (current.status === newStatus) {
    throw new Error(`Le projet est déjà au statut ${PROJECT_STATUS_LABELS[newStatus]}.`);
  }

  if (!canTransitionProject(current.status, newStatus)) {
    throw new Error(
      `Transition impossible : ${PROJECT_STATUS_LABELS[current.status]} → ${PROJECT_STATUS_LABELS[newStatus]}.`,
    );
  }

  const [project] = await prisma.$transaction([
    prisma.project.update({
      where: { id: projectId },
      data: {
        status: newStatus,
        archivedAt: newStatus === ProjectStatus.ARCHIVE ? new Date() : null,
      },
      include: WITH_RELATIONS,
    }),
    // Commentaire système : trace le changement dans le fil du projet sans
    // dépendre du module d'audit, non encore implémenté.
    prisma.projectComment.create({
      data: {
        projectId,
        authorId: actor.id,
        content: `[système] Statut : ${PROJECT_STATUS_LABELS[current.status]} → ${PROJECT_STATUS_LABELS[newStatus]}`,
      },
    }),
  ]);

  logger.info(`Projet "${project.title}" : ${current.status} → ${newStatus} (${actor.username})`);

  return { project, previousStatus: current.status };
}

export async function addProjectMember(projectId: string, member: Member): Promise<void> {
  const existing = await prisma.projectMember.findUnique({
    where: { projectId_memberId: { projectId, memberId: member.id } },
  });

  if (existing) {
    throw new Error(`**${member.username}** participe déjà à ce projet.`);
  }

  await prisma.projectMember.create({ data: { projectId, memberId: member.id } });

  logger.info(`${member.username} ajouté au projet ${projectId}`);
}

export async function removeProjectMember(projectId: string, member: Member): Promise<void> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });

  if (project?.managerId === member.id) {
    throw new Error('Le responsable du projet ne peut pas en être retiré.');
  }

  const deleted = await prisma.projectMember.deleteMany({
    where: { projectId, memberId: member.id },
  });

  if (deleted.count === 0) {
    throw new Error(`**${member.username}** ne participe pas à ce projet.`);
  }
}

export async function addProjectComment(
  projectId: string,
  author: Member,
  content: string,
): Promise<void> {
  await prisma.projectComment.create({ data: { projectId, authorId: author.id, content } });
}

/** Derniers commentaires, du plus récent au plus ancien. */
export async function getRecentComments(projectId: string, limit = 5) {
  return prisma.projectComment.findMany({
    where: { projectId },
    include: { author: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
