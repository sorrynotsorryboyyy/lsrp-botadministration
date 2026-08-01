import { SlashCommandBuilder } from 'discord.js';
import { Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { handleMeeting, handleMeetingAutocomplete } from '@modules/meetings/handlers/meetingHandler';

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('reunion')
    .setDescription('Gestion des réunions')
    .addSubcommand((sub) =>
      sub
        .setName('planifier')
        .setDescription('Planifier une réunion')
        .addStringOption((opt) =>
          opt.setName('titre').setDescription('Objet de la réunion').setRequired(true).setMaxLength(150),
        )
        .addStringOption((opt) =>
          opt.setName('date').setDescription('Date et heure : JJ/MM/AAAA HH:MM').setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('ordre-du-jour').setDescription('Ordre du jour').setMaxLength(2000),
        )
        .addUserOption((opt) => opt.setName('participant1').setDescription('Participant'))
        .addUserOption((opt) => opt.setName('participant2').setDescription('Participant'))
        .addUserOption((opt) => opt.setName('participant3').setDescription('Participant')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription("Afficher une réunion")
        .addStringOption((opt) =>
          opt.setName('reunion').setDescription('Réunion').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cloturer')
        .setDescription('Clôturer une réunion avec son compte-rendu')
        .addStringOption((opt) =>
          opt.setName('reunion').setDescription('Réunion').setRequired(true).setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('compte-rendu')
            .setDescription('Compte-rendu de la réunion')
            .setRequired(true)
            .setMaxLength(3000),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('liste').setDescription('Lister les réunions à venir'),
    ),
  minGrade: Grade.CHEF_EQUIPE,
  execute: handleMeeting,
  autocomplete: handleMeetingAutocomplete,
};

export default command;
