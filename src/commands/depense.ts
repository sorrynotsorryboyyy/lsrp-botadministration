import { SlashCommandBuilder } from 'discord.js';
import { Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { handleExpense } from '@modules/expenses/handlers/expenseHandler';

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('depense')
    .setDescription('Gestion des dépenses')
    .addSubcommand((sub) =>
      sub
        .setName('soumettre')
        .setDescription('Soumettre une dépense à validation')
        .addStringOption((opt) =>
          opt.setName('motif').setDescription('Objet de la dépense').setRequired(true).setMaxLength(150),
        )
        .addNumberOption((opt) =>
          opt
            .setName('montant')
            .setDescription('Montant en euros')
            .setRequired(true)
            .setMinValue(0.01)
            .setMaxValue(999999),
        )
        .addStringOption((opt) => opt.setName('details').setDescription('Précisions').setMaxLength(2000))
        .addAttachmentOption((opt) => opt.setName('justificatif').setDescription('Facture ou reçu')),
    )
    .addSubcommand((sub) =>
      sub.setName('en-attente').setDescription('Lister les dépenses en attente de validation'),
    ),
  minGrade: Grade.COLLABORATEUR,
  execute: handleExpense,
};

export default command;
