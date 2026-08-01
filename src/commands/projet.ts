import { SlashCommandBuilder } from 'discord.js';
import { Grade, Priority } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { POLES_CONFIG } from '@config/poles.config';
import { handleProject, handleProjectAutocomplete } from '@modules/projects/handlers/projectHandler';

const POLE_CHOICES = Object.values(POLES_CONFIG).map((pole) => ({
  name: pole.displayName,
  value: pole.name as string,
}));

const PRIORITY_CHOICES = Object.values(Priority).map((priority) => ({
  name: priority,
  value: priority as string,
}));

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('projet')
    .setDescription('Gestion des projets')
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Créer un projet')
        .addStringOption((opt) =>
          opt.setName('titre').setDescription('Titre du projet').setRequired(true).setMaxLength(100),
        )
        .addStringOption((opt) =>
          opt
            .setName('description')
            .setDescription('Description du projet')
            .setRequired(true)
            .setMaxLength(2000),
        )
        .addStringOption((opt) =>
          opt
            .setName('priorite')
            .setDescription('Priorité')
            .setRequired(true)
            .addChoices(...PRIORITY_CHOICES),
        )
        .addStringOption((opt) =>
          opt.setName('pole').setDescription('Pôle porteur').addChoices(...POLE_CHOICES),
        )
        .addStringOption((opt) =>
          opt.setName('echeance').setDescription('Échéance au format JJ/MM/AAAA'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription("Afficher la fiche d'un projet")
        .addStringOption((opt) =>
          opt.setName('projet').setDescription('Projet').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('statut')
        .setDescription("Changer le statut d'un projet")
        .addStringOption((opt) =>
          opt.setName('projet').setDescription('Projet').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('membre')
        .setDescription('Ajouter ou retirer un participant')
        .addStringOption((opt) =>
          opt.setName('projet').setDescription('Projet').setRequired(true).setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('action')
            .setDescription('Action à effectuer')
            .setRequired(true)
            .addChoices({ name: 'Ajouter', value: 'ajouter' }, { name: 'Retirer', value: 'retirer' }),
        )
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('commenter')
        .setDescription('Commenter un projet')
        .addStringOption((opt) =>
          opt.setName('projet').setDescription('Projet').setRequired(true).setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('message')
            .setDescription('Votre commentaire')
            .setRequired(true)
            .setMaxLength(1000),
        ),
    ),
  minGrade: Grade.COLLABORATEUR,
  execute: handleProject,
  autocomplete: handleProjectAutocomplete,
};

export default command;
