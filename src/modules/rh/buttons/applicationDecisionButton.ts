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
import MemberService from '@services/MemberService';
import PermissionService from '@services/PermissionService';
import ChannelResolver from '@services/ChannelResolver';
import logger from '@core/Logger';
import { ButtonHandler, ModalHandler } from '@apptypes/command.types';
import { canReviewApplication } from '../permissions';
import {
  acceptApplication,
  getApplication,
  markUnderReview,
  rejectApplication,
} from '../services/applicationService';
import { buildApplicationEmbed } from '../embeds/rhEmbeds';

const NOTE_INPUT_ID = 'note';

/**
 * Traite les boutons d'un embed de candidature.
 *
 * `customId` attendu : `rh:app:<accept|reject|interview>:<applicationId>`.
 * Accepter et refuser ouvrent un modal pour saisir une note ; passer en
 * entretien s'applique directement, l'action étant réversible.
 */
export const applicationDecisionButton: ButtonHandler = {
  customIdPrefix: 'rh',
  async execute(interaction: ButtonInteraction): Promise<void> {
    const [, scope, action, applicationId] = interaction.customId.split(':');

    if (scope !== 'app' || !applicationId) return;
    if (!interaction.inCachedGuild()) return;

    const grade = await PermissionService.resolveGrade(interaction.member);

    if (!grade) {
      await interaction.reply({
        embeds: [
          EmbedFactory.errorEmbed(
            'Permission refusée',
            'Aucun grade détecté sur votre compte.',
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const check = canReviewApplication(grade);
    if (!check.allowed) {
      await interaction.reply({
        embeds: [EmbedFactory.errorEmbed('Permission refusée', check.reason!)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'interview') {
      await handleInterview(interaction, applicationId);
      return;
    }

    if (action === 'accept' || action === 'reject') {
      await interaction.showModal(buildDecisionModal(action, applicationId));
    }
  },
};

/** Reçoit la note de décision et clôt la candidature. */
export const applicationDecisionModal: ModalHandler = {
  customIdPrefix: 'rhmodal',
  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    const [, action, applicationId] = interaction.customId.split(':');

    if (!applicationId || !interaction.inCachedGuild()) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const note = interaction.fields.getTextInputValue(NOTE_INPUT_ID) || undefined;

      const reviewer = await MemberService.getOrCreateMember(
        interaction.user.id,
        interaction.user.username,
        interaction.member.displayName,
        (await PermissionService.resolveGrade(interaction.member)) ?? undefined,
      );

      const result =
        action === 'accept'
          ? (await acceptApplication(applicationId, reviewer, note)).application
          : await rejectApplication(applicationId, reviewer, note);

      // Le message d'origine porte encore les boutons : on le remplace par
      // l'embed final sans composants, pour empêcher un second traitement.
      await interaction.message?.edit({
        embeds: [buildApplicationEmbed(result)],
        components: [],
      });

      await notifyCandidate(interaction, result.candidateDiscordId, action === 'accept');

      await interaction.editReply({
        embeds: [
          EmbedFactory.successEmbed(
            action === 'accept' ? 'Candidature acceptée' : 'Candidature refusée',
            `La décision a été enregistrée pour **${result.candidatePseudo}**.`,
          ),
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur inconnue.';
      logger.error('Échec du traitement d\'une candidature:', error);
      await interaction.editReply({
        embeds: [EmbedFactory.errorEmbed('Action impossible', message)],
      });
    }
  },
};

async function handleInterview(interaction: ButtonInteraction, applicationId: string): Promise<void> {
  await interaction.deferUpdate();

  try {
    const existing = await getApplication(applicationId);
    if (!existing) throw new Error('Candidature introuvable.');

    const reviewer = await MemberService.getOrCreateMember(
      interaction.user.id,
      interaction.user.username,
      interaction.user.username,
    );

    const updated = await markUnderReview(applicationId, reviewer);

    // Les boutons restent : l'entretien n'est pas une décision finale.
    await interaction.message.edit({ embeds: [buildApplicationEmbed(updated)] });
  } catch (error) {
    logger.error('Échec du passage en entretien:', error);
    await interaction.followUp({
      embeds: [EmbedFactory.errorEmbed('Action impossible', 'Impossible de mettre à jour la candidature.')],
      flags: MessageFlags.Ephemeral,
    });
  }
}

function buildDecisionModal(action: string, applicationId: string): ModalBuilder {
  const isAccept = action === 'accept';

  return new ModalBuilder()
    .setCustomId(`rhmodal:${action}:${applicationId}`)
    .setTitle(isAccept ? 'Accepter la candidature' : 'Refuser la candidature')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(NOTE_INPUT_ID)
          .setLabel(isAccept ? 'Note (optionnelle)' : 'Motif du refus')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(!isAccept)
          .setMaxLength(1000),
      ),
    );
}

/** Prévient le candidat de la décision, sans bloquer si ses MP sont fermés. */
async function notifyCandidate(
  interaction: ModalSubmitInteraction<'cached'>,
  candidateDiscordId: string,
  accepted: boolean,
): Promise<void> {
  try {
    const user = await interaction.client.users.fetch(candidateDiscordId);
    await user.send({
      embeds: [
        accepted
          ? EmbedFactory.successEmbed(
              'Candidature acceptée',
              'Votre candidature auprès de **La Scène RP** a été acceptée. Bienvenue !',
            )
          : EmbedFactory.infoEmbed(
              'Candidature refusée',
              'Votre candidature auprès de **La Scène RP** n\'a pas été retenue.',
            ),
      ],
    });
  } catch {
    logger.info(`Impossible de notifier le candidat ${candidateDiscordId} en MP.`);
  }
}
