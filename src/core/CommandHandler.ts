import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { CommandModule } from '@apptypes/command.types';
import ExtendedClient from './Client';
import logger from './Logger';
import { env } from '@config/env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class CommandHandler {
  private client: ExtendedClient;
  private rest: REST;

  constructor(client: ExtendedClient) {
    this.client = client;
    this.rest = new REST({ version: '10' }).setToken(env.discordToken);
  }

  async loadCommands(): Promise<void> {
    const commandsPath = join(__dirname, '..', 'commands');
    const commandFiles = readdirSync(commandsPath).filter((file) => file.endsWith('.ts') || file.endsWith('.js'));

    logger.info(`Loading ${commandFiles.length} command(s)...`);

    for (const file of commandFiles) {
      try {
        const module = await import(`file://${join(commandsPath, file)}`);
        const command: CommandModule = module.default;

        if (!command.data || !command.execute) {
          logger.warn(`Command file ${file} is missing data or execute property`);
          continue;
        }

        this.client.commands.set(command.data.name, command);
        logger.info(`✓ Loaded command: ${command.data.name}`);
      } catch (error) {
        logger.error(`Error loading command ${file}:`, error);
      }
    }
  }

  async registerCommands(): Promise<void> {
    const commands = Array.from(this.client.commands.values()).map((cmd) => cmd.data.toJSON());

    try {
      logger.info(`Registering ${commands.length} command(s) to Discord...`);

      await this.rest.put(Routes.applicationGuildCommands(this.client.user!.id, env.guildId), {
        body: commands,
      });

      logger.info('✓ Slash commands registered successfully');
    } catch (error) {
      logger.error('Error registering commands:', error);
    }
  }
}

export default CommandHandler;
