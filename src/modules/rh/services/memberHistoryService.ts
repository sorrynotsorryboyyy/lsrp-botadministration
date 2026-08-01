import { Member, Prisma } from '@prisma/client';
import prisma from '@database/prisma';

export type HistoryEntry = Prisma.MemberHistoryGetPayload<{ include: { actor: true } }>;

export interface MemberDossier {
  member: Member & { pole: { displayName: string } | null };
  history: HistoryEntry[];
  warningCount: number;
  sanctionCount: number;
  promotionCount: number;
}

/** Nombre d'événements d'historique remontés par défaut. */
const HISTORY_LIMIT = 15;

/**
 * Assemble le dossier RH complet d'un membre.
 *
 * Les compteurs sont calculés côté base plutôt qu'en comptant les entrées
 * d'historique : l'historique est tronqué à `HISTORY_LIMIT` et donnerait des
 * totaux faux.
 */
export async function getMemberDossier(memberId: string): Promise<MemberDossier | null> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { pole: { select: { displayName: true } } },
  });

  if (!member) return null;

  const [history, warningCount, sanctionCount, promotionCount] = await Promise.all([
    prisma.memberHistory.findMany({
      where: { subjectId: memberId },
      include: { actor: true },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    }),
    prisma.warning.count({ where: { targetId: memberId } }),
    prisma.sanction.count({ where: { targetId: memberId } }),
    prisma.promotionHistory.count({ where: { targetId: memberId } }),
  ]);

  return { member, history, warningCount, sanctionCount, promotionCount };
}
