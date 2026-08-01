import { Guild, Message, TextChannel } from 'discord.js';
import { PoleName } from '@prisma/client';
import ChannelResolver from '@services/ChannelResolver';
import GuildStructureService from '@services/GuildStructureService';
import logger from '@core/Logger';
import { PanelDefinition, panelMarker } from '../types';

/** Code d'erreur Discord signalant un message inexistant. */
const UNKNOWN_MESSAGE = 10008;

/**
 * Nombre de messages inspectés pour détecter si le panneau est encore en bas.
 *
 * Au-delà, on considère qu'il a trop remonté et on le republie plutôt que de
 * scanner tout l'historique.
 */
const TAIL_SCAN_LIMIT = 5;

/**
 * Crée, retrouve ou met à jour le message épinglé d'un panneau.
 *
 * Idempotent : appelé aussi bien par `/setup` que par chaque rafraîchissement.
 * Ne lève jamais — un panneau est un confort d'affichage, son échec ne doit pas
 * faire échouer l'action métier qui l'a déclenché.
 *
 * @returns `true` si le panneau est en place à l'issue de l'appel.
 */
export async function ensurePanel(
  guild: Guild,
  definition: PanelDefinition,
  pole: PoleName | null,
): Promise<boolean> {
  try {
    const channel = await resolveChannel(guild, definition, pole);
    if (!channel) return false;

    const render = await definition.render({ guild, pole });
    const payload = { embeds: render.embeds, components: render.components };

    const existing = await findExistingMessage(channel, definition, pole);

    if (existing) {
      // Un panneau enseveli sous des messages ne remplit plus son rôle : on le
      // republie en bas plutôt que de l'éditer sur place.
      if (await isBuriedInChannel(channel, existing)) {
        await existing.delete().catch(() => undefined);
        return publishPanel(channel, definition, pole, payload);
      }

      await existing.edit(payload);
      await GuildStructureService.setPanelMessageId(definition.id, pole, existing.id);
      return true;
    }

    return publishPanel(channel, definition, pole, payload);
  } catch (error) {
    logger.warn(`Échec de mise en place du panneau ${definition.id} :`, error);
    return false;
  }
}

async function resolveChannel(
  guild: Guild,
  definition: PanelDefinition,
  pole: PoleName | null,
): Promise<TextChannel | null> {
  return definition.perPole && pole
    ? ChannelResolver.getPoleChannel(guild, pole, definition.channelKey)
    : ChannelResolver.getChannel(guild, definition.channelKey);
}

/**
 * Retrouve le message du panneau, d'abord par son ID mémorisé, puis en dernier
 * recours parmi les épingles.
 */
async function findExistingMessage(
  channel: TextChannel,
  definition: PanelDefinition,
  pole: PoleName | null,
): Promise<Message | null> {
  const storedId = await GuildStructureService.getPanelMessageId(definition.id, pole);

  if (storedId) {
    try {
      return await channel.messages.fetch(storedId);
    } catch (error) {
      const code = (error as { code?: number }).code;

      // Erreur réseau ou permission : on abandonne sans republier, sinon un
      // incident passager créerait un doublon à chaque tentative.
      if (code !== UNKNOWN_MESSAGE) {
        logger.warn(`Panneau ${definition.id} : message ${storedId} illisible.`, error);
        return null;
      }
    }
  }

  // Repli : le registre a pu être vidé alors que le message existe toujours.
  return findPinnedByMarker(channel, definition, pole);
}

async function findPinnedByMarker(
  channel: TextChannel,
  definition: PanelDefinition,
  pole: PoleName | null,
): Promise<Message | null> {
  try {
    const pinned = await channel.messages.fetchPinned();
    const marker = panelMarker(definition.id, pole);

    return (
      pinned.find(
        (message) =>
          message.author.id === channel.client.user?.id &&
          message.embeds.some((embed) => embed.footer?.text?.includes(marker)),
      ) ?? null
    );
  } catch (error) {
    logger.warn(`Panneau ${definition.id} : lecture des épingles impossible.`, error);
    return null;
  }
}

/** Vrai si d'autres messages sont passés après le panneau. */
async function isBuriedInChannel(channel: TextChannel, panel: Message): Promise<boolean> {
  try {
    const recent = await channel.messages.fetch({ limit: TAIL_SCAN_LIMIT });
    const newest = recent.first();

    return newest !== undefined && newest.id !== panel.id;
  } catch {
    // En cas de doute, on ne republie pas : mieux vaut un panneau mal placé
    // qu'un panneau dupliqué à chaque rafraîchissement.
    return false;
  }
}

async function publishPanel(
  channel: TextChannel,
  definition: PanelDefinition,
  pole: PoleName | null,
  payload: { embeds: unknown[]; components: unknown[] },
): Promise<boolean> {
  const message = await channel.send(payload as Parameters<TextChannel['send']>[0]);

  // L'épinglage est un confort de navigation : son échec (limite de 50 épingles,
  // permission manquante) ne doit pas invalider le panneau lui-même.
  await message.pin().catch((error) => {
    logger.warn(`Panneau ${definition.id} : épinglage impossible.`, error);
  });

  await GuildStructureService.setPanelMessageId(definition.id, pole, message.id);

  logger.info(`Panneau ${definition.id} publié dans #${channel.name}.`);

  return true;
}
