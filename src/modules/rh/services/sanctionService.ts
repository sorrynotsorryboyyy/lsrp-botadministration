import {
  Member,
  MemberHistoryEventType,
  MemberStatus,
  Sanction,
  SanctionSeverity,
  SanctionType,
  Warning,
} from '@prisma/client';
import prisma from '@database/prisma';
import logger from '@core/Logger';

export interface SanctionInput {
  target: Member;
  actor: Member;
  type: SanctionType;
  severity: SanctionSeverity;
  reason: string;
  /** Durée en jours ; `undefined` = sanction permanente. */
  durationDays?: number;
}

/**
 * Enregistre une sanction et journalise l'événement.
 *
 * Une suspension bascule aussi le statut du membre à `SUSPENDU`, afin que les
 * autres modules (dashboard, absences, assignation de tâches) puissent l'exclure
 * sans avoir à interpréter la table des sanctions.
 */
export async function createSanction(input: SanctionInput): Promise<Sanction> {
  const { target, actor, type, severity, reason, durationDays } = input;

  const expiresAt = durationDays
    ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
    : null;

  const sanction = await prisma.sanction.create({
    data: {
      type,
      severity,
      reason,
      targetId: target.id,
      issuerId: actor.id,
      expiresAt,
    },
  });

  await prisma.memberHistory.create({
    data: {
      subjectId: target.id,
      actorId: actor.id,
      eventType: MemberHistoryEventType.SANCTION,
      details: reason,
      newValue: `${type} (${severity})`,
    },
  });

  if (type === SanctionType.SUSPENSION) {
    await prisma.member.update({
      where: { id: target.id },
      data: { status: MemberStatus.SUSPENDU },
    });
  }

  logger.info(`Sanction ${type}/${severity} émise contre ${target.username} par ${actor.username}`);

  return sanction;
}

/** Enregistre un avertissement — plus léger qu'une sanction, sans effet de statut. */
export async function createWarning(
  target: Member,
  actor: Member,
  reason: string,
): Promise<Warning> {
  const warning = await prisma.warning.create({
    data: { reason, targetId: target.id, issuerId: actor.id },
  });

  await prisma.memberHistory.create({
    data: {
      subjectId: target.id,
      actorId: actor.id,
      eventType: MemberHistoryEventType.AVERTISSEMENT,
      details: reason,
    },
  });

  logger.info(`Avertissement émis contre ${target.username} par ${actor.username}`);

  return warning;
}

/** Compte les avertissements actifs d'un membre — utile pour graduer une sanction. */
export async function countWarnings(memberId: string): Promise<number> {
  return prisma.warning.count({ where: { targetId: memberId } });
}
