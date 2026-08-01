import {
  Member,
  ObjectiveScope,
  ObjectiveStatus,
  PoleName,
  Prisma,
} from '@prisma/client';
import prisma from '@database/prisma';
import { recordAudit } from '@modules/audit/services/auditService';
import { AuditAction, AuditEntity } from '@modules/audit/actions';
import logger from '@core/Logger';

export type ObjectiveWithRelations = Prisma.ObjectiveGetPayload<{
  include: { pole: true; owner: true };
}>;

const WITH_RELATIONS = { pole: true, owner: true } as const;

export interface CreateObjectiveInput {
  title: string;
  description?: string;
  scope: ObjectiveScope;
  pole?: PoleName;
  owner?: Member;
  startDate: Date;
  endDate: Date;
  actor: Member;
}

export async function createObjective(input: CreateObjectiveInput): Promise<ObjectiveWithRelations> {
  if (input.endDate.getTime() <= input.startDate.getTime()) {
    throw new Error('La date de fin doit être postérieure à la date de début.');
  }

  const pole = input.pole ? await prisma.pole.findUnique({ where: { name: input.pole } }) : null;

  const objective = await prisma.objective.create({
    data: {
      title: input.title,
      description: input.description,
      scope: input.scope,
      poleId: pole?.id,
      ownerId: input.owner?.id,
      startDate: input.startDate,
      endDate: input.endDate,
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Objectif créé : "${objective.title}" (${input.scope})`);

  await recordAudit({
    action: AuditAction.OBJECTIVE_CREATED,
    entityType: AuditEntity.OBJECTIVE,
    entityId: objective.id,
    actorId: input.actor.id,
    metadata: { titre: objective.title, portee: input.scope, pole: input.pole },
  });

  return objective;
}

export async function getObjective(id: string): Promise<ObjectiveWithRelations | null> {
  return prisma.objective.findUnique({ where: { id }, include: WITH_RELATIONS });
}

export async function getActiveObjectives(pole?: PoleName): Promise<ObjectiveWithRelations[]> {
  const poleRecord = pole ? await prisma.pole.findUnique({ where: { name: pole } }) : null;

  return prisma.objective.findMany({
    where: {
      status: ObjectiveStatus.EN_COURS,
      ...(poleRecord ? { poleId: poleRecord.id } : {}),
    },
    include: WITH_RELATIONS,
    orderBy: { endDate: 'asc' },
    take: 25,
  });
}

export async function searchObjectives(query: string, limit = 25) {
  return prisma.objective.findMany({
    where: {
      status: ObjectiveStatus.EN_COURS,
      ...(query ? { title: { contains: query } } : {}),
    },
    orderBy: { endDate: 'asc' },
    take: limit,
  });
}

/**
 * Clôt un objectif.
 *
 * Un objectif déjà tranché ne peut pas être rejugé : cela fausserait les KPI
 * hebdomadaires, qui comptent les objectifs atteints sur une période donnée.
 */
export async function closeObjective(
  objectiveId: string,
  achieved: boolean,
  actor: Member,
): Promise<ObjectiveWithRelations> {
  const current = await prisma.objective.findUnique({ where: { id: objectiveId } });
  if (!current) throw new Error('Objectif introuvable.');

  if (current.status !== ObjectiveStatus.EN_COURS) {
    throw new Error(`Cet objectif est déjà clos (${current.status}).`);
  }

  const objective = await prisma.objective.update({
    where: { id: objectiveId },
    data: { status: achieved ? ObjectiveStatus.ATTEINT : ObjectiveStatus.MANQUE },
    include: WITH_RELATIONS,
  });

  logger.info(`Objectif "${objective.title}" → ${objective.status}`);

  if (achieved) {
    await recordAudit({
      action: AuditAction.OBJECTIVE_COMPLETED,
      entityType: AuditEntity.OBJECTIVE,
      entityId: objective.id,
      actorId: actor.id,
      metadata: { target: objective.title },
    });
  }

  return objective;
}

/** Objectifs dont l'échéance est dépassée sans clôture — alimente les alertes. */
export async function getOverdueObjectives(): Promise<ObjectiveWithRelations[]> {
  return prisma.objective.findMany({
    where: { status: ObjectiveStatus.EN_COURS, endDate: { lt: new Date() } },
    include: WITH_RELATIONS,
    orderBy: { endDate: 'asc' },
  });
}
