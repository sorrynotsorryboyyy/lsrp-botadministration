import { Events, Interaction } from 'discord.js';
import { ExtendedClient } from '@core/Client';
import ErrorHandler from '@core/ErrorHandler';
import { EventModule } from '@core/EventHandler';
import permissionMiddleware from '@middlewares/permissionMiddleware';
import logger from '@core/Logger';

/**
 * Routeur central de toutes les interactions.
 *
 * Les slash commands passent par `client.commands` ; les boutons, select menus
 * et modals sont dispatchés vers leur module d'après le préfixe de `customId`
 * (convention `<module>:<action>:<entityId>`).
 */
const event: EventModule = {
  name: Events.InteractionCreate,
  async execute(interaction: Interaction) {
    const client = interaction.client as ExtendedClient;

    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
          logger.warn(`No command found for /${interaction.commandName}`);
          return;
        }

        const hasPermission = await permissionMiddleware(interaction, command.minGrade);
        if (!hasPermission) return;

        await command.execute(interaction);
      } else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);

        // Discord ferme la fenêtre au bout de 3 secondes : on ne fait ni
        // vérification de permission ni traitement lourd ici.
        await command?.autocomplete?.(interaction);
      } else if (interaction.isButton()) {
        const prefix = interaction.customId.split(':')[0];
        const handler = client.buttons.get(prefix);

        if (!handler) {
          logger.warn(`No button handler found for prefix: ${prefix}`);
          return;
        }

        await handler.execute(interaction);
      } else if (interaction.isStringSelectMenu()) {
        const prefix = interaction.customId.split(':')[0];
        const handler = client.selectMenus.get(prefix);

        if (!handler) {
          logger.warn(`No select menu handler found for prefix: ${prefix}`);
          return;
        }

        await handler.execute(interaction);
      } else if (interaction.isModalSubmit()) {
        const prefix = interaction.customId.split(':')[0];
        const handler = client.modals.get(prefix);

        if (!handler) {
          logger.warn(`No modal handler found for prefix: ${prefix}`);
          return;
        }

        await handler.execute(interaction);
      }
    } catch (error) {
      logger.error('Error handling interaction:', error);
      await ErrorHandler.handle(interaction, error);
    }
  },
};

export default event;
