import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import EmbedFactory from '@services/EmbedFactory';
import { failGracefully, resolveActor } from '@services/InteractionContext';
import { ButtonHandler, ModalHandler } from '@apptypes/command.types';
import { approveExpense, refuseExpense } from './services/expenseService';
import { buildExpenseButtons, buildExpenseEmbed, formatAmount } from './embeds/expenseEmbeds';

const REASON_INPUT_ID = 'reason';

/** Boutons d'une dépense : `depense:<approve|refuse>:<expenseId>`. */
export const expenseButtons: ButtonHandler = {
  customIdPrefix: 'depense',
  async execute(interaction: ButtonInteraction): Promise<void> {
    const [, action, expenseId] = interaction.customId.split(':');
    if (!expenseId || !interaction.inCachedGuild()) return;

    if (action === 'refuse') {
      await interaction.showModal(buildRefusalModal(expenseId));
      return;
    }

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    await interaction.deferUpdate();

    try {
      const { expense, fullyApproved } = await approveExpense(
        expenseId,
        context.actor,
        context.actorGrade,
      );

      await interaction.message.edit({
        embeds: [buildExpenseEmbed(expense)],
        components: buildExpenseButtons(expense),
      });

      await interaction.followUp({
        embeds: [
          EmbedFactory.successEmbed(
            fullyApproved ? 'Dépense acceptée' : 'Validation enregistrée',
            fullyApproved
              ? `**${expense.title}** (${formatAmount(expense.amount)}) est définitivement acceptée.`
              : `**${expense.title}** attend désormais la contresignature d'un Directeur.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await failGracefully(interaction, error, 'validation de dépense');
    }
  },
};

/** Modal de refus : `depensemodal:refuse:<expenseId>`. */
export const expenseRefusalModal: ModalHandler = {
  customIdPrefix: 'depensemodal',
  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    const [, , expenseId] = interaction.customId.split(':');
    if (!expenseId || !interaction.inCachedGuild()) return;

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const expense = await refuseExpense(
        expenseId,
        context.actor,
        context.actorGrade,
        interaction.fields.getTextInputValue(REASON_INPUT_ID),
      );

      await interaction.message?.edit({
        embeds: [buildExpenseEmbed(expense)],
        components: [],
      });

      await interaction.editReply({
        embeds: [EmbedFactory.successEmbed('Dépense refusée', `**${expense.title}** a été refusée.`)],
      });
    } catch (error) {
      await failGracefully(interaction, error, 'refus de dépense');
    }
  },
};

function buildRefusalModal(expenseId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`depensemodal:refuse:${expenseId}`)
    .setTitle('Refuser la dépense')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(REASON_INPUT_ID)
          .setLabel('Motif du refus')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000),
      ),
    );
}
