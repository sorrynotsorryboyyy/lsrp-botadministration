import { Prisma } from '@prisma/client';
import prisma from '@database/prisma';
import logger from '@core/Logger';
import { AuditActionValue, AuditEntityValue } from '../actions';

export type AuditLogWithActor = Prisma.AuditLogGetPayload<{ include: { actor: true } }>;

export interface AuditEntry {
  action: AuditActionValue;
  entityType: AuditEntityValue;
  /** Identifiant de l'objet concerné, si l'action en vise un. */
  entityId?: string;
  /** Identifiant `Member` de l'auteur ; absent pour une action automatique. */
  actorId?: string;
  /** Contexte libre (avant/après, cible, montant…). */
  metadata?: Record<string, unknown>;
}

/**
 * Enregistre une entrée d'audit.
 *
 * N'échoue jamais : une écriture d'audit ratée est journalisée puis ignorée.
 * Faire remonter l'erreur annulerait une action métier déjà accomplie, ce qui
 * serait pire que la perte d'une ligne d'historique.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorId: entry.actorId,
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    logger.error(`Échec d'écriture du journal d'audit (${entry.action}):`, error);
  }
}

export interface AuditQuery {
  actorId?: string;
  entityType?: AuditEntityValue;
  entityId?: string;
  action?: AuditActionValue;
  /** Nombre d'entrées par page. */
  take?: number;
  skip?: number;
}

export async function queryAudit(query: AuditQuery = {}): Promise<AuditLogWithActor[]> {
  return prisma.auditLog.findMany({
    where: {
      actorId: query.actorId,
      entityType: query.entityType,
      entityId: query.entityId,
      action: query.action,
    },
    include: { actor: true },
    orderBy: { createdAt: 'desc' },
    take: query.take ?? 15,
    skip: query.skip ?? 0,
  });
}

export async function countAudit(query: AuditQuery = {}): Promise<number> {
  return prisma.auditLog.count({
    where: {
      actorId: query.actorId,
      entityType: query.entityType,
      entityId: query.entityId,
      action: query.action,
    },
  });
}

/** Compte les entrées postérieures à une date — alimente les KPI et le dashboard. */
export async function countAuditSince(since: Date, action?: AuditActionValue): Promise<number> {
  return prisma.auditLog.count({
    where: { createdAt: { gte: since }, action },
  });
}
