import { AbsenceStatus, AbsenceType, Member, MemberStatus, Prisma } from '@prisma/client';
import prisma from '@database/prisma';
import { recordAudit } from '@modules/audit/services/auditService';
import { AuditAction, AuditEntity } from '@modules/audit/actions';
import logger from '@core/Logger';

export type AbsenceWithRelations = Prisma.AbsenceGetPayload<{
  include: { member: true; reviewer: true };
}>;

const WITH_RELATIONS = { member: true, reviewer: true } as const;

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  [AbsenceType.CONGE]: '🌴 Congé',
  [AbsenceType.MALADIE]: '🤒 Maladie',
  [AbsenceType.INDISPONIBILITE]: '⏸️ Indisponibilité',
  [AbsenceType.AUTRE]: '📌 Autre',
};

export interface DeclareAbsenceInput {
  member: Member;
  type: AbsenceType;
  startDate: Date;
  endDate: Date;
  reason?: string;
}

export async function declareAbsence(input: DeclareAbsenceInput): Promise<AbsenceWithRelations> {
  if (input.endDate.getTime() < input.startDate.getTime()) {
    throw new Error('La date de fin doit être postérieure à la date de début.');
  }

  // Deux absences qui se chevauchent rendraient la liste des absents ambiguë.
  const overlapping = await prisma.absence.findFirst({
    where: {
      memberId: input.member.id,
      status: { in: [AbsenceStatus.DEMANDEE, AbsenceStatus.VALIDEE] },
      startDate: { lte: input.endDate },
      endDate: { gte: input.startDate },
    },
  });

  if (overlapping) {
    throw new Error('Une absence chevauchant cette période est déjà enregistrée.');
  }

  const absence = await prisma.absence.create({
    data: {
      memberId: input.member.id,
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason,
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Absence déclarée : ${input.member.username} (${input.type})`);

  await recordAudit({
    action: AuditAction.ABSENCE_DECLARED,
    entityType: AuditEntity.ABSENCE,
    entityId: absence.id,
    actorId: input.member.id,
    metadata: {
      type: input.type,
      du: input.startDate.toISOString().slice(0, 10),
      au: input.endDate.toISOString().slice(0, 10),
    },
  });

  return absence;
}

export async function getAbsence(id: string): Promise<AbsenceWithRelations | null> {
  return prisma.absence.findUnique({ where: { id }, include: WITH_RELATIONS });
}

/** Absences en cours à la date du jour. */
export async function getCurrentAbsences(): Promise<AbsenceWithRelations[]> {
  const now = new Date();

  return prisma.absence.findMany({
    where: {
      status: AbsenceStatus.VALIDEE,
      startDate: { lte: now },
      endDate: { gte: now },
    },
    include: WITH_RELATIONS,
    orderBy: { endDate: 'asc' },
  });
}

export async function getPendingAbsences(): Promise<AbsenceWithRelations[]> {
  return prisma.absence.findMany({
    where: { status: AbsenceStatus.DEMANDEE },
    include: WITH_RELATIONS,
    orderBy: { startDate: 'asc' },
    take: 25,
  });
}

/**
 * Valide ou refuse une absence.
 *
 * Une validation bascule aussi le statut du membre à `EN_CONGE` si l'absence a
 * déjà commencé, pour que le dashboard reflète la réalité sans attendre un job.
 */
export async function reviewAbsence(
  absenceId: string,
  approve: boolean,
  reviewer: Member,
): Promise<AbsenceWithRelations> {
  const current = await prisma.absence.findUnique({ where: { id: absenceId } });
  if (!current) throw new Error('Absence introuvable.');

  if (current.status !== AbsenceStatus.DEMANDEE) {
    throw new Error(`Cette absence a déjà été traitée (${current.status}).`);
  }

  const absence = await prisma.absence.update({
    where: { id: absenceId },
    data: { status: approve ? AbsenceStatus.VALIDEE : AbsenceStatus.REFUSEE, reviewerId: reviewer.id },
    include: WITH_RELATIONS,
  });

  const now = new Date();
  if (approve && absence.startDate <= now && absence.endDate >= now) {
    await prisma.member.update({
      where: { id: absence.memberId },
      data: { status: MemberStatus.EN_CONGE },
    });
  }

  logger.info(`Absence de ${absence.member.username} ${approve ? 'validée' : 'refusée'}`);

  await recordAudit({
    action: AuditAction.ABSENCE_REVIEWED,
    entityType: AuditEntity.ABSENCE,
    entityId: absence.id,
    actorId: reviewer.id,
    metadata: { target: absence.member.username, decision: approve ? 'validée' : 'refusée' },
  });

  return absence;
}

/**
 * Clôt les absences échues et rétablit le statut des membres concernés.
 *
 * Destinée à un cron quotidien ; renvoie le nombre d'absences traitées.
 */
export async function closeExpiredAbsences(): Promise<number> {
  const now = new Date();

  const expired = await prisma.absence.findMany({
    where: { status: AbsenceStatus.VALIDEE, endDate: { lt: now } },
  });

  for (const absence of expired) {
    await prisma.absence.update({
      where: { id: absence.id },
      data: { status: AbsenceStatus.TERMINEE },
    });

    // Ne réactiver que si le membre était en congé : un membre suspendu
    // entre-temps ne doit pas être réactivé par ce biais.
    await prisma.member.updateMany({
      where: { id: absence.memberId, status: MemberStatus.EN_CONGE },
      data: { status: MemberStatus.ACTIF },
    });
  }

  if (expired.length > 0) {
    logger.info(`${expired.length} absence(s) échue(s) clôturée(s).`);
  }

  return expired.length;
}
