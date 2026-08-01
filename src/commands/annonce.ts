import { SlashCommandBuilder } from 'discord.js';
import { AnnouncementPriority, Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { handleAnnouncement } from '@modules/announcements/handlers/announcementHandler';

const PRIORITY_CHOICES = [
  { name: '📢 Info', value: AnnouncementPriority.INFO as string },
  { name: '⚠️ Importante', value: AnnouncementPriority.IMPORTANTE as string },
  { name: '🚨 Urgente', value: AnnouncementPriority.URGENTE as string },
];

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('annonce')
    .setDescription('Publier une annonce vers un ou plusieurs pôles')
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Rédiger une annonce puis choisir ses destinataires')
        .addStringOption((opt) =>
          opt.setName('titre').setDescription("Titre de l'annonce").setRequired(true).setMaxLength(200),
        )
        .addStringOption((opt) =>
          opt
            .setName('contenu')
            .setDescription("Corps de l'annonce")
            .setRequired(true)
            .setMaxLength(3000),
        )
        .addStringOption((opt) =>
          opt
            .setName('priorite')
            .setDescription('Niveau de priorité')
            .setRequired(true)
            .addChoices(...PRIORITY_CHOICES),
        ),
    ),
  minGrade: Grade.CHEF_EQUIPE,
  execute: handleAnnouncement,
};

export default command;
