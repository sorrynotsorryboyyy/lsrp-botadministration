import { Guild } from 'discord.js';
import { PoleName } from '@prisma/client';
import logger from '@core/Logger';
import { getPanelDefinition, PANEL_DEFINITIONS } from '../registry';
import { ensurePanel } from './panelMessageService';

/**
 * Fenêtre de regroupement des demandes de rafraîchissement.
 *
 * Discord limite l'édition de message à environ 5 requêtes / 5 s par salon. Une
 * salve d'actions (création de plusieurs tâches à la suite) saturerait ce quota
 * et retarderait les réponses d'interaction ; on regroupe donc les demandes
 * portant sur un même panneau.
 */
const DEBOUNCE_MS = 2_000;

interface PendingRefresh {
  guild: Guild;
  panelId: string;
  pole: PoleName | null;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, PendingRefresh>();

function refreshKey(panelId: string, pole: PoleName | null): string {
  return pole ? `${panelId}:${pole}` : panelId;
}

/**
 * Programme le rafraîchissement d'un panneau.
 *
 * Non bloquant et sans await : l'appelant vient de terminer une action métier,
 * il ne doit pas attendre le rendu d'un panneau pour répondre à l'utilisateur.
 */
export function schedulePanelRefresh(
  guild: Guild,
  panelId: string,
  pole: PoleName | null = null,
): void {
  const key = refreshKey(panelId, pole);
  const existing = pending.get(key);

  // Une demande déjà programmée est simplement repoussée : inutile d'éditer
  // deux fois pour deux actions rapprochées.
  if (existing) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => {
    pending.delete(key);
    void runRefresh(guild, panelId, pole);
  }, DEBOUNCE_MS);

  // `unref` évite que ces minuteries maintiennent le process en vie à l'arrêt.
  timer.unref?.();

  pending.set(key, { guild, panelId, pole, timer });
}

async function runRefresh(guild: Guild, panelId: string, pole: PoleName | null): Promise<void> {
  const definition = getPanelDefinition(panelId);

  if (!definition) {
    logger.warn(`Rafraîchissement demandé pour un panneau inconnu : ${panelId}`);
    return;
  }

  await ensurePanel(guild, definition, pole);
}

/**
 * Rafraîchit tous les panneaux.
 *
 * Indispensable périodiquement : certains compteurs dérivent sans action
 * utilisateur — une tâche devient « en retard » par simple écoulement du temps.
 * Sans ce passage régulier, un panneau afficherait indéfiniment un décompte
 * obsolète.
 */
export async function refreshAllPanels(guild: Guild): Promise<number> {
  let refreshed = 0;

  for (const definition of PANEL_DEFINITIONS) {
    if (definition.perPole) {
      for (const pole of Object.values(PoleName)) {
        if (await ensurePanel(guild, definition, pole)) refreshed++;
      }
      continue;
    }

    if (await ensurePanel(guild, definition, null)) refreshed++;
  }

  logger.info(`${refreshed} panneau(x) rafraîchi(s).`);

  return refreshed;
}

/** Annule les rafraîchissements en attente — appelé à l'extinction du bot. */
export function cancelPendingRefreshes(): void {
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
  }
  pending.clear();
}
