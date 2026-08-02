import { SlashCommandBuilder } from 'discord.js';
import { Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { POLES_CONFIG } from '@config/poles.config';
import { POLE_RANK_LABELS, POLE_RANK_ORDER } from '@config/poleRoles.config';
import { handlePole } from '@modules/poleAssignment/handlers/poleHandler';

const POLE_CHOICES = Object.values(POLES_CONFIG).map((pole) => ({
  name: pole.displayName,
  value: pole.name as string,
}));

const RANK_CHOICES = POLE_RANK_ORDER.map((rank) => ({
  name: POLE_RANK_LABELS[rank],
  value: rank as string,
}));

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('pole')
    .setDescription("Affectation des membres aux pôles")
    .addSubcommand((sub) =>
      sub
        .setName('affecter')
        .setDescription('Affecter un membre à un pôle')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true))
        .addStringOption((opt) =>
          opt.setName('pole').setDescription('Pôle').setRequired(true).addChoices(...POLE_CHOICES),
        )
        .addStringOption((opt) =>
          opt.setName('rang').setDescription('Rang dans le pôle').setRequired(true).addChoices(...RANK_CHOICES),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('retirer')
        .setDescription("Retirer un membre de son pôle")
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub.setName('en-attente').setDescription("Lister les membres sans pôle"),
    )
    .addSubcommand((sub) =>
      sub
        .setName('sync')
        .setDescription('Réaligner les rôles Discord sur les affectations en base'),
    ),
  minGrade: Grade.CHEF_EQUIPE,
  execute: handlePole,
};

export default command;
