import { Guild, TextChannel, ChannelType } from 'discord.js';
import { PoleName } from '@prisma/client';
import GuildStructureService from './GuildStructureService';
import logger from '@core/Logger';

/**
 * Résout les salons provisionnés par `/setup` à partir du registre `GuildConfig`.
 *
 * Renvoie systématiquement `null` plutôt que de lever : un salon supprimé à la
 * main ne doit jamais faire échouer une action métier — l'appelant décide s'il
 * dégrade (log seul) ou s'il avertit l'utilisateur.
 */
export class ChannelResolver {
  /** Résout un salon de la structure fixe, par sa clé (ex. `RH_CANDIDATURES`). */
  static async getChannel(guild: Guild, channelKey: string): Promise<TextChannel | null> {
    const id = await GuildStructureService.getChannelId(GuildStructureService.channelKey(channelKey));
    return this.fetchTextChannel(guild, id, channelKey);
  }

  /** Résout un salon appartenant à un pôle (ex. `ANNONCES` du pôle WEB). */
  static async getPoleChannel(
    guild: Guild,
    pole: PoleName,
    channelKey: string,
  ): Promise<TextChannel | null> {
    const id = await GuildStructureService.getPoleChannelId(pole, channelKey);
    return this.fetchTextChannel(guild, id, `${pole}/${channelKey}`);
  }

  private static async fetchTextChannel(
    guild: Guild,
    id: string | null,
    label: string,
  ): Promise<TextChannel | null> {
    if (!id) {
      logger.warn(`Salon "${label}" absent du registre — exécutez /setup.`);
      return null;
    }

    try {
      // `fetch` plutôt que le cache : un salon peut ne pas y être au démarrage.
      const channel = await guild.channels.fetch(id);

      if (channel?.type !== ChannelType.GuildText) {
        logger.warn(`Salon "${label}" (${id}) introuvable ou n'est pas un salon texte.`);
        return null;
      }

      return channel;
    } catch (error) {
      logger.warn(`Échec de la résolution du salon "${label}" (${id}):`, error);
      return null;
    }
  }
}

export default ChannelResolver;
