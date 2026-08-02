import { ChannelType, Guild, Role } from 'discord.js';
import { Grade, PoleName } from '@prisma/client';
import prisma from '@database/prisma';
import GuildStructureService from '@services/GuildStructureService';
import { GRADE_HIERARCHY } from '@apptypes/grade.types';
import { ROLES_CONFIG } from '@config/roles.config';
import { POLE_ROLES } from '@config/poleRoles.config';
import { GUILD_STRUCTURE, POLE_CHANNELS } from '@config/guildStructure.config';
import { POLES_CONFIG } from '@config/poles.config';
import logger from '@core/Logger';
import { ProtectedTarget, ResetInventory, ResetTarget } from '../types';

/** Préfixes des clés `GuildConfig` créées par le bot, purgées au reset. */
export const MANAGED_KEY_PREFIXES = [
  'ROLE_',
  'POLEROLE_',
  'CATEGORY_',
  'CHANNEL_',
  'POLE_',
  'PANEL_',
];

/**
 * Recense tout ce que `/reset` va détruire, sans rien modifier.
 *
 * L'inventaire est calculé avant toute suppression pour que l'embed de
 * confirmation annonce des chiffres exacts, et pour ne détruire ensuite que ce
 * qui a été explicitement listé — aucune dérive possible entre l'annonce et
 * l'exécution.
 */
export async function buildResetInventory(guild: Guild): Promise<ResetInventory> {
  const seen = new Set<string>();

  const channels: ResetTarget[] = [];
  const categories: ResetTarget[] = [];
  const roles: ResetTarget[] = [];
  const protectedRoles: ProtectedTarget[] = [];

  await collectFromRegistry(guild, seen, channels, categories, roles);
  collectByName(guild, seen, channels, categories, roles);

  // Les rôles intouchables sont retirés de la liste et signalés à part, pour
  // que le rapport explique pourquoi ils survivront.
  const deletableRoles = roles.filter((target) => {
    const role = guild.roles.cache.get(target.id);
    if (!role) return true;

    const reason = getProtectionReason(guild, role);
    if (reason) {
      protectedRoles.push({ label: role.name, reason });
      return false;
    }

    return true;
  });

  const configKeyCount = await countManagedKeys();

  return { channels, categories, roles: deletableRoles, protectedRoles, configKeyCount };
}

/**
 * Source primaire : le registre `GuildConfig`, qui contient les IDs exacts des
 * éléments provisionnés par `/setup`.
 */
async function collectFromRegistry(
  guild: Guild,
  seen: Set<string>,
  channels: ResetTarget[],
  categories: ResetTarget[],
  roles: ResetTarget[],
): Promise<void> {
  for (const grade of GRADE_HIERARCHY) {
    const id = await GuildStructureService.getRoleId(grade);
    const role = id ? guild.roles.cache.get(id) : null;

    if (role && !seen.has(role.id)) {
      seen.add(role.id);
      roles.push({ kind: 'role', id: role.id, label: role.name, source: 'registry' });
    }
  }

  // Les 32 rôles d'appartenance aux pôles suivent le même sort.
  for (const config of POLE_ROLES) {
    const id = await GuildStructureService.get(config.key);
    const role = id ? guild.roles.cache.get(id) : null;

    if (role && !seen.has(role.id)) {
      seen.add(role.id);
      roles.push({ kind: 'role', id: role.id, label: role.name, source: 'registry' });
    }
  }

  const channelKeys = collectExpectedChannelKeys();

  for (const key of channelKeys) {
    const id = await GuildStructureService.getChannelId(key);
    if (!id || seen.has(id)) continue;

    const channel = guild.channels.cache.get(id);
    if (!channel) continue;

    seen.add(id);

    const target: ResetTarget = {
      kind: channel.type === ChannelType.GuildCategory ? 'category' : 'channel',
      id,
      label: channel.name,
      source: 'registry',
    };

    (target.kind === 'category' ? categories : channels).push(target);
  }
}

