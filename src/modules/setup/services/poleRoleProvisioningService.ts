import { Guild, Role } from 'discord.js';
import GuildStructureService from '@services/GuildStructureService';
import { POLE_ROLES, PoleRoleConfig } from '@config/poleRoles.config';
import logger from '@core/Logger';
import { ProvisionResult } from '../types';

/**
 * Crée les 32 rôles d'appartenance aux pôles (4 rangs × 8 pôles).
 *
 * Ces rôles sont indépendants de la hiérarchie business : ils décrivent
 * l'appartenance opérationnelle à une entité (staff en jeu, équipe web…) et
 * conditionnent la visibilité de la catégorie correspondante.
 *
 * Idempotent, comme `provisionRoles` : recherche par ID mémorisé puis par nom.
 */
export async function provisionPoleRoles(guild: Guild): Promise<ProvisionResult[]> {
  const results: ProvisionResult[] = [];
  const provisioned: Role[] = [];

  for (const config of POLE_ROLES) {
    try {
      const existing = await findExisting(guild, config);

      if (existing) {
        await existing.edit({
          color: config.color,
          hoist: config.hoist,
          mentionable: config.mentionable,
          permissions: config.permissions,
        });

        await GuildStructureService.set(config.key, existing.id);
        provisioned.push(existing);
        results.push({ label: config.name, action: 'updated' });
        continue;
      }

      const role = await guild.roles.create({
        name: config.name,
        color: config.color,
        hoist: config.hoist,
        mentionable: config.mentionable,
        permissions: config.permissions,
        reason: 'Setup La Scène RP — rôles de pôle',
      });

      await GuildStructureService.set(config.key, role.id);
      provisioned.push(role);
      results.push({ label: config.name, action: 'created' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Échec du provisioning du rôle de pôle ${config.name} :`, error);
      results.push({ label: config.name, action: 'failed', error: message });
    }
  }

  logger.info(`${provisioned.length} rôle(s) de pôle provisionné(s).`);

  return results;
}

async function findExisting(guild: Guild, config: PoleRoleConfig): Promise<Role | null> {
  const storedId = await GuildStructureService.get(config.key);

  if (storedId) {
    const byId = guild.roles.cache.get(storedId);
    if (byId) return byId;
  }

  return guild.roles.cache.find((role) => role.name === config.name) ?? null;
}
