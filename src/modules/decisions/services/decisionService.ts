import { DecisionStatus, Member, Prisma } from '@prisma/client';
import prisma from '@database/prisma';
import { recordAudit } from '@modules/audit/services/auditService';
import { AuditAction, AuditEntity } from '@modules/audit/actions';
import logger from '@core/Logger';

export type DecisionWithRelations = Prisma.DecisionGetPayload<{
  include: { proposer: true; meetingLink: { include: { meeting: true } } };
}>;

const WITH_RELATIONS = {
  proposer: true,
  meetingLink: { include: { meeting: true } },
} as const;

export interface CreateDecisionInput {
  title: string;
  description: string;
  proposer: Member;
  /** Réunion d'origine, si la décision y a été prise. */
  meetingId?: string;
}

export async function createDecision(input: CreateDecisionInput): Promise<DecisionWithRelations> {
  const decision = await prisma.decision.create({
    data: {
      title: input.title,
      description: input.description,
      proposerId: input.proposer.id,
    },
    include: WITH_RELATIONS,
  });

  if (input.meetingId) {
    await prisma.meetingDecision.create({
      data: { meetingId: input.meetingId, decisionId: decision.id },
    });
  }

  logger.info(`Décision proposée : "${decision.title}" par ${input.proposer.username}`);

  await recordAudit({
    action: AuditAction.DECISION_CREATED,
    entityType: AuditEntity.DECISION,
    entityId: decision.id,
    actorId: input.proposer.id,
    metadata: { titre: decision.title, reunion: input.meetingId },
  });

  return decision;
}

export async function getDecision(id: string): Promise<DecisionWithRelations | null> {
  return prisma.decision.findUnique({ where: { id }, include: WITH_RELATIONS });
}

/** Décisions encore en attente d'arbitrage. */
export async function getPendingDecisions(limit = 25): Promise<DecisionWithRelations[]> {
  return prisma.decision.findMany({
    where: { status: DecisionStatus.PROPOSEE },
    include: WITH_RELATIONS,
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

export async function searchDecisions(query: string, limit = 25) {
  return prisma.decision.findMany({
    where: query ? { title: { contains: query } } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/**
 * Statue sur une décision.
 *
 * Refuse de rejuger une décision déjà tranchée ou appliquée : sans ce garde-fou,
 * une décision convertie en tâche pourrait être « rejetée » après coup, laissant
 * la tâche orpheline.
 */
export async function reviewDecision(
  decisionId: string,
  approve: boolean,
  actor: Member,
): Promise<DecisionWithRelations> {
  const current = await prisma.decision.findUnique({ where: { id: decisionId } });
  if (!current) throw new Error('Décision introuvable.');

  if (current.status !== DecisionStatus.PROPOSEE) {
    throw new Error(`Cette décision a déjà été traitée (${current.status}).`);
  }

  const decision = await prisma.decision.update({
    where: { id: decisionId },
    data: {
      status: approve ? DecisionStatus.VALIDEE : DecisionStatus.REJETEE,
      decidedAt: new Date(),
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Décision "${decision.title}" ${approve ? 'validée' : 'rejetée'} par ${actor.username}`);

  await recordAudit({
    action: approve ? AuditAction.DECISION_VALIDATED : AuditAction.DECISION_REJECTED,
    entityType: AuditEntity.DECISION,
    entityId: decision.id,
    actorId: actor.id,
    metadata: { target: decision.title },
  });

  return decision;
}
