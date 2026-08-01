import {
  ApplicationStatus,
  ApplicationType,
  Grade,
  Member,
  MemberHistoryEventType,
  PoleName,
  Prisma,
  RecruitmentApplication,
} from '@prisma/client';
import prisma from '@database/prisma';
import { recordAudit } from '@modules/audit/services/auditService';
import { AuditAction, AuditEntity } from '@modules/audit/actions';
import logger from '@core/Logger';

/** Candidature accompagnée de ses relations, telle qu'affichée dans les embeds. */
export type ApplicationWithRelations = Prisma.RecruitmentApplicationGetPayload<{
  include: { candidate: true; reviewer: true; targetPole: true };
}>;

const WITH_RELATIONS = { candidate: true, reviewer: true, targetPole: true } as const;

export interface CreateApplicationInput {
  type: ApplicationType;
  candidateDiscordId: string;
  candidatePseudo: string;
  motivation: string;
  targetPole?: PoleName;
  /** Renseigné pour une candidature interne (le candidat est déjà membre). */
  candidateId?: string;
}

/**
 * Crée une candidature en statut « en attente ».
 *
 * Refuse s'il existe déjà une candidature ouverte pour ce Discord ID : sans ce
 * garde-fou, un candidat pourrait inonder `#candidatures` en relançant la
 * commande.
 */
export async function createApplication(
  input: CreateApplicationInput,
): Promise<ApplicationWithRelations> {
  const pending = await findPendingApplication(input.candidateDiscordId);
  if (pending) {
    throw new Error('Une candidature est déjà en cours pour ce membre.');
  }

  const pole = input.targetPole
    ? await prisma.pole.findUnique({ where: { name: input.targetPole } })
    : null;

  const application = await prisma.recruitmentApplication.create({
    data: {
      type: input.type,
      candidateDiscordId: input.candidateDiscordId,
      candidatePseudo: input.candidatePseudo,
      motivation: input.motivation,
      candidateId: input.candidateId,
      targetPoleId: pole?.id,
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Candidature créée : ${input.candidatePseudo} (${input.type})`);

  await recordAudit({
    action: AuditAction.APPLICATION_CREATED,
    entityType: AuditEntity.APPLICATION,
    entityId: application.id,
    actorId: input.candidateId,
    metadata: { candidat: input.candidatePseudo, type: input.type, pole: input.targetPole },
  });

  return application;
}

/** Cherche une candidature encore ouverte (en attente ou en entretien). */
export async function findPendingApplication(
  candidateDiscordId: string,
): Promise<RecruitmentApplication | null> {
  return prisma.recruitmentApplication.findFirst({
    where: {
      candidateDiscordId,
      status: { in: [ApplicationStatus.EN_ATTENTE, ApplicationStatus.EN_ENTRETIEN] },
    },
  });
}

export async function getApplication(id: string): Promise<ApplicationWithRelations | null> {
  return prisma.recruitmentApplication.findUnique({ where: { id }, include: WITH_RELATIONS });
}

/** Bascule une candidature en entretien, sans la clore. */
export async function markUnderReview(
  id: string,
  reviewer: Member,
): Promise<ApplicationWithRelations> {
  return prisma.recruitmentApplication.update({
    where: { id },
    data: { status: ApplicationStatus.EN_ENTRETIEN, reviewerId: reviewer.id },
    include: WITH_RELATIONS,
  });
}

/**
 * Accepte une candidature.
 *
 * Pour un recrutement externe, crée le `Member` correspondant au grade Recrue —
 * la promotion vers un grade supérieur reste une action distincte et explicite
 * (`/rh promouvoir`), pour qu'une validation de candidature ne puisse jamais
 * accorder un grade élevé par inadvertance.
 */
export async function acceptApplication(
  id: string,
  reviewer: Member,
  note?: string,
): Promise<{ application: ApplicationWithRelations; createdMember: Member | null }> {
  const application = await getApplication(id);
  if (!application) throw new Error('Candidature introuvable.');

  assertOpen(application);

  let createdMember: Member | null = null;

  if (application.type === ApplicationType.RECRUTEMENT_EXTERNE && !application.candidateId) {
    createdMember = await prisma.member.upsert({
      where: { discordId: application.candidateDiscordId },
      create: {
        discordId: application.candidateDiscordId,
        username: application.candidatePseudo,
        displayName: application.candidatePseudo,
        grade: Grade.RECRUE,
        poleId: application.targetPoleId,
      },
      update: { poleId: application.targetPoleId },
    });

    await prisma.memberHistory.create({
      data: {
        subjectId: createdMember.id,
        actorId: reviewer.id,
        eventType: MemberHistoryEventType.ARRIVEE,
        details: 'Candidature acceptée',
      },
    });
  }

  const updated = await prisma.recruitmentApplication.update({
    where: { id },
    data: {
      status: ApplicationStatus.ACCEPTEE,
      reviewerId: reviewer.id,
      decisionNote: note,
      decidedAt: new Date(),
      candidateId: application.candidateId ?? createdMember?.id,
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Candidature acceptée : ${application.candidatePseudo} (par ${reviewer.username})`);

  await recordAudit({
    action: AuditAction.APPLICATION_ACCEPTED,
    entityType: AuditEntity.APPLICATION,
    entityId: application.id,
    actorId: reviewer.id,
    metadata: { target: application.candidatePseudo, note },
  });

  return { application: updated, createdMember };
}

export async function rejectApplication(
  id: string,
  reviewer: Member,
  note?: string,
): Promise<ApplicationWithRelations> {
  const application = await getApplication(id);
  if (!application) throw new Error('Candidature introuvable.');

  assertOpen(application);

  const updated = await prisma.recruitmentApplication.update({
    where: { id },
    data: {
      status: ApplicationStatus.REFUSEE,
      reviewerId: reviewer.id,
      decisionNote: note,
      decidedAt: new Date(),
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Candidature refusée : ${application.candidatePseudo} (par ${reviewer.username})`);

  await recordAudit({
    action: AuditAction.APPLICATION_REJECTED,
    entityType: AuditEntity.APPLICATION,
    entityId: application.id,
    actorId: reviewer.id,
    metadata: { target: application.candidatePseudo, note },
  });

  return updated;
}

/**
 * Empêche de statuer deux fois sur la même candidature.
 *
 * Le cas se produit réellement : deux Responsables peuvent cliquer sur les
 * boutons du même embed à quelques secondes d'intervalle.
 */
function assertOpen(application: RecruitmentApplication): void {
  const isClosed =
    application.status === ApplicationStatus.ACCEPTEE ||
    application.status === ApplicationStatus.REFUSEE ||
    application.status === ApplicationStatus.ANNULEE;

  if (isClosed) {
    throw new Error('Cette candidature a déjà été traitée.');
  }
}
