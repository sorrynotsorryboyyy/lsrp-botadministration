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
      const stored = await channel.messages.fetch(storedId);

      // Purge des exemplaires concurrents avant de rendre celui de référence :
      // un incident passé a pu en laisser plusieurs épinglés.
      await removeDuplicates(channel, definition, pole, stored.id);

      return stored;
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

    const matching = pinned.filter(
      (message) =>
        message.author.id === channel.client.user?.id &&
        message.embeds.some((embed) => embed.footer?.text?.includes(marker)),
    );

    if (matching.size === 0) return null;

    // Plusieurs exemplaires possibles : on retient le plus récent et on purge
    // les autres, sinon ils s'accumuleraient à chaque incident.
    const sorted = [...matching.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    const keep = sorted[0];

    await removeDuplicates(channel, definition, pole, keep.id);

    return keep;
  } catch (error) {
    logger.warn(`Panneau ${definition.id} : lecture des épingles impossible.`, error);
    return null;
  }
}

/**
 * Supprime les exemplaires épinglés du panneau autres que celui de référence.
 *
 * Ne lève jamais : le nettoyage est un confort, son échec ne doit pas empêcher
 * le panneau de s'afficher.
 */
async function removeDuplicates(
  channel: TextChannel,
  definition: PanelDefinition,
  pole: PoleName | null,
  keepId: string,
): Promise<void> {
  try {
    const pinned = await channel.messages.fetchPinned();
    const marker = panelMarker(definition.id, pole);

    for (const message of pinned.values()) {
      if (message.id === keepId) continue;
      if (message.author.id !== channel.client.user?.id) continue;
      if (!message.embeds.some((embed) => embed.footer?.text?.includes(marker))) continue;

      await message.delete().catch(() => undefined);
      logger.info(`Panneau ${definition.id} : doublon supprimé (${message.id}).`);
    }
  } catch (error) {
    logger.warn(`Panneau ${definition.id} : nettoyage des doublons impossible.`, error);
  }
}

/**
 * Vrai si des messages d'utilisateurs sont passés après le panneau.
 *
 * Deux catégories de messages sont ignorées, sans quoi tout panneau se croirait
 * systématiquement enseveli et se republierait à chaque passage du cron :
 *
 * - les messages système, dont le « X a épinglé un message » que Discord poste
 *   juste après notre propre `pin()` ;
 * - les autres panneaux et fiches du bot, un salon hub n'étant alimenté que par
 *   lui.
 */
async function isBuriedInChannel(channel: TextChannel, panel: Message): Promise<boolean> {
  try {
    const recent = await channel.messages.fetch({ limit: TAIL_SCAN_LIMIT });

    const blocking = recent.filter(
      (message) =>
        message.id !== panel.id &&
        message.system !== true &&
        message.author.id !== channel.client.user?.id &&
        // `createdTimestamp` plutôt que l'ordre de la collection : un message
        // antérieur au panneau ne l'enterre pas.
        message.createdTimestamp > panel.createdTimestamp,
    );

    return blocking.size > 0;
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
