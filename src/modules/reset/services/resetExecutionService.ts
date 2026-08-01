import { Guild } from 'discord.js';
import prisma from '@database/prisma';
import logger from '@core/Logger';
import { ResetInventory, ResetOutcome, ResetReport, ResetTarget } from '../types';
import { MANAGED_KEY_PREFIXES } from './resetInventoryService';

/** Code d'erreur Discord signalant une ressource déjà absente. */
const UNKNOWN_RESOURCE_CODES = [10003, 10011, 10008];

/**
 * Détruit les éléments inventoriés puis purge le registre.
 *
 * L'ordre est important : salons, puis catégories, puis rôles. Supprimer les
 * rôles d'abord laisserait des permission overwrites orphelins sur les salons
 * pendant la fenêtre de suppression, et rendrait les journaux illisibles.
 */
export async function executeReset(guild: Guild, inventory: ResetInventory): Promise<ResetReport> {
  const startedAt = Date.now();
  const outcomes: ResetOutcome[] = [];

  for (const target of inventory.channels) {
    outcomes.push(await deleteChannel(guild, target));
  }

  for (const target of inventory.categories) {
    outcomes.push(await deleteChannel(guild, target));
  }

  for (const target of inventory.roles) {
    outcomes.push(await deleteRole(guild, target));
  }

  const purgedKeys = await purgeRegistry();

  const report: ResetReport = { outcomes, purgedKeys, durationMs: Date.now() - startedAt };

  logger.warn(
    `Reset exécuté sur ${guild.name} : ${outcomes.length} élément(s) traité(s), ` +
      `${purgedKeys} clé(s) de configuration purgée(s).`,
  );

  return report;
}

async function deleteChannel(guild: Guild, target: ResetTarget): Promise<ResetOutcome> {
  try {
    const channel = guild.channels.cache.get(target.id);

    // Supprimé manuellement entre l'inventaire et l'exécution : ce n'est pas
    // une erreur, l'état final visé est atteint.
    if (!channel) {
      return { label: target.label, kind: target.kind, action: 'already_gone' };
    }

    await channel.delete('Reset de la structure La Scène RP');
    return { label: target.label, kind: target.kind, action: 'deleted' };
  } catch (error) {
    return toOutcome(target, error);
  }
}

async function deleteRole(guild: Guild, target: ResetTarget): Promise<ResetOutcome> {
  try {
    const role = guild.roles.cache.get(target.id);

    if (!role) {
      return { label: target.label, kind: target.kind, action: 'already_gone' };
    }

    await role.delete('Reset de la structure La Scène RP');
    return { label: target.label, kind: target.kind, action: 'deleted' };
  } catch (error) {
    return toOutcome(target, error);
  }
}

function toOutcome(target: ResetTarget, error: unknown): ResetOutcome {
  const code = (error as { code?: number }).code;

  if (code && UNKNOWN_RESOURCE_CODES.includes(code)) {
    return { label: target.label, kind: target.kind, action: 'already_gone' };
  }

  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Échec de suppression de ${target.kind} "${target.label}" :`, error);

  return { label: target.label, kind: target.kind, action: 'failed', error: message };
}

/**
 * Vide les clés du registre créées par le bot.
 *
 * Les données métier (membres, projets, historique) ne sont jamais touchées :
 * seuls les identifiants Discord, devenus caducs, disparaissent. Un `/setup`
 * ultérieur recrée la structure et retrouve les données existantes.
 */
async function purgeRegistry(): Promise<number> {
  try {
    const result = await prisma.guildConfig.deleteMany({
      where: { OR: MANAGED_KEY_PREFIXES.map((prefix) => ({ key: { startsWith: prefix } })) },
    });

    // Les pôles conservent leur ligne en base (relations projets, annonces…),
    // mais leur référence de catégorie Discord n'a plus de sens.
    await prisma.pole.updateMany({ data: { categoryChannelId: null } });

    return result.count;
  } catch (error) {
    logger.error('Échec de la purge du registre :', error);
    return 0;
  }
}