/**
 * Repli par nom, pour les serveurs dont le registre a été vidé alors que la
 * structure existe encore (reset interrompu, base réinitialisée…).
 *
 * On ne se fie qu'aux noms exacts issus de la configuration : un salon créé à la
 * main et homonyme serait détruit, mais c'est le comportement attendu d'un reset
 * de structure, et l'utilisateur voit la liste avant de confirmer.
 */
function collectByName(
  guild: Guild,
  seen: Set<string>,
  channels: ResetTarget[],
  categories: ResetTarget[],
  roles: ResetTarget[],
): void {
  const roleNames = new Set([
    ...ROLES_CONFIG.map((config) => config.name),
    ...POLE_ROLES.map((config) => config.name),
  ]);
  const categoryNames = new Set<string>();
  const channelNames = new Set<string>();

  for (const category of GUILD_STRUCTURE) {
    categoryNames.add(category.name);
    for (const channel of category.channels) channelNames.add(channel.name);
  }

  for (const pole of Object.values(POLES_CONFIG)) {
    categoryNames.add(`${pole.emoji} ${pole.displayName}`);
    for (const channel of POLE_CHANNELS) {
      channelNames.add(channel.name);
      channelNames.add(`${pole.slug}-${channel.name}`);
      channelNames.add(pole.slug);
    }
  }

  for (const role of guild.roles.cache.values()) {
    if (seen.has(role.id) || !roleNames.has(role.name)) continue;
    seen.add(role.id);
    roles.push({ kind: 'role', id: role.id, label: role.name, source: 'name' });
  }

  for (const channel of guild.channels.cache.values()) {
    if (seen.has(channel.id)) continue;

    if (channel.type === ChannelType.GuildCategory && categoryNames.has(channel.name)) {
      seen.add(channel.id);
      categories.push({ kind: 'category', id: channel.id, label: channel.name, source: 'name' });
      continue;
    }

    if (channel.type === ChannelType.GuildText && channelNames.has(channel.name)) {
      seen.add(channel.id);
      channels.push({ kind: 'channel', id: channel.id, label: channel.name, source: 'name' });
    }
  }
}

/** Toutes les clés de salon et de catégorie que `/setup` a pu écrire. */
function collectExpectedChannelKeys(): string[] {
  const keys: string[] = [];

  for (const category of GUILD_STRUCTURE) {
    keys.push(GuildStructureService.categoryKey(category.key));
    for (const channel of category.channels) {
      keys.push(GuildStructureService.channelKey(channel.key));
    }
  }

  for (const pole of Object.values(POLES_CONFIG)) {
    keys.push(GuildStructureService.poleCategoryKey(pole.name as PoleName));
    for (const channel of POLE_CHANNELS) {
      keys.push(GuildStructureService.poleChannelKey(pole.name as PoleName, channel.key));
    }
  }

  return keys;
}

/**
 * Détermine si un rôle doit être épargné.
 *
 * Trois cas : le rôle `@everyone` (dont l'ID est celui de la guilde), les rôles
 * gérés par Discord (rôle du bot, boosters, intégrations), et les rôles situés
 * au-dessus du bot dans la hiérarchie — Discord refuserait leur suppression.
 */
function getProtectionReason(guild: Guild, role: Role): string | null {
  if (role.id === guild.id) return 'rôle @everyone';
  if (role.managed) return 'rôle géré par Discord (bot ou intégration)';

  const botPosition = guild.members.me?.roles.highest.position ?? 0;
  if (role.position >= botPosition) return 'positionné au-dessus du rôle du bot';

  return null;
}

async function countManagedKeys(): Promise<number> {
  try {
    const rows = await prisma.guildConfig.findMany({ select: { key: true } });
    return rows.filter((row) => MANAGED_KEY_PREFIXES.some((p) => row.key.startsWith(p))).length;
  } catch (error) {
    logger.warn('Impossible de compter les clés de configuration :', error);
    return 0;
  }
}
