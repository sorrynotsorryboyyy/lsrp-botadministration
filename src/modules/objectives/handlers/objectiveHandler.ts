import { AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { ObjectiveScope, PoleName } from '@prisma/client';
import ChannelResolver from '@services/ChannelResolver';
import EmbedFactory from '@services/EmbedFactory';
import {
  failGracefully,
  replyError,
  resolveCommandActor,
  resolveMemberTarget,
} from '@services/InteractionContext';
import { parseDueDate } from '@utils/dateFormatter';
import {
  closeObjective,
  createObjective,
  getActiveObjectives,
  searchObjectives,
} from '../services/objectiveService';
import { buildObjectiveEmbed } from '../embeds/objectiveEmbeds';

export async function handleObjective(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  switch (interaction.options.getSubcommand()) {
    case 'creer':
      return handleCreate(interaction);
    case 'liste':
      return handleList(interaction);
    case 'cloturer':
      return handleClose(interaction);
    default:
      return replyError(interaction, 'Sous-commande inconnue.');
  }
}

async function handleCreate(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  const endDate = parseDueDate(interaction.options.getString('echeance', true));
  if (!endDate) {
    return replyError(interaction, 'Date invalide. Format attendu : `JJ/MM/AAAA`.');
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const ownerMember = interaction.options.getMember('responsable');
    const owner =
      ownerMember && 'user' in ownerMember
        ? await resolveMemberTarget(interaction, ownerMember)
        : null;

    const pole = (interaction.options.getString('pole') as PoleName) ?? undefined;

    const objective = await createObjective({
      title: interaction.options.getString('titre', true),
      description: interaction.options.getString('description') ?? undefined,
      scope: interaction.options.getString('portee', true) as ObjectiveScope,
      pole,
      owner: owner ?? undefined,
      startDate: new Date(),
      endDate,
      actor: context.actor,
    });

    // Un objectif de pôle va dans le salon du pôle, les autres dans le général.
    const channel = pole
      ? await ChannelResolver.getPoleChannel(interaction.guild, pole, 'HUB')
      : await ChannelResolver.getChannel(interaction.guild, 'GENERAL_HUB');

    await channel?.send({ embeds: [buildObjectiveEmbed(objective)] });

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Objectif défini',
          channel
            ? `**${objective.title}** a été publié dans ${channel}.`
            : `**${objective.title}** est enregistré, mais le salon d'objectifs est introuvable.`,
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, "création d'objectif");
  }
}

async function handleList(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const pole = (interaction.options.getString('pole') as PoleName) ?? undefined;
    const objectives = await getActiveObjectives(pole);

    if (objectives.length === 0) {
      await interaction.editReply({
        embeds: [EmbedFactory.infoEmbed('Aucun objectif', 'Aucun objectif en cours.')],
      });
      return;
    }

    await interaction.editReply({ embeds: objectives.slice(0, 5).map(buildObjectiveEmbed) });
  } catch (error) {
    await failGracefully(interaction, error, 'liste des objectifs');
  }
}

async function handleClose(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const objective = await closeObjective(
      interaction.options.getString('objectif', true),
      interaction.options.getBoolean('atteint', true),
      context.actor,
    );

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Objectif clôturé',
          `**${objective.title}** est marqué comme **${objective.status}**.`,
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, "clôture d'objectif");
  }
}

export async function handleObjectiveAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const objectives = await searchObjectives(interaction.options.getFocused());

  await interaction.respond(
    objectives.map((objective) => ({
      name: objective.title.length <= 100 ? objective.title : `${objective.title.slice(0, 97)}...`,
      value: objective.id,
    })),
  );
}
