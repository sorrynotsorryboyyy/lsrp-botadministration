import { SlashCommandBuilder } from 'discord.js';
import { Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { handleAlerts } from '@modules/roadmap/handlers/miscHandlers';

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('alertes')
    .setDescription('Anomalies detectees dans l organisation')
    .addBooleanOption((opt) =>
      opt
        .setName('analyser')
        .setDescription('Relancer la detection au lieu de lire les alertes enregistrees'),
    ),
  minGrade: Grade.RESPONSABLE,
  execute: handleAlerts,
};

export default command;
