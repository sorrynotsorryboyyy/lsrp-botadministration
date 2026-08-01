import { SlashCommandBuilder } from 'discord.js';
import { Grade, RoadmapStatus } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { POLES_CONFIG } from '@config/poles.config';
import { handleRoadmap, handleRoadmapAutocomplete } from '@modules/roadmap/handlers/miscHandlers';
import { ROADMAP_STATUS_LABELS } from '@modules/roadmap/services/roadmapService';

const POLE_CHOICES = Object.values(POLES_CONFIG).map((pole) => ({
  name: pole.displayName,
  value: pole.name as string,
}));

const STATUS_CHOICES = Object.values(RoadmapStatus).map((status) => ({
  name: ROADMAP_STATUS_LABELS[status],
  value: status as string,
}));

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('roadmap')
    .setDescription('Feuille de route interne')
    .addSubcommand((sub) =>
      sub
        .setName('voir')
        .setDescription('Afficher la roadmap')
        .addStringOption((opt) =>
          opt.setName('statut').setDescription('Filtrer par statut').addChoices(...STATUS_CHOICES),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('ajouter')
        .setDescription('Ajouter un élément à la roadmap')
        .addStringOption((opt) =>
          opt.setName('titre').setDescription("Intitulé").setRequired(true).setMaxLength(150),
        )
        .addStringOption((opt) =>
          opt.setName('description').setDescription('Détail').setMaxLength(2000),
        )
        .addStringOption((opt) =>
          opt.setName('pole').setDescription('Pôle porteur').addChoices(...POLE_CHOICES),
        )
        .addStringOption((opt) =>
          opt.setName('echeance').setDescription('Cible au format JJ/MM/AAAA'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('statut')
        .setDescription("Changer le statut d'un élément")
        .addStringOption((opt) =>
          opt.setName('element').setDescription('Élément').setRequired(true).setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('nouveau-statut')
            .setDescription('Nouveau statut')
            .setRequired(true)
            .addChoices(...STATUS_CHOICES),
        ),
    ),
  minGrade: Grade.RESPONSABLE,
  execute: handleRoadmap,
  autocomplete: handleRoadmapAutocomplete,
};

export default command;
