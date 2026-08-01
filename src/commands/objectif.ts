import { SlashCommandBuilder } from 'discord.js';
import { Grade, ObjectiveScope } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { POLES_CONFIG } from '@config/poles.config';
import {
  handleObjective,
  handleObjectiveAutocomplete,
} from '@modules/objectives/handlers/objectiveHandler';

const POLE_CHOICES = Object.values(POLES_CONFIG).map((pole) => ({
  name: pole.displayName,
  value: pole.name as string,
}));

const SCOPE_CHOICES = [
  { name: 'Hebdomadaire', value: ObjectiveScope.HEBDOMADAIRE as string },
  { name: 'Mensuel', value: ObjectiveScope.MENSUEL as string },
  { name: 'Pôle', value: ObjectiveScope.POLE as string },
  { name: 'Individuel', value: ObjectiveScope.INDIVIDUEL as string },
];

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('objectif')
    .setDescription('Gestion des objectifs')
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Définir un objectif')
        .addStringOption((opt) =>
          opt.setName('titre').setDescription("Intitulé de l'objectif").setRequired(true).setMaxLength(150),
        )
        .addStringOption((opt) =>
          opt.setName('portee').setDescription('Portée').setRequired(true).addChoices(...SCOPE_CHOICES),
        )
        .addStringOption((opt) =>
          opt.setName('echeance').setDescription('Échéance au format JJ/MM/AAAA').setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('description').setDescription('Détail').setMaxLength(2000),
        )
        .addStringOption((opt) =>
          opt.setName('pole').setDescription('Pôle concerné').addChoices(...POLE_CHOICES),
        )
        .addUserOption((opt) => opt.setName('responsable').setDescription("Responsable de l'objectif")),
    )
    .addSubcommand((sub) =>
      sub
        .setName('liste')
        .setDescription('Lister les objectifs en cours')
        .addStringOption((opt) =>
          opt.setName('pole').setDescription('Filtrer par pôle').addChoices(...POLE_CHOICES),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('cloturer')
        .setDescription('Clôturer un objectif')
        .addStringOption((opt) =>
          opt.setName('objectif').setDescription('Objectif').setRequired(true).setAutocomplete(true),
        )
        .addBooleanOption((opt) =>
          opt.setName('atteint').setDescription("L'objectif a-t-il été atteint ?").setRequired(true),
        ),
    ),
  minGrade: Grade.CHEF_EQUIPE,
  execute: handleObjective,
  autocomplete: handleObjectiveAutocomplete,
};

export default command;
