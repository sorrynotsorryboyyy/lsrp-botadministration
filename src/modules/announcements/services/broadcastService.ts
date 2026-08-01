import { EmbedBuilder, Guild } from 'discord.js';
import ChannelResolver from '@services/ChannelResolver';
import logger from '@core/Logger';
import { AnnouncementWithRelations, markTargetPublished } from './announcementService';

export interface BroadcastTargetResult {
  poleDisplayName: string;
  delivered: boolean;
  /** Renseigné uniquement en cas d'échec. */
  error?: string;
}

export interface BroadcastReport {
  results: BroadcastTargetResult[];
  deliveredCount: number;
  failedCount: number;
}

/**
 * Publie l'annonce dans le salon `annonces` de chaque pôle destinataire.
 *
 * Un échec sur un pôle (salon supprimé, permissions manquantes) n'interrompt pas
 * la diffusion vers les autres : mieux vaut une annonce partiellement diffusée,
 * signalée comme telle, qu'un échec global sur un seul salon cassé.
 */
export async function broadcastAnnouncement(
  guild: Guild,
  announcement: AnnouncementWithRelations,
  embed: EmbedBuilder,
): Promise<BroadcastReport> {
  const results: BroadcastTargetResult[] = [];

  for (const target of announcement.targets) {
    const poleDisplayName = target.pole.displayName;

    try {
      const channel = await ChannelResolver.getPoleChannel(guild, target.pole.name, 'HUB');

      if (!channel) {
        results.push({
          poleDisplayName,
          delivered: false,
          error: 'salon `annonces` introuvable',
        });
        continue;
      }

      const message = await channel.send({ embeds: [embed] });

      await markTargetPublished(announcement.id, target.poleId, channel.id, message.id);

      results.push({ poleDisplayName, delivered: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn(`Échec de diffusion vers le pôle ${poleDisplayName}:`, error);
      results.push({ poleDisplayName, delivered: false, error: reason });
    }
  }

  const deliveredCount = results.filter((r) => r.delivered).length;

  logger.info(
    `Annonce "${announcement.title}" diffusée : ${deliveredCount}/${results.length} pôle(s)`,
  );

  return {
    results,
    deliveredCount,
    failedCount: results.length - deliveredCount,
  };
}
