import { CategoryChannel, ChannelType, Guild, GuildBasedChannel } from 'discord.js';
import { PoleName } from '@prisma/client';
import {
  GUILD_STRUCTURE,
  POLE_CHANNELS,
  ChannelConfig,
  buildPoleChannelName,
} from '@config/guildStructure.config';
import { POLES_CONFIG } from '@config/poles.config';
import GuildStructureService from '@services/GuildStructureService';
import {
  buildChannelOverwrites,
  loadPoleRoleIds,
  loadRoleIdMap,
  PoleRoleIds,
  RoleIdMap,
} from '@utils/permissionOverwrites';
import prisma from '@database/prisma';
import logger from '@core/Logger';
import { ProvisionResult } from '../types';

interface ChannelProvisionOutcome {
  categories: ProvisionResult[];
  channels: ProvisionResult[];
}

/**
 * Crée les catégories fixes (Direction, Général, RH, Documents, Archives) et
 * leurs salons.
 */
export async function provisionCoreStructure(guild: Guild): Promise<ChannelProvisionOutcome> {
  const categories: ProvisionResult[] = [];
  const channels: ProvisionResult[] = [];
  const roleIds = await loadRoleIdMap(guild);

  for (const categoryConfig of GUILD_STRUCTURE) {
    const categoryKey = GuildStructureService.categoryKey(categoryConfig.key);

    try {
      const category = await ensureCategory(guild, categoryConfig.name, categoryKey);
      categories.push({ label: categoryConfig.name, action: category.created ? 'created' : 'skipped' });

      for (const channelConfig of categoryConfig.channels) {
        const result = await ensureChannel(
          guild,
          roleIds,
          category.channel,
          channelConfig,
          GuildStructureService.channelKey(channelConfig.key),
        );
        channels.push(result);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Échec du provisioning de la catégorie ${categoryConfig.name}:`, error);
      categories.push({ label: categoryConfig.name, action: 'failed', error: message });
    }
  }

  return { categories, channels };
}

/**
 * Crée une catégorie et les 5 salons standards pour chacun des 8 pôles, et
 * synchronise la table `Pole` en base.
 */
export async function provisionPoles(guild: Guild): Promise<ChannelProvisionOutcome & { poles: ProvisionResult[] }> {
  const poles: ProvisionResult[] = [];
  const channels: ProvisionResult[] = [];
  const roleIds = await loadRoleIdMap(guild);

  for (const poleConfig of Object.values(POLES_CONFIG)) {
    const categoryName = `${poleConfig.emoji} ${poleConfig.displayName}`;
    const categoryKey = GuildStructureService.poleCategoryKey(poleConfig.name);

    try {
      // Les rôles du pôle conditionnent la visibilité de toute la catégorie.
      const poleRoleIds = await loadPoleRoleIds(guild, poleConfig.name);

      const category = await ensureCategory(
        guild,
        categoryName,
        categoryKey,
        buildChannelOverwrites(guild, roleIds, { poleRestricted: true }, poleRoleIds),
      );

      // La table `Pole` est la référence métier (relations projets, annonces…) :
      // on la garde alignée sur la catégorie Discord réellement provisionnée.
      await prisma.pole.upsert({
        where: { name: poleConfig.name },
        create: {
          name: poleConfig.name,
          displayName: poleConfig.displayName,
          emoji: poleConfig.emoji,
          color: poleConfig.color,
          categoryChannelId: category.channel.id,
        },
        update: {
          displayName: poleConfig.displayName,
          emoji: poleConfig.emoji,
          color: poleConfig.color,
          categoryChannelId: category.channel.id,
        },
      });

      for (const channelConfig of POLE_CHANNELS) {
        // Le nom stocké dans POLE_CHANNELS est un modèle : le nom réel est
        // préfixé par le slug du pôle pour éviter les homonymes entre pôles.
        const named: ChannelConfig = {
          ...channelConfig,
          name: buildPoleChannelName(poleConfig.slug, channelConfig, poleConfig.displayName),
        };

        const result = await ensureChannel(
          guild,
          roleIds,
          category.channel,
          named,
          GuildStructureService.poleChannelKey(poleConfig.name, channelConfig.key),
          poleRoleIds,
        );
        channels.push({ ...result, label: `${poleConfig.displayName} › ${result.label}` });
      }

      poles.push({ label: poleConfig.displayName, action: category.created ? 'created' : 'skipped' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Échec du provisioning du pôle ${poleConfig.displayName}:`, error);
      poles.push({ label: poleConfig.displayName, action: 'failed', error: message });
    }
  }

  return { categories: [], channels, poles };
}

