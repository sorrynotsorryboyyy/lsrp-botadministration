import { SlashCommandBuilder } from 'discord.js';
import { Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { handleDashboard } from '@modules/dashboard/handlers/dashboardHandler';

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription("Vue d'ensemble de l'activité de l'organisation")
    .addBooleanOption((opt) =>
      opt.setName('poles').setDescription('Ajouter la répartition par pôle'),
    )
    .addBooleanOption((opt) =>
      opt.setName('public').setDescription('Publier le résultat dans le salon (visible de tous)'),
    ),
  minGrade: Grade.CHEF_EQUIPE,
  execute: handleDashboard,
};

export default command;
