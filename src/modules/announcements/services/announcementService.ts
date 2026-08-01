import { AnnouncementPriority, Member, PoleName, Prisma } from '@prisma/client';
import prisma from '@database/prisma';
import { recordAudit } from '@modules/audit/services/auditService';
import { AuditAction, AuditEntity } from '@modules/audit/actions';
import logger from '@core/Logger';

export type AnnouncementWithRelations = Prisma.AnnouncementGetPayload<{
  include: { author: true; targets: { include: { pole: true } } };
}>;

const WITH_RELATIONS = {
  author: true,
  targets: { include: { pole: true } },
} as const;

export interface CreateAnnouncementInput {
  title: string;
  content: string;
  priority: AnnouncementPriority;
  author: Member;
  poles: PoleName[];
}

/**
 * Enregistre une annonce et ses pôles destinataires.
 *
 * La diffusion Discord est faite séparément (`broadcastAnnouncement`) : l'annonce
 * doit exister en base même si l'envoi échoue, pour rester rejouable.
 */
export async function createAnnouncement(
  input: CreateAnnouncementInput,
): Promise<AnnouncementWithRelations> {
  if (input.poles.length === 0) {
    throw new Error('Sélectionnez au moins un pôle destinataire.');
  }

  const poles = await prisma.pole.findMany({ where: { name: { in: input.poles } } });

  if (poles.length === 0) {
    throw new Error('Aucun pôle valide trouvé en base. Exécutez `/setup`.');
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: input.title,
      content: input.content,
      priority: input.priority,
      authorId: input.author.id,
      targets: { create: poles.map((pole) => ({ poleId: pole.id })) },
    },
    include: WITH_RELATIONS,
  });

  logger.info(
    `Annonce créée : "${announcement.title}" → ${poles.length} pôle(s), par ${input.author.username}`,
  );

  await recordAudit({
    action: AuditAction.ANNOUNCEMENT_PUBLISHED,
    entityType: AuditEntity.ANNOUNCEMENT,
    entityId: announcement.id,
    actorId: input.author.id,
    metadata: { titre: announcement.title, priorite: input.priority, poles: poles.length },
  });

  return announcement;
}

export async function getAnnouncement(id: string): Promise<AnnouncementWithRelations | null> {
  return prisma.announcement.findUnique({ where: { id }, include: WITH_RELATIONS });
}

/**
 * Mémorise le message publié pour un pôle donné.
 *
 * Conserver `messageId` permettra plus tard de modifier ou de retirer une annonce
 * diffusée, sans avoir à la rechercher dans l'historique du salon.
 */
export async function markTargetPublished(
  announcementId: string,
  poleId: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  await prisma.announcementPoleTarget.update({
    where: { announcementId_poleId: { announcementId, poleId } },
    data: { channelId, messageId, publishedAt: new Date() },
  });
}

/** Dernières annonces, pour le futur dashboard. */
export async function getRecentAnnouncements(limit = 5): Promise<AnnouncementWithRelations[]> {
  return prisma.announcement.findMany({
    include: WITH_RELATIONS,
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
