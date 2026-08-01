import { Guild, Role } from 'discord.js';
import { Grade } from '@prisma/client';
import { ROLES_CONFIG } from '@config/roles.config';
import GuildStructureService from '@services/GuildStructureService';
import logger from '@core/Logger';
import { ProvisionResult } from '../types';

/**
 * Crée (ou met à jour) les 9 rôles de la hiérarchie.
 *
 * Idempotent : un rôle est retrouvé en priorité par l'ID mémorisé dans
 * `GuildConfig`, puis à défaut par son nom exact. On ne crée un rôle que si
 * aucune des deux pistes n'aboutit, ce qui permet de relancer `/setup` sans
 * dupliquer et de réparer des permissions modifiées à la main.
 *
 * Les rôles sont créés dans l'ordre de `ROLES_CONFIG` (du plus élevé au plus
 * bas) puis repositionnés en fin de passe, car la position d'un rôle ne peut
 * être fixée de façon fiable qu'une fois tous les rôles existants.
 */
export async function provisionRoles(guild: Guild): Promise<ProvisionResult[]> {
  const results: ProvisionResult[] = [];
  const provisioned: Role[] = [];

  for (const config of ROLES_CONFIG) {
    try {
      const existing = await findExistingRole(guild, config.name, config.grade);

      if (existing) {
        await existing.edit({
          color: config.color,
          hoist: config.hoist,
          mentionable: config.mentionable,
          permissions: config.permissions,
        });

        await GuildStructureService.setRoleId(config.grade, existing.id);
        provisioned.push(existing);
        results.push({ label: config.name, action: 'updated' });
        logger.info(`Rôle mis à jour : ${config.name} (${existing.id})`);
        continue;
      }

      const role = await guild.roles.create({
        name: config.name,
        color: config.color,
        hoist: config.hoist,
        mentionable: config.mentionable,
        permissions: config.permissions,
        reason: 'Setup La Scène RP — création de la hiérarchie',
      });

      await GuildStructureService.setRoleId(config.grade, role.id);
      provisioned.push(role);
      results.push({ label: config.name, action: 'created' });
      logger.info(`Rôle créé : ${config.name} (${role.id})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Échec du provisioning du rôle ${config.name}:`, error);
      results.push({ label: config.name, action: 'failed', error: message });
    }
  }

  await applyRolePositions(guild, provisioned);

  return results;
}

/**
 * Retrouve un rôle déjà provisionné, d'abord via l'ID en base (résistant à un
 * renommage manuel du rôle), sinon par nom exact (cas d'une base réinitialisée
 * sur un serveur déjà configuré).
 */
async function findExistingRole(guild: Guild, name: string, grade: Grade): Promise<Role | null> {
  const storedId = await GuildStructureService.getRoleId(grade);
  if (storedId) {
    const byId = guild.roles.cache.get(storedId);
    if (byId) return byId;
  }

  return guild.roles.cache.find((role) => role.name === name) ?? null;
}

/**
 * Ordonne les rôles pour refléter la hiérarchie métier.
 *
 * Discord classe les rôles par position croissante (0 = tout en bas). Le rôle le
 * plus élevé de `ROLES_CONFIG` doit donc recevoir la position la plus haute.
 * Un échec ici n'est pas bloquant : les rôles existent et le bot fonctionne, seul
 * l'affichage dans la liste Discord est affecté.
 */
async function applyRolePositions(guild: Guild, roles: Role[]): Promise<void> {
  if (roles.length === 0) return;

  try {
    const botHighest = guild.members.me?.roles.highest.position ?? 0;

    // On se place strictement sous le rôle du bot : Discord refuse de déplacer
    // un rôle au-dessus du sien.
    const positions = roles.map((role, index) => ({
      role: role.id,
      position: Math.max(1, botHighest - 1 - index),
    }));

    await guild.roles.setPositions(positions);
    logger.info('Positions des rôles hiérarchiques appliquées');
  } catch (error) {
    logger.warn(
      'Impossible d\'ordonner les rôles (le rôle du bot est probablement trop bas dans la liste) :',
      error,
    );
  }
}
