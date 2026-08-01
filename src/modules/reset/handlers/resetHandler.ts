import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import EmbedFactory from '@services/EmbedFactory';
import { failGracefully, replyError } from '@services/InteractionContext';
import logger from '@core/Logger';
import { buildResetInventory } from '../services/resetInventoryService';
import { executeReset } from '../services/resetExecutionService';
import {
  buildResetCancelledEmbed,
  buildResetReportEmbed,
  buildResetWarningEmbed,
} from '../embeds/resetEmbeds';
import { countInventory } from '../types';

const CONFIRM_TIMEOUT_MS = 60_000;
const CONFIRM_BUTTON_ID = 'reset:confirm';
const CANCEL_BUTTON_ID = 'reset:cancel';
const MODAL_ID = 'resetmodal:confirm';
const NAME_INPUT_ID = 'servername';

/**
 * `/reset` — destruction complète de la structure Discord.
 *
 * Deux barrières successives : un bouton, puis un modal où le nom exact du
 * serveur doit être saisi. La seconde est délibérément pénible : elle rend un
 * déclenchement accidentel pratiquement impossible, ce qui est proportionné à
 * une action qui détruit des mois de comptes-rendus.
 */
export async function handleReset(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être lancée depuis le serveur.');
    return;
  }

  const guild = interaction.guild;
  const me = guild.members.me;

  if (!me?.permissions.has([PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels])) {
    await replyError(
      interaction,
      'Le bot a besoin des permissions **Gérer les rôles** et **Gérer les salons**.',
    );
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const inventory = await buildResetInventory(guild);

    if (countInventory(inventory) === 0) {
      await interaction.editReply({
        embeds: [
          EmbedFactory.infoEmbed(
            'Rien à supprimer',
            "Aucun élément créé par le bot n'a été trouvé. La structure est déjà vierge.",
          ),
        ],
      });
      return;
    }

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(CONFIRM_BUTTON_ID)
        .setLabel('Je comprends, continuer')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(CANCEL_BUTTON_ID)
        .setLabel('Annuler')
        .setStyle(ButtonStyle.Secondary),
    );

    const message = await interaction.editReply({
      embeds: [buildResetWarningEmbed(inventory, guild.name)],
      components: [buttons],
    });

    let confirmation;
    try {
      confirmation = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id,
        time: CONFIRM_TIMEOUT_MS,
      });
    } catch {
      await interaction.editReply({
        embeds: [
          EmbedFactory.warningEmbed('Expiré', 'Confirmation non reçue — aucune modification.'),
        ],
        components: [],
      });
      return;
    }

    if (confirmation.customId === CANCEL_BUTTON_ID) {
      await confirmation.update({ embeds: [buildResetCancelledEmbed()], components: [] });
      return;
    }

    // Seconde barrière : recopier le nom du serveur.
    await confirmation.showModal(buildNameModal(guild.name));

    const submission = await confirmation
      .awaitModalSubmit({
        time: CONFIRM_TIMEOUT_MS,
        filter: (i) => i.user.id === interaction.user.id && i.customId === MODAL_ID,
      })
      .catch(() => null);

    if (!submission) {
      await interaction.editReply({
        embeds: [
          EmbedFactory.warningEmbed('Expiré', 'Nom non saisi à temps — aucune modification.'),
        ],
        components: [],
      });
      return;
    }

    const typed = submission.fields.getTextInputValue(NAME_INPUT_ID).trim();

    if (typed !== guild.name.trim()) {
      await submission.reply({
        embeds: [
          EmbedFactory.errorEmbed(
            'Nom incorrect',
            `Vous avez saisi \`${typed}\` au lieu de \`${guild.name}\`. Aucune modification effectuée.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      await interaction.editReply({ embeds: [buildResetCancelledEmbed()], components: [] });
      return;
    }

    await submission.deferUpdate();

    await interaction.editReply({
      embeds: [
        EmbedFactory.warningEmbed('Suppression en cours…', 'Ne quittez pas cette fenêtre.'),
      ],
      components: [],
    });

    logger.warn(
      `Reset confirmé par ${interaction.user.tag} sur ${guild.name} (${guild.id}).`,
    );

    // L'inventaire est recalculé : la structure a pu bouger pendant la
    // confirmation, et on ne veut supprimer que ce qui existe encore.
    const freshInventory = await buildResetInventory(guild);
    const report = await executeReset(guild, freshInventory);

    await interaction.editReply({
      embeds: [buildResetReportEmbed(report, interaction.user)],
      components: [],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'réinitialisation de la structure');
  }
}

function buildNameModal(guildName: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(MODAL_ID)
    .setTitle('Confirmation définitive')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(NAME_INPUT_ID)
          .setLabel('Recopiez le nom exact du serveur')
          .setPlaceholder(guildName.slice(0, 100))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100),
      ),
    );
}
