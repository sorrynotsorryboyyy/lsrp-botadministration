import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Grade } from '@prisma/client';
import { isGradeHigherOrEqual } from '@apptypes/grade.types';
import EmbedFactory from '@services/EmbedFactory';
import ChannelResolver from '@services/ChannelResolver';
import { failGracefully, resolveActor } from '@services/InteractionContext';
import { ButtonHandler, ModalHandler } from '@apptypes/command.types';
import {
  closeMeeting,
  convertDecisionToTask,
  getMeeting,
  setAttendance,
} from './services/meetingService';
import { getDecision, reviewDecision } from '@modules/decisions/services/decisionService';
import { buildMeetingButtons, buildMeetingEmbed, buildDecisionEmbed, buildDecisionButtons } from './embeds/meetingEmbeds';
import { MIN_GRADE_REVIEW_DECISION } from '@modules/decisions/handlers/decisionHandler';

const SUMMARY_INPUT_ID = 'summary';

/** Boutons d'une réunion : `reunion:<present|absent|close>:<meetingId>`. */
export const meetingButtons: ButtonHandler = {
  customIdPrefix: 'reunion',
  async execute(interaction: ButtonInteraction): Promise<void> {
    const [, action, meetingId] = interaction.customId.split(':');
    if (!meetingId || !interaction.inCachedGuild()) return;

    if (action === 'close') {
      await interaction.showModal(buildSummaryModal(meetingId));
      return;
    }

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    await interaction.deferUpdate();

    try {
      await setAttendance(meetingId, context.actor.id, action === 'present');

      const meeting = await getMeeting(meetingId);
      if (meeting) {
        await interaction.message.edit({
          embeds: [buildMeetingEmbed(meeting)],
          components: buildMeetingButtons(meeting),
        });
      }

      await interaction.followUp({
        embeds: [
          EmbedFactory.successEmbed(
            'Présence enregistrée',
            action === 'present' ? 'Vous êtes noté présent.' : 'Vous êtes noté absent.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await failGracefully(interaction, error, 'déclaration de présence');
    }
  },
};

/** Modal de compte-rendu : `reunionmodal:close:<meetingId>`. */
export const meetingSummaryModal: ModalHandler = {
  customIdPrefix: 'reunionmodal',
  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    const [, , meetingId] = interaction.customId.split(':');
    if (!meetingId || !interaction.inCachedGuild()) return;

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const existing = await getMeeting(meetingId);
      if (!existing) throw new Error('Réunion introuvable.');

      const isOrganizer = existing.organizerId === context.actor.id;
      if (!isOrganizer && !isGradeHigherOrEqual(context.actorGrade, Grade.DIRECTEUR_POLE)) {
        throw new Error("Seul l'organisateur ou un Directeur peut clôturer cette réunion.");
      }

      const meeting = await closeMeeting({
        meetingId,
        summary: interaction.fields.getTextInputValue(SUMMARY_INPUT_ID),
        actor: context.actor,
      });

      // L'embed d'origine perd ses boutons : la réunion est close.
      await interaction.message?.edit({
        embeds: [buildMeetingEmbed(meeting)],
        components: [],
      });

      const channel = await ChannelResolver.getChannel(interaction.guild, 'GENERAL_COMPTES_RENDUS');
      await channel?.send({ embeds: [buildMeetingEmbed(meeting)] });

      await interaction.editReply({
        embeds: [
          EmbedFactory.successEmbed('Réunion clôturée', `Compte-rendu de **${meeting.title}** publié.`),
        ],
      });
    } catch (error) {
      await failGracefully(interaction, error, 'clôture de réunion');
    }
  },
};

/** Boutons d'une décision : `decision:<approve|reject|task>:<decisionId>`. */
export const decisionButtons: ButtonHandler = {
  customIdPrefix: 'decision',
  async execute(interaction: ButtonInteraction): Promise<void> {
    const [, action, decisionId] = interaction.customId.split(':');
    if (!decisionId || !interaction.inCachedGuild()) return;

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    if (!isGradeHigherOrEqual(context.actorGrade, MIN_GRADE_REVIEW_DECISION)) {
      await interaction.reply({
        embeds: [
          EmbedFactory.errorEmbed(
            'Permission refusée',
            'Seuls les Directeurs de Pôle et au-dessus peuvent arbitrer une décision.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferUpdate();

    try {
      if (action === 'task') {
        // La décision devient une tâche non assignée, à prendre en charge ensuite.
        const task = await convertDecisionToTask(decisionId, null, context.actor);

        const refreshed = await getDecision(decisionId);
        if (refreshed) {
          await interaction.message.edit({
            embeds: [buildDecisionEmbed(refreshed)],
            components: buildDecisionButtons(refreshed),
          });
        }

        await interaction.followUp({
          embeds: [
            EmbedFactory.successEmbed(
              'Tâche créée',
              `**${task.title}** a été créée à partir de cette décision. Assignez-la via \`/tache assigner\`.`,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const decision = await reviewDecision(decisionId, action === 'approve', context.actor);

      await interaction.message.edit({
        embeds: [buildDecisionEmbed(decision)],
        components: buildDecisionButtons(decision),
      });

      await interaction.followUp({
        embeds: [
          EmbedFactory.successEmbed(
            action === 'approve' ? 'Décision validée' : 'Décision rejetée',
            `**${decision.title}** a été traitée.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      await failGracefully(interaction, error, 'arbitrage de décision');
    }
  },
};

function buildSummaryModal(meetingId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`reunionmodal:close:${meetingId}`)
    .setTitle('Clôturer la réunion')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(SUMMARY_INPUT_ID)
          .setLabel('Compte-rendu')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(3000),
      ),
    );
}
