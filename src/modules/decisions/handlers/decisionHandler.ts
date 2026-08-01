import { AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { Grade } from '@prisma/client';
import { isGradeHigherOrEqual } from '@apptypes/grade.types';
import ChannelResolver from '@services/ChannelResolver';
import EmbedFactory from '@services/EmbedFactory';
import { failGracefully, replyError, resolveCommandActor } from '@services/InteractionContext';
import {
  buildDecisionButtons,
  buildDecisionEmbed,
} from '@modules/meetings/embeds/meetingEmbeds';
import { createDecision, getDecision, getPendingDecisions, searchDecisions } from '../services/decisionService';

/** Grade minimum pour trancher une décision. */
export const MIN_GRADE_REVIEW_DECISION = Grade.DIRECTEUR_POLE;

export async function handleDecision(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  switch (interaction.options.getSubcommand()) {
    case 'proposer':
      return handlePropose(interaction);
    case 'info':
      return handleInfo(interaction);
    case 'en-attente':
      return handlePending(interaction);
    default:
      return replyError(interaction, 'Sous-commande inconnue.');
  }
}

async function handlePropose(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const decision = await createDecision({
      title: interaction.options.getString('titre', true),
      description: interaction.options.getString('description', true),
      proposer: context.actor,
      meetingId: interaction.options.getString('reunion') ?? undefined,
    });

    const channel = await ChannelResolver.getChannel(interaction.guild, 'DIRECTION_DECISIONS');
    await channel?.send({
      embeds: [buildDecisionEmbed(decision)],
      components: buildDecisionButtons(decision),
    });

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Décision proposée',
          channel
            ? `**${decision.title}** attend un arbitrage dans ${channel}.`
            : `**${decision.title}** est enregistrée, mais le salon \`#decisions\` est introuvable.`,
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'proposition de décision');
  }
}

async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const decision = await getDecision(interaction.options.getString('decision', true));
    if (!decision) throw new Error('Décision introuvable.');

    await interaction.editReply({
      embeds: [buildDecisionEmbed(decision)],
      components: buildDecisionButtons(decision),
    });
  } catch (error) {
    await failGracefully(interaction, error, 'consultation de décision');
  }
}

async function handlePending(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const decisions = await getPendingDecisions(5);

    if (decisions.length === 0) {
      await interaction.editReply({
        embeds: [
          EmbedFactory.infoEmbed('Aucune décision', 'Aucune décision n\'est en attente d\'arbitrage.'),
        ],
      });
      return;
    }

    const canReview = isGradeHigherOrEqual(context.actorGrade, MIN_GRADE_REVIEW_DECISION);

    await interaction.editReply({
      embeds: decisions.map(buildDecisionEmbed),
      // Les boutons d'arbitrage ne s'affichent qu'à ceux qui peuvent les utiliser.
      components: canReview && decisions.length === 1 ? buildDecisionButtons(decisions[0]) : [],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'liste des décisions');
  }
}

export async function handleDecisionAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const decisions = await searchDecisions(interaction.options.getFocused());

  await interaction.respond(
    decisions.map((decision) => ({
      name: decision.title.length <= 100 ? decision.title : `${decision.title.slice(0, 97)}...`,
      value: decision.id,
    })),
  );
}
