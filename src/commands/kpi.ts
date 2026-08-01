import { SlashCommandBuilder } from 'discord.js';
import { Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { handleKpi } from '@modules/roadmap/handlers/miscHandlers';

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('kpi')
    .setDescription('Indicateurs de performance hebdomadaires')
    .addBooleanOption((opt) =>
      opt
        .setName('enregistrer')
        .setDescription('Enregistrer un instantane de la semaine courante'),
    ),
  minGrade: Grade.RESPONSABLE,
  execute: handleKpi,
};

export default command;
