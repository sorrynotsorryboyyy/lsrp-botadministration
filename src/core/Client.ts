import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { CommandModule, ButtonHandler, SelectMenuHandler, ModalHandler } from '@apptypes/command.types';

export class ExtendedClient extends Client {
  public commands: Collection<string, CommandModule>;
  public buttons: Collection<string, ButtonHandler>;
  public selectMenus: Collection<string, SelectMenuHandler>;
  public modals: Collection<string, ModalHandler>;

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    this.commands = new Collection();
    this.buttons = new Collection();
    this.selectMenus = new Collection();
    this.modals = new Collection();
  }
}

export default ExtendedClient;
