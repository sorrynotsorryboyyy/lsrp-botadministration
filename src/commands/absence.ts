import { SlashCommandBuilder } from 'discord.js';
import { AbsenceType, Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { handleAbsence } from '@modules/roadmap/handlers/miscHandlers';
import { ABSENCE_TYPE_LABELS } from '@modules/absences/services/absenceService';

const TYPE_CHOICES = Object.values(AbsenceType).map((type) => ({
  name: ABSENCE_TYPE_LABELS[type],
  value: type as string,
}));

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('absence')
    .setDescription('Gestion des absences')
    .addSubcommand((sub) =>
      sub
        .setName('declarer')
        .setDescription('Declarer une absence')
        .addStringOption((opt) =>
          opt.setName('type').setDescription('Type d absence').setRequired(true).addChoices(...TYPE_CHOICES),
        )
        .addStringOption((opt) =>
          opt.setName('debut').setDescription('Date de debut JJ/MM/AAAA').setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('fin').setDescription('Date de fin JJ/MM/AAAA').setRequired(true),
        )
        .addStringOption((opt) => opt.setName('raison').setDescription('Motif').setMaxLength(500)),
    )
    .addSubcommand((sub) =>
      sub.setName('liste').setDescription('Lister les absences en cours'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('valider')
        .setDescription('Valider une demande absence')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('refuser')
        .setDescription('Refuser une demande absence')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true)),
    ),
  minGrade: Grade.RECRUE,
  execute: handleAbsence,
};

export default command;
