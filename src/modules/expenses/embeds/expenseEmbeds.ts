import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { ExpenseStatus } from '@prisma/client';
import { formatDateTime } from '@utils/dateFormatter';
import { ExpenseWithRelations, nextApprovalStep } from '../services/expenseService';

const STATUS_STYLE: Record<ExpenseStatus, { color: number; label: string }> = {
  [ExpenseStatus.SOUMISE]: { color: 0x3498db, label: '🕐 En attente de validation' },
  [ExpenseStatus.VALIDEE_RESPONSABLE]: {
    color: 0xf39c12,
    label: '🔸 Validée par le Responsable — attente Directeur',
  },
  [ExpenseStatus.VALIDEE_DIRECTEUR]: { color: 0xf39c12, label: '🔸 Validée par le Directeur' },
  [ExpenseStatus.ACCEPTEE]: { color: 0x27ae60, label: '✅ Acceptée' },
  [ExpenseStatus.REFUSEE]: { color: 0xe74c3c, label: '❌ Refusée' },
};

/** Formate un montant en euros, avec séparateur français. */
export function formatAmount(amount: { toString(): string }): string {
  return `${Number(amount.toString()).toFixed(2).replace('.', ',')} €`;
}

export function buildExpenseEmbed(expense: ExpenseWithRelations): EmbedBuilder {
  const style = STATUS_STYLE[expense.status];

  const embed = new EmbedBuilder()
    .setTitle(`💶 ${expense.title}`)
    .setColor(style.color)
    .addFields(
      { name: 'Montant', value: formatAmount(expense.amount), inline: true },
      { name: 'Statut', value: style.label, inline: true },
      { name: 'Demandeur', value: `<@${expense.submitter.discordId}>`, inline: true },
    )
    .setFooter({ text: `Réf. ${expense.id}` })
    .setTimestamp(expense.createdAt);

  if (expense.description) {
    embed.setDescription(truncate(expense.description, 4096));
  }

  if (expense.receiptUrl) {
    embed.addFields({ name: 'Justificatif', value: `[Voir le document](${expense.receiptUrl})` });
  }

  if (expense.reviewer) {
    embed.addFields({
      name: 'Traitée par',
      value: `<@${expense.reviewer.discordId}>`,
      inline: true,
    });
  }

  if (expense.decidedAt) {
    embed.addFields({ name: 'Décidée le', value: formatDateTime(expense.decidedAt), inline: true });
  }

  // Rendre l'étape suivante explicite évite qu'une dépense stagne faute de
  // savoir qui doit agir.
  const step = nextApprovalStep(expense);
  if (step) {
    embed.addFields({ name: 'Prochaine validation', value: `Grade **${step.requiredGrade}** requis` });
  }

  return embed;
}

export function buildExpenseButtons(
  expense: ExpenseWithRelations,
): ActionRowBuilder<ButtonBuilder>[] {
  // Plus de boutons une fois la dépense tranchée.
  if (!nextApprovalStep(expense)) return [];

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`depense:approve:${expense.id}`)
        .setLabel('Valider')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`depense:refuse:${expense.id}`)
        .setLabel('Refuser')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
