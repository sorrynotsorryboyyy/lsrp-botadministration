import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { Prisma, ProjectStatus } from '@prisma/client';
import EmbedFactory from '@services/EmbedFactory';
import { formatDate, formatDateTime } from '@utils/dateFormatter';
import { ProjectWithRelations } from '../services/projectService';
import {
  getAvailableProjectStatuses,
  getProjectStatusColor,
  PROJECT_STATUS_LABELS,
} from '../workflow';

type CommentWithAuthor = Prisma.ProjectCommentGetPayload<{ include: { author: true } }>;

/** Limite d'un champ d'embed Discord. */
const FIELD_LIMIT = 1024;

export function buildProjectEmbed(
  project: ProjectWithRelations,
  comments: CommentWithAuthor[] = [],
): EmbedBuilder {
  const participants = project.members
    .map((link) => `<@${link.member.discordId}>`)
    .join(', ');

  const embed = new EmbedBuilder()
    .setTitle(`📁 ${project.title}`)
    .setColor(getProjectStatusColor(project.status))
    .setDescription(truncate(project.description, 4096))
    .addFields(
      { name: 'Statut', value: PROJECT_STATUS_LABELS[project.status], inline: true },
      { name: 'Priorité', value: EmbedFactory.getPriorityLabel(project.priority), inline: true },
      { name: 'Pôle', value: project.pole?.displayName ?? '—', inline: true },
      { name: 'Responsable', value: `<@${project.manager.discordId}>`, inline: true },
      {
        name: 'Échéance',
        value: project.dueDate ? formatDate(project.dueDate) : '—',
        inline: true,
      },
      { name: 'Tâches', value: `${project._count.tasks}`, inline: true },
      {
        name: `Participants (${project.members.length})`,
        value: truncate(participants || '—', FIELD_LIMIT),
      },
    )
    .setFooter({ text: `Réf. ${project.id}` })
    .setTimestamp(project.updatedAt);

  if (comments.length > 0) {
    embed.addFields({
      name: `Derniers commentaires (${project._count.comments})`,
      value: truncate(formatComments(comments), FIELD_LIMIT),
    });
  }

  return embed;
}

/** Boutons d'action rapide. Retirés si le projet est archivé. */
export function buildProjectButtons(project: ProjectWithRelations): ActionRowBuilder<ButtonBuilder>[] {
  if (project.status === ProjectStatus.ARCHIVE) return [];

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`projet:status:${project.id}`)
        .setLabel('Changer le statut')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`projet:comment:${project.id}`)
        .setLabel('Commenter')
        .setEmoji('💬')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

/**
 * Select menu des statuts atteignables depuis l'état courant.
 *
 * Ne propose que les transitions licites : l'utilisateur ne peut pas composer un
 * changement invalide, et le service revalide de toute façon côté serveur.
 */
export function buildStatusSelectMenu(
  project: ProjectWithRelations,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = getAvailableProjectStatuses(project.status).map((status) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(PROJECT_STATUS_LABELS[status])
      .setValue(status)
      .setDescription(`Passer le projet en « ${PROJECT_STATUS_LABELS[status]} »`),
  );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`projetselect:status:${project.id}`)
      .setPlaceholder('Choisir le nouveau statut')
      .addOptions(options),
  );
}

export function buildStatusChangeEmbed(
  project: ProjectWithRelations,
  previousStatus: ProjectStatus,
  actorDiscordId: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🔄 Changement de statut')
    .setColor(getProjectStatusColor(project.status))
    .addFields(
      { name: 'Projet', value: project.title, inline: false },
      { name: 'Avant', value: PROJECT_STATUS_LABELS[previousStatus], inline: true },
      { name: 'Après', value: PROJECT_STATUS_LABELS[project.status], inline: true },
      { name: 'Par', value: `<@${actorDiscordId}>`, inline: true },
    )
    .setFooter({ text: `Réf. ${project.id}` })
    .setTimestamp();
}

function formatComments(comments: CommentWithAuthor[]): string {
  return comments
    .map((c) => `\`${formatDateTime(c.createdAt)}\` <@${c.author.discordId}> — ${c.content}`)
    .join('\n');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
