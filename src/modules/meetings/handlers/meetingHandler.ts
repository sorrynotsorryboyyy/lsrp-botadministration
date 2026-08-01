import { AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { Grade } from '@prisma/client';
import { isGradeHigherOrEqual } from '@apptypes/grade.types';
import ChannelResolver from '@services/ChannelResolver';
import EmbedFactory from '@services/EmbedFactory';
import {
  failGracefully,
  replyError,
  resolveCommandActor,
  resolveMemberTarget,
} from '@services/InteractionContext';
import { parseDateTime } from '@utils/dateFormatter';
import {
  closeMeeting,
  createMeeting,
  getMeeting,
  getOpenMeetings,
  getUpcomingMeetings,
} from '../services/meetingService';
import { buildMeetingButtons, buildMeetingEmbed } from '../embeds/meetingEmbeds';

export async function handleMeeting(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  switch (interaction.options.getSubcommand()) {
    case 'planifier':
      return handleSchedule(interaction);
    case 'info':
      return handleInfo(interaction);
    case 'cloturer':
      return handleClose(interaction);
    case 'liste':
      return handleList(interaction);
    default:
      return replyError(interaction, 'Sous-commande inconnue.');
  }
}

async function handleSchedule(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  const scheduledAt = parseDateTime(interaction.options.getString('date', true));
  if (!scheduledAt) {
    return replyError(
      interaction,
      'Date invalide. Format attendu : `JJ/MM/AAAA HH:MM` (ex. 15/09/2026 18:30).',
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // Jusqu'à trois participants peuvent être ajoutés dès la planification ;
    // les autres se déclarent ensuite via les boutons de l'embed.
    const attendeeIds: string[] = [];
    for (const option of ['participant1', 'participant2', 'participant3']) {
      const guildMember = interaction.options.getMember(option);
      if (guildMember && 'user' in guildMember) {
        const member = await resolveMemberTarget(interaction, guildMember);
        if (member) attendeeIds.push(member.id);
      }
    }

    const meeting = await createMeeting({
      title: interaction.options.getString('titre', true),
      agenda: interaction.options.getString('ordre-du-jour') ?? undefined,
      scheduledAt,
      organizer: context.actor,
      attendeeIds,
    });

    const channel = await ChannelResolver.getChannel(interaction.guild, 'GENERAL_REUNIONS');
    await channel?.send({
      embeds: [buildMeetingEmbed(meeting)],
      components: buildMeetingButtons(meeting),
    });

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Réunion planifiée',
          channel
            ? `**${meeting.title}** a été publiée dans ${channel}.`
            : `**${meeting.title}** est enregistrée, mais le salon \`#reunions\` est introuvable.`,
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'planification de réunion');
  }
}

async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const meeting = await getMeeting(interaction.options.getString('reunion', true));
    if (!meeting) throw new Error('Réunion introuvable.');

    await interaction.editReply({ embeds: [buildMeetingEmbed(meeting)] });
  } catch (error) {
    await failGracefully(interaction, error, 'consultation de réunion');
  }
}

async function handleClose(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const meetingId = interaction.options.getString('reunion', true);
    const existing = await getMeeting(meetingId);
    if (!existing) throw new Error('Réunion introuvable.');

    // Seul l'organisateur clôt sa réunion — sauf pour l'encadrement supérieur,
    // qui doit pouvoir débloquer une réunion dont l'organisateur est absent.
    const isOrganizer = existing.organizerId === context.actor.id;
    const isSenior = isGradeHigherOrEqual(context.actorGrade, Grade.DIRECTEUR_POLE);

    if (!isOrganizer && !isSenior) {
      throw new Error('Seul l\'organisateur ou un Directeur peut clôturer cette réunion.');
    }

    const meeting = await closeMeeting({
      meetingId,
      summary: interaction.options.getString('compte-rendu', true),
      actor: context.actor,
    });

    const channel = await ChannelResolver.getChannel(interaction.guild, 'GENERAL_COMPTES_RENDUS');
    await channel?.send({ embeds: [buildMeetingEmbed(meeting)] });

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Réunion clôturée',
          `Le compte-rendu de **${meeting.title}** a été publié.` +
            (meeting.decisions.length > 0
              ? `\n\n${meeting.decisions.length} décision(s) rattachée(s) — utilisez \`/decision\` pour les convertir en tâches.`
              : ''),
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'clôture de réunion');
  }
}

async function handleList(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const meetings = await getUpcomingMeetings(10);

    if (meetings.length === 0) {
      await interaction.editReply({
        embeds: [EmbedFactory.infoEmbed('Aucune réunion', 'Aucune réunion n\'est planifiée.')],
      });
      return;
    }

    await interaction.editReply({ embeds: meetings.slice(0, 5).map(buildMeetingEmbed) });
  } catch (error) {
    await failGracefully(interaction, error, 'liste des réunions');
  }
}

/** Autocomplétion sur les réunions encore ouvertes. */
export async function handleMeetingAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused().toLowerCase();
  const meetings = await getOpenMeetings();

  const matches = meetings
    .filter((meeting) => !focused || meeting.title.toLowerCase().includes(focused))
    .slice(0, 25);

  await interaction.respond(
    matches.map((meeting) => ({
      name: truncateChoice(meeting.title),
      value: meeting.id,
    })),
  );
}

function truncateChoice(text: string): string {
  return text.length <= 100 ? text : `${text.slice(0, 97)}...`;
}
