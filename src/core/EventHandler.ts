import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import ExtendedClient from './Client';
import logger from './Logger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface EventModule {
  name: string;
  once?: boolean;
  execute: (...args: any[]) => Promise<void>;
}

export class EventHandler {
  private client: ExtendedClient;

  constructor(client: ExtendedClient) {
    this.client = client;
  }

  async loadEvents(): Promise<void> {
    const eventsPath = join(__dirname, '..', 'events');
    const eventFiles = readdirSync(eventsPath).filter((file) => file.endsWith('.ts') || file.endsWith('.js'));

    logger.info(`Loading ${eventFiles.length} event(s)...`);

    for (const file of eventFiles) {
      try {
        const module = await import(`file://${join(eventsPath, file)}`);
        const event: EventModule = module.default;

        if (!event.name || !event.execute) {
          logger.warn(`Event file ${file} is missing name or execute property`);
          continue;
        }

        if (event.once) {
          this.client.once(event.name, (...args) => event.execute(...args));
        } else {
          this.client.on(event.name, (...args) => event.execute(...args));
        }

        logger.info(`✓ Loaded event: ${event.name}`);
      } catch (error) {
        logger.error(`Error loading event ${file}:`, error);
      }
    }
  }
}

export default EventHandler;
