import {
  DecisionStatus,
  Member,
  MeetingStatus,
  Prisma,
  Priority,
} from '@prisma/client';
import prisma from '@database/prisma';
import { recordAudit } from '@modules/audit/services/auditService';
import { AuditAction, AuditEntity } from '@modules/audit/actions';
import logger from '@core/Logger';

export type MeetingWithRelations = Prisma.MeetingGetPayload<{
  include: {
    organizer: true;
    attendees: { include: { member: true } };
    decisions: { include: { decision: true } };
  };
}>;

const WITH_RELATIONS = {
  organizer: true,
  attendees: { include: { member: true } },
  decisions: { include: { decision: true } },
} as const;

export interface CreateMeetingInput {
  title: string;
  agenda?: string;
  scheduledAt: Date;
  organizer: Member;
  attendeeIds?: string[];
}

export async function createMeeting(input: CreateMeetingInput): Promise<MeetingWithRelations> {
  if (input.scheduledAt.getTime() < Date.now()) {
    throw new Error('La date de réunion doit être dans le futur.');
  }

  // L'organisateur est automatiquement participant : il n'a pas à s'ajouter.
  const attendees = new Set([input.organizer.id, ...(input.attendeeIds ?? [])]);

  const meeting = await prisma.meeting.create({
    data: {
      title: input.title,
      agenda: input.agenda,
      scheduledAt: input.scheduledAt,
      organizerId: input.organizer.id,
      attendees: { create: [...attendees].map((memberId) => ({ memberId })) },
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Réunion planifiée : "${meeting.title}" le ${input.scheduledAt.toISOString()}`);

  await recordAudit({
    action: AuditAction.MEETING_CREATED,
    entityType: AuditEntity.MEETING,
    entityId: meeting.id,
    actorId: input.organizer.id,
    metadata: { titre: meeting.title, date: input.scheduledAt.toISOString(), participants: attendees.size },
  });

  return meeting;
}

export async function getMeeting(id: string): Promise<MeetingWithRelations | null> {
  return prisma.meeting.findUnique({ where: { id }, include: WITH_RELATIONS });
}

/** Réunions à venir, pour l'autocomplétion et les rappels automatiques. */
export async function getUpcomingMeetings(limit = 25): Promise<MeetingWithRelations[]> {
  return prisma.meeting.findMany({
    where: { status: MeetingStatus.PLANIFIEE, scheduledAt: { gte: new Date() } },
    include: WITH_RELATIONS,
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  });
}

/** Réunions non encore clôturées, y compris celles dont la date est passée. */
export async function getOpenMeetings(limit = 25): Promise<MeetingWithRelations[]> {
  return prisma.meeting.findMany({
    where: { status: { in: [MeetingStatus.PLANIFIEE, MeetingStatus.EN_COURS] } },
    include: WITH_RELATIONS,
    orderBy: { scheduledAt: 'asc' },
    take: limit,
  });
}

export async function setAttendance(
  meetingId: string,
  memberId: string,
  present: boolean,
): Promise<void> {
  await prisma.meetingAttendee.upsert({
    where: { meetingId_memberId: { meetingId, memberId } },
    create: { meetingId, memberId, present },
    update: { present },
  });
}

export interface CloseMeetingInput {
  meetingId: string;
  summary: string;
  actor: Member;
}

/**
 * Clôture une réunion en y attachant son compte-rendu.
 *
 * Les décisions prises pendant la réunion restent rattachées : elles pourront
 * être converties en tâches via `convertDecisionToTask`.
 */
export async function closeMeeting(input: CloseMeetingInput): Promise<MeetingWithRelations> {
  const current = await prisma.meeting.findUnique({ where: { id: input.meetingId } });
  if (!current) throw new Error('Réunion introuvable.');

  if (current.status === MeetingStatus.TERMINEE) {
    throw new Error('Cette réunion est déjà clôturée.');
  }

  if (current.status === MeetingStatus.ANNULEE) {
    throw new Error('Cette réunion a été annulée.');
  }

  const meeting = await prisma.meeting.update({
    where: { id: input.meetingId },
    data: { status: MeetingStatus.TERMINEE, endedAt: new Date(), summary: input.summary },
    include: WITH_RELATIONS,
  });

  logger.info(`Réunion clôturée : "${meeting.title}"`);

  await recordAudit({
    action: AuditAction.MEETING_CLOSED,
    entityType: AuditEntity.MEETING,
    entityId: meeting.id,
    actorId: input.actor.id,
    metadata: { titre: meeting.title, decisions: meeting.decisions.length },
  });

  return meeting;
}

export async function cancelMeeting(meetingId: string): Promise<void> {
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { status: MeetingStatus.ANNULEE },
  });
}

/**
 * Rattache une décision à une réunion.
 *
 * La décision existe indépendamment (elle peut être proposée hors réunion) ;
 * `MeetingDecision` n'est que le lien entre les deux.
 */
export async function attachDecision(
  meetingId: string,
  decisionId: string,
  note?: string,
): Promise<void> {
  await prisma.meetingDecision.create({ data: { meetingId, decisionId, note } });
}

/**
 * Crée une tâche à partir d'une décision validée.
 *
 * C'est le point de jonction demandé entre réunions et exécution : une décision
 * sans tâche associée reste lettre morte.
 */
export async function convertDecisionToTask(
  decisionId: string,
  assignee: Member | null,
  creator: Member,
  dueDate?: Date,
): Promise<{ taskId: string; title: string }> {
  const decision = await prisma.decision.findUnique({ where: { id: decisionId } });
  if (!decision) throw new Error('Décision introuvable.');

  if (decision.status !== DecisionStatus.VALIDEE) {
    throw new Error('Seule une décision validée peut être convertie en tâche.');
  }

  const task = await prisma.task.create({
    data: {
      title: decision.title,
      description: decision.description,
      creatorId: creator.id,
      assigneeId: assignee?.id,
      priority: Priority.HAUTE,
      dueDate,
    },
  });

  // La décision passe à APPLIQUEE : elle a produit un engagement concret.
  await prisma.decision.update({
    where: { id: decisionId },
    data: { status: DecisionStatus.APPLIQUEE },
  });

  logger.info(`Décision "${decision.title}" convertie en tâche ${task.id}`);

  return { taskId: task.id, title: task.title };
}
