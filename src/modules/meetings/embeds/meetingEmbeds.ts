import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { DecisionStatus, MeetingStatus } from '@prisma/client';
import { formatDate, formatDateTime } from '@utils/dateFormatter';
import { MeetingWithRelations } from '../services/meetingService';
import { DecisionWithRelations } from '@modules/decisions/services/decisionService';

const FIELD_LIMIT = 1024;

const MEETING_STYLE: Record<MeetingStatus, { color: number; label: string }> = {
  [MeetingStatus.PLANIFIEE]: { color: 0x3498db, label: '📅 Planifiée' },
  [MeetingStatus.EN_COURS]: { color: 0xf39c12, label: '🔴 En cours' },
  [MeetingStatus.TERMINEE]: { color: 0x27ae60, label: '✅ Terminée' },
  [MeetingStatus.ANNULEE]: { color: 0x95a5a6, label: '⛔ Annulée' },
};

export const DECISION_STYLE: Record<DecisionStatus, { color: number; label: string }> = {
  [DecisionStatus.PROPOSEE]: { color: 0x3498db, label: '💡 Proposée' },
  [DecisionStatus.VALIDEE]: { color: 0x27ae60, label: '✅ Validée' },
  [DecisionStatus.REJETEE]: { color: 0xe74c3c, label: '❌ Rejetée' },
  [DecisionStatus.APPLIQUEE]: { color: 0x9b59b6, label: '🏁 Appliquée' },
};

export function buildMeetingEmbed(meeting: MeetingWithRelations): EmbedBuilder {
  const style = MEETING_STYLE[meeting.status];

  const present = meeting.attendees.filter((a) => a.present).length;
  const attendeeList = meeting.attendees
    .map((a) => `${a.present ? '✅' : '▫️'} <@${a.member.discordId}>`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`📅 ${meeting.title}`)
    .setColor(style.color)
    .addFields(
      { name: 'Statut', value: style.label, inline: true },
      { name: 'Date', value: formatDateTime(meeting.scheduledAt), inline: true },
      { name: 'Organisateur', value: `<@${meeting.organizer.discordId}>`, inline: true },
      {
        name: `Participants (${present}/${meeting.attendees.length})`,
        value: truncate(attendeeList || '—', FIELD_LIMIT),
      },
    )
    .setFooter({ text: `Réf. ${meeting.id}` })
    .setTimestamp(meeting.createdAt);

  if (meeting.agenda) {
    embed.addFields({ name: 'Ordre du jour', value: truncate(meeting.agenda, FIELD_LIMIT) });
  }

  if (meeting.summary) {
    embed.addFields({ name: 'Compte-rendu', value: truncate(meeting.summary, FIELD_LIMIT) });
  }

  if (meeting.decisions.length > 0) {
    const decisions = meeting.decisions
      .map((link) =>
        link.decision
          ? `• ${DECISION_STYLE[link.decision.status].label} **${link.decision.title}**`
          : `• ${link.note ?? '(décision non liée)'}`,
      )
      .join('\n');

    embed.addFields({
      name: `Décisions (${meeting.decisions.length})`,
      value: truncate(decisions, FIELD_LIMIT),
    });
  }

  return embed;
}

/** Boutons d'une réunion ouverte ; aucun une fois close ou annulée. */
export function buildMeetingButtons(meeting: MeetingWithRelations): ActionRowBuilder<ButtonBuilder>[] {
  if (meeting.status === MeetingStatus.TERMINEE || meeting.status === MeetingStatus.ANNULEE) {
    return [];
  }

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`reunion:present:${meeting.id}`)
        .setLabel('Je serai présent')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`reunion:absent:${meeting.id}`)
        .setLabel('Absent')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`reunion:close:${meeting.id}`)
        .setLabel('Clôturer')
        .setEmoji('📝')
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

export function buildDecisionEmbed(decision: DecisionWithRelations): EmbedBuilder {
  const style = DECISION_STYLE[decision.status];

  const embed = new EmbedBuilder()
    .setTitle(`💡 ${decision.title}`)
    .setDescription(truncate(decision.description, 4096))
    .setColor(style.color)
    .addFields(
      { name: 'Statut', value: style.label, inline: true },
      { name: 'Proposée par', value: `<@${decision.proposer.discordId}>`, inline: true },
    )
    .setFooter({ text: `Réf. ${decision.id}` })
    .setTimestamp(decision.createdAt);

  if (decision.meetingLink?.meeting) {
    embed.addFields({
      name: 'Réunion d\'origine',
      value: `${decision.meetingLink.meeting.title} (${formatDate(decision.meetingLink.meeting.scheduledAt)})`,
    });
  }

  if (decision.decidedAt) {
    embed.addFields({ name: 'Tranchée le', value: formatDateTime(decision.decidedAt), inline: true });
  }

  return embed;
}

export function buildDecisionButtons(
  decision: DecisionWithRelations,
): ActionRowBuilder<ButtonBuilder>[] {
  if (decision.status === DecisionStatus.PROPOSEE) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`decision:approve:${decision.id}`)
          .setLabel('Valider')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`decision:reject:${decision.id}`)
          .setLabel('Rejeter')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger),
      ),
    ];
  }

  // Une décision validée peut encore produire une tâche.
  if (decision.status === DecisionStatus.VALIDEE) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`decision:task:${decision.id}`)
          .setLabel('Créer la tâche associée')
          .setEmoji('📋')
          .setStyle(ButtonStyle.Primary),
      ),
    ];
  }

  return [];
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
