import { SlashCommandBuilder } from 'discord.js';
import { Grade, Priority } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { handleTask, handleTaskAutocomplete } from '@modules/tasks/handlers/taskHandler';
import { handleProjectAutocomplete } from '@modules/projects/handlers/projectHandler';
import { AutocompleteInteraction } from 'discord.js';

const PRIORITY_CHOICES = Object.values(Priority).map((priority) => ({
  name: priority,
  value: priority as string,
}));

/**
 * `/tache creer` propose des projets, les autres sous-commandes des tâches :
 * on aiguille selon le nom de l'option en cours de saisie.
 */
async function routeAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);

  if (focused.name === 'projet') {
    return handleProjectAutocomplete(interaction);
  }

  return handleTaskAutocomplete(interaction);
}

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('tache')
    .setDescription('Gestion des tâches')
    .addSubcommand((sub) =>
      sub
        .setName('creer')
        .setDescription('Créer une tâche')
        .addStringOption((opt) =>
          opt.setName('titre').setDescription('Titre de la tâche').setRequired(true).setMaxLength(100),
        )
        .addStringOption((opt) =>
          opt
            .setName('priorite')
            .setDescription('Priorité')
            .setRequired(true)
            .addChoices(...PRIORITY_CHOICES),
        )
        .addStringOption((opt) =>
          opt.setName('description').setDescription('Description').setMaxLength(2000),
        )
        .addStringOption((opt) =>
          opt.setName('projet').setDescription('Projet rattaché').setAutocomplete(true),
        )
        .addUserOption((opt) => opt.setName('assignee').setDescription('Membre assigné'))
        .addStringOption((opt) =>
          opt.setName('echeance').setDescription('Échéance au format JJ/MM/AAAA'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription("Afficher la fiche d'une tâche")
        .addStringOption((opt) =>
          opt.setName('tache').setDescription('Tâche').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('assigner')
        .setDescription('Assigner une tâche (vous-même si aucun membre précisé)')
        .addStringOption((opt) =>
          opt.setName('tache').setDescription('Tâche').setRequired(true).setAutocomplete(true),
        )
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre assigné')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('statut')
        .setDescription("Changer le statut d'une tâche")
        .addStringOption((opt) =>
          opt.setName('tache').setDescription('Tâche').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('commenter')
        .setDescription('Commenter une tâche')
        .addStringOption((opt) =>
          opt.setName('tache').setDescription('Tâche').setRequired(true).setAutocomplete(true),
        )
        .addStringOption((opt) =>
          opt
            .setName('message')
            .setDescription('Votre commentaire')
            .setRequired(true)
            .setMaxLength(1000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('piece-jointe')
        .setDescription('Joindre un fichier à une tâche')
        .addStringOption((opt) =>
          opt.setName('tache').setDescription('Tâche').setRequired(true).setAutocomplete(true),
        )
        .addAttachmentOption((opt) =>
          opt.setName('fichier').setDescription('Fichier à joindre').setRequired(true),
        ),
    ),
  minGrade: Grade.COLLABORATEUR,
  execute: handleTask,
  autocomplete: routeAutocomplete,
};

export default command;