/**
 * Retrouve ou crée une catégorie, et mémorise son ID.
 *
 * Recherche d'abord par ID stocké (résiste à un renommage manuel), puis par nom.
 */
async function ensureCategory(
  guild: Guild,
  name: string,
  configKey: string,
  overwrites?: Awaited<ReturnType<typeof buildChannelOverwrites>>,
): Promise<{ channel: CategoryChannel; created: boolean }> {
  const storedId = await GuildStructureService.getChannelId(configKey);

  if (storedId) {
    const existing = guild.channels.cache.get(storedId);
    if (existing?.type === ChannelType.GuildCategory) {
      if (overwrites) await existing.edit({ permissionOverwrites: overwrites });
      return { channel: existing, created: false };
    }
  }

  const byName = guild.channels.cache.find(
    (channel): channel is CategoryChannel =>
      channel.type === ChannelType.GuildCategory && channel.name === name,
  );

  if (byName) {
    if (overwrites) await byName.edit({ permissionOverwrites: overwrites });
    await GuildStructureService.setChannelId(configKey, byName.id);
    return { channel: byName, created: false };
  }

  const category = await guild.channels.create({
    name,
    type: ChannelType.GuildCategory,
    permissionOverwrites: overwrites,
    reason: 'Setup La Scène RP — création de la structure',
  });

  await GuildStructureService.setChannelId(configKey, category.id);
  logger.info(`Catégorie créée : ${name} (${category.id})`);

  return { channel: category, created: true };
}

/**
 * Retrouve ou crée un salon dans une catégorie, et applique ses permissions.
 *
 * Les overwrites sont réappliqués même sur un salon existant : c'est ce qui rend
 * `/setup` utilisable comme commande de réparation après une modification
 * manuelle des permissions.
 */
async function ensureChannel(
  guild: Guild,
  roleIds: RoleIdMap,
  category: CategoryChannel,
  config: ChannelConfig,
  configKey: string,
  poleRoleIds: PoleRoleIds = [],
): Promise<ProvisionResult> {
  try {
    const overwrites = buildChannelOverwrites(guild, roleIds, config, poleRoleIds);
    const existing = await findExistingChannel(
      guild,
      category,
      config.name,
      configKey,
      config.type,
    );

    const isVoice = config.type === ChannelType.GuildVoice;

    if (existing) {
      await existing.edit({
        // Un salon vocal n'a pas de sujet : le transmettre ferait échouer l'édition.
        ...(isVoice ? {} : { topic: config.topic }),
        permissionOverwrites: overwrites,
        parent: category.id,
      });

      await GuildStructureService.setChannelId(configKey, existing.id);
      return { label: config.name, action: 'updated' };
    }

    const channel = await guild.channels.create({
      name: config.name,
      type: isVoice ? ChannelType.GuildVoice : ChannelType.GuildText,
      parent: category.id,
      ...(isVoice ? {} : { topic: config.topic }),
      permissionOverwrites: overwrites,
      reason: 'Setup La Scène RP — création de la structure',
    });

    await GuildStructureService.setChannelId(configKey, channel.id);
    logger.info(`Salon créé : ${config.name} (${channel.id})`);

    return { label: config.name, action: 'created' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Échec du provisioning du salon ${config.name}:`, error);
    return { label: config.name, action: 'failed', error: message };
  }
}

/**
 * Cherche un salon existant par ID mémorisé puis par nom *au sein de la
 * catégorie* — plusieurs pôles ont des salons homonymes, la recherche doit donc
 * être bornée au parent.
 *
 * Le type attendu est vérifié : un salon textuel ne doit pas être retrouvé à la
 * place d'un vocal portant le même nom, ce qui produirait une édition invalide.
 */
async function findExistingChannel(
  guild: Guild,
  category: CategoryChannel,
  name: string,
  configKey: string,
  expectedType: ChannelType = ChannelType.GuildText,
): Promise<(GuildBasedChannel & { edit: Function }) | null> {
  const storedId = await GuildStructureService.getChannelId(configKey);

  if (storedId) {
    const byId = guild.channels.cache.get(storedId);
    if (byId?.type === expectedType) return byId as GuildBasedChannel & { edit: Function };
  }

  const byName = category.children.cache.find(
    (channel) => channel.type === expectedType && channel.name === name,
  );

  return (byName as (GuildBasedChannel & { edit: Function }) | undefined) ?? null;
}
