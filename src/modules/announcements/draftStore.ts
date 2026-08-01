import { AnnouncementPriority } from '@prisma/client';
import logger from '@core/Logger';

export interface AnnouncementDraft {
  title: string;
  content: string;
  priority: AnnouncementPriority;
  authorDiscordId: string;
  createdAt: number;
}

/** Un brouillon abandonné est purgé au bout de ce délai. */
const DRAFT_TTL_MS = 10 * 60 * 1000;

/**
 * Stockage temporaire des annonces en cours de rédaction.
 *
 * La création se déroule en deux temps (saisie, puis choix des pôles) : le
 * contenu doit survivre entre les deux interactions. Il n'est volontairement pas
 * persisté en base — un brouillon abandonné ne doit pas laisser de trace, et un
 * redémarrage du bot n'a pas à conserver des saisies non validées.
 */
const drafts = new Map<string, AnnouncementDraft>();

export function saveDraft(id: string, draft: Omit<AnnouncementDraft, 'createdAt'>): void {
  purgeExpired();
  drafts.set(id, { ...draft, createdAt: Date.now() });
}

/**
 * Récupère un brouillon et le retire du stockage.
 *
 * La lecture est destructive : un brouillon ne sert qu'une fois, ce qui évite
 * qu'un double clic sur le select menu ne publie l'annonce deux fois.
 */
export function consumeDraft(id: string): AnnouncementDraft | null {
  purgeExpired();

  const draft = drafts.get(id);
  if (!draft) return null;

  drafts.delete(id);
  return draft;
}

function purgeExpired(): void {
  const now = Date.now();
  let purged = 0;

  for (const [id, draft] of drafts) {
    if (now - draft.createdAt > DRAFT_TTL_MS) {
      drafts.delete(id);
      purged++;
    }
  }

  if (purged > 0) {
    logger.debug(`${purged} brouillon(s) d'annonce expiré(s) purgé(s).`);
  }
}
