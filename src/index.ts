import { Events } from 'discord.js';
import { env } from '@config/env';
import ExtendedClient from '@core/Client';
import CommandHandler from '@core/CommandHandler';
import EventHandler from '@core/EventHandler';
import { registerInteractionHandlers } from '@core/InteractionHandler';
import logger from '@core/Logger';
import { connectDatabase, disconnectDatabase } from '@database/prisma';
import initializeJobs, { stopJobs } from '@jobs/index';

async function start(): Promise<void> {
  logger.info('🚀 Démarrage du bot La Scène RP...');

  await connectDatabase();

  const client = new ExtendedClient();
  const commandHandler = new CommandHandler(client);
  const eventHandler = new EventHandler(client);

  await commandHandler.loadCommands();
  await eventHandler.loadEvents();
  registerInteractionHandlers(client);

  // Enregistré AVANT le login : `ready` peut se déclencher dès que la
  // connexion aboutit, un listener posé après risquerait de le manquer.
  client.once(Events.ClientReady, async () => {
    await commandHandler.registerCommands();
    // Les jobs ont besoin d'un client connecté pour publier dans les salons.
    await initializeJobs(client);
  });

  await client.login(env.discordToken);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} reçu — arrêt en cours...`);
    stopJobs();
    await client.destroy();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((error) => {
  logger.error('❌ Échec du démarrage du bot:', error);
  process.exit(1);
});
