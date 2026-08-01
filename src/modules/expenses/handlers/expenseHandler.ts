import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import ChannelResolver from '@services/ChannelResolver';
import EmbedFactory from '@services/EmbedFactory';
import { failGracefully, replyError, resolveCommandActor } from '@services/InteractionContext';
import { createExpense, getPendingExpenses } from '../services/expenseService';
import { buildExpenseButtons, buildExpenseEmbed, formatAmount } from '../embeds/expenseEmbeds';

export async function handleExpense(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  switch (interaction.options.getSubcommand()) {
    case 'soumettre':
      return handleSubmit(interaction);
    case 'en-attente':
      return handlePending(interaction);
    default:
      return replyError(interaction, 'Sous-commande inconnue.');
  }
}

async function handleSubmit(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const receipt = interaction.options.getAttachment('justificatif');

    const expense = await createExpense({
      title: interaction.options.getString('motif', true),
      amount: interaction.options.getNumber('montant', true),
      description: interaction.options.getString('details') ?? undefined,
      receiptUrl: receipt?.url,
      submitter: context.actor,
    });

    const channel = await ChannelResolver.getChannel(interaction.guild, 'DIRECTION_DEPENSES');
    await channel?.send({
      embeds: [buildExpenseEmbed(expense)],
      components: buildExpenseButtons(expense),
    });

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Dépense soumise',
          channel
            ? `**${expense.title}** (${formatAmount(expense.amount)}) attend validation dans ${channel}.`
            : `**${expense.title}** est enregistrée, mais le salon \`#depenses\` est introuvable.`,
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'soumission de dépense');
  }
}

async function handlePending(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const expenses = await getPendingExpenses(5);

    if (expenses.length === 0) {
      await interaction.editReply({
        embeds: [EmbedFactory.infoEmbed('Aucune dépense', 'Aucune dépense en attente de validation.')],
      });
      return;
    }

    await interaction.editReply({ embeds: expenses.map(buildExpenseEmbed) });
  } catch (error) {
    await failGracefully(interaction, error, 'liste des dépenses');
  }
}
