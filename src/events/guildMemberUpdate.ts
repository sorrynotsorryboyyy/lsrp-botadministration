import { Events, GuildMember, PartialGuildMember } from 'discord.js';
import { EventModule } from '@core/EventHandler';
import logger from '@core/Logger';

const event: EventModule = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
    try {
      if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
        const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
        const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));

        if (addedRoles.size > 0 || removedRoles.size > 0) {
          logger.warn(
            `Role change detected for ${newMember.user.tag} (${newMember.id})` +
            `\n  Added: ${addedRoles.map((r) => r.name).join(', ') || 'none'}` +
            `\n  Removed: ${removedRoles.map((r) => r.name).join(', ') || 'none'}` +
            `\n  Note: Role changes outside the bot are not automatically synced to the database.`,
          );
        }
      }
    } catch (error) {
      logger.error(`Error handling guildMemberUpdate:`, error);
    }
  },
};

export default event;
