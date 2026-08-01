import { Events, ActivityType, Client } from 'discord.js';
import ExtendedClient from '@core/Client';
import { EventModule } from '@core/EventHandler';
import logger from '@core/Logger';

/**
 * L'enregistrement des slash commands est fait dans `src/index.ts` (il a besoin
 * du CommandHandler). Cet event ne gère que l'état de présence et le log.
 */
const event: EventModule = {
  name: Events.ClientReady,
  once: true,
  async execute(client: Client): Promise<void> {
    const extended = client as ExtendedClient;

    logger.info(`✓ Connecté en tant que ${client.user?.tag}`);
    logger.info(`✓ ${extended.commands.size} commande(s) chargée(s)`);

    client.user?.setActivity('l\'administration', { type: ActivityType.Watching });
  },
};

export default event;
