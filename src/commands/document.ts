import { SlashCommandBuilder } from 'discord.js';
import { DocumentCategory, Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { handleDocument, handleDocumentAutocomplete } from '@modules/roadmap/handlers/miscHandlers';
import { DOCUMENT_CATEGORY_LABELS } from '@modules/documents/services/documentService';

const CATEGORY_CHOICES = Object.values(DocumentCategory).map((category) => ({
  name: DOCUMENT_CATEGORY_LABELS[category],
  value: category as string,
}));

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('document')
    .setDescription('Bibliothèque documentaire')
    .addSubcommand((sub) =>
      sub
        .setName('publier')
        .setDescription('Publier un document')
        .addStringOption((opt) =>
          opt.setName('titre').setDescription('Titre du document').setRequired(true).setMaxLength(150),
        )
        .addStringOption((opt) =>
          opt
            .setName('categorie')
            .setDescription('Catégorie')
            .setRequired(true)
            .addChoices(...CATEGORY_CHOICES),
        )
        .addStringOption((opt) =>
          opt.setName('contenu').setDescription('Contenu textuel').setMaxLength(3000),
        )
        .addAttachmentOption((opt) => opt.setName('fichier').setDescription('Fichier joint')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('lire')
        .setDescription('Consulter un document')
        .addStringOption((opt) =>
          opt.setName('document').setDescription('Document').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('liste')
        .setDescription('Lister les documents')
        .addStringOption((opt) =>
          opt.setName('categorie').setDescription('Filtrer par catégorie').addChoices(...CATEGORY_CHOICES),
        ),
    ),
  minGrade: Grade.COLLABORATEUR,
  execute: handleDocument,
  autocomplete: handleDocumentAutocomplete,
};

export default command;
