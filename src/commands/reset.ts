import { SlashCommandBuilder } from 'discord.js';
import { Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { handleReset } from '@modules/reset/handlers/resetHandler';

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('reset')
    .setDescription('Supprime toute la structure du serveur (salons, catégories, rôles)'),
  minGrade: Grade.FONDATEUR,
  execute: handleReset,
};

export default command;
