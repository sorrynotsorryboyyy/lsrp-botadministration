import { SlashCommandBuilder } from 'discord.js';
import { Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { handleSetup } from '@modules/setup/handlers/setupHandler';

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Crée ou répare la structure complète du serveur (rôles, catégories, salons)'),
  minGrade: Grade.FONDATEUR,
  execute: handleSetup,
};

export default command;
