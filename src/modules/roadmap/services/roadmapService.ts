import { Member, PoleName, Prisma, RoadmapStatus } from '@prisma/client';
import prisma from '@database/prisma';
import { recordAudit } from '@modules/audit/services/auditService';
import { AuditAction, AuditEntity } from '@modules/audit/actions';
import logger from '@core/Logger';

export type RoadmapItemWithRelations = Prisma.RoadmapItemGetPayload<{
  include: { pole: true; owner: true; project: true };
}>;

const WITH_RELATIONS = { pole: true, owner: true, project: true } as const;

export const ROADMAP_STATUS_LABELS: Record<RoadmapStatus, string> = {
  [RoadmapStatus.PLANIFIE]: '📋 Planifié',
  [RoadmapStatus.EN_COURS]: '🔨 En développement',
  [RoadmapStatus.LIVRE]: '✅ Livré',
  [RoadmapStatus.ABANDONNE]: '🗑️ Abandonné',
};

export interface CreateRoadmapItemInput {
  title: string;
  description?: string;
  pole?: PoleName;
  owner?: Member;
  targetDate?: Date;
  actor: Member;
}

export async function createRoadmapItem(
  input: CreateRoadmapItemInput,
): Promise<RoadmapItemWithRelations> {
  const pole = input.pole ? await prisma.pole.findUnique({ where: { name: input.pole } }) : null;

  const item = await prisma.roadmapItem.create({
    data: {
      title: input.title,
      description: input.description,
      poleId: pole?.id,
      ownerId: input.owner?.id,
      targetDate: input.targetDate,
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Roadmap : "${item.title}" ajouté`);

  await recordAudit({
    action: AuditAction.ROADMAP_ITEM_CREATED,
    entityType: AuditEntity.ROADMAP,
    entityId: item.id,
    actorId: input.actor.id,
    metadata: { titre: item.title, pole: input.pole },
  });

  return item;
}

export async function getRoadmap(status?: RoadmapStatus): Promise<RoadmapItemWithRelations[]> {
  return prisma.roadmapItem.findMany({
    where: status ? { status } : undefined,
    include: WITH_RELATIONS,
    orderBy: [{ status: 'asc' }, { targetDate: 'asc' }],
    take: 50,
  });
}

export async function searchRoadmapItems(query: string, limit = 25) {
  return prisma.roadmapItem.findMany({
    where: {
      status: { notIn: [RoadmapStatus.LIVRE, RoadmapStatus.ABANDONNE] },
      ...(query ? { title: { contains: query } } : {}),
    },
    orderBy: { targetDate: 'asc' },
    take: limit,
  });
}

export async function updateRoadmapStatus(
  itemId: string,
  status: RoadmapStatus,
  actor: Member,
): Promise<RoadmapItemWithRelations> {
  const current = await prisma.roadmapItem.findUnique({ where: { id: itemId } });
  if (!current) throw new Error('Élément de roadmap introuvable.');

  if (current.status === status) {
    throw new Error(`Cet élément est déjà au statut ${ROADMAP_STATUS_LABELS[status]}.`);
  }

  const item = await prisma.roadmapItem.update({
    where: { id: itemId },
    data: { status },
    include: WITH_RELATIONS,
  });

  await recordAudit({
    action: AuditAction.ROADMAP_ITEM_UPDATED,
    entityType: AuditEntity.ROADMAP,
    entityId: item.id,
    actorId: actor.id,
    metadata: { target: item.title, from: current.status, to: status },
  });

  return item;
}
