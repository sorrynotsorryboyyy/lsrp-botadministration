import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { Prisma, TaskStatus } from '@prisma/client';
import EmbedFactory from '@services/EmbedFactory';
import { formatDate, formatDateTime } from '@utils/dateFormatter';
import { getAvailableTaskStatuses, TASK_STATUS_LABELS } from '@modules/projects/workflow';
import { TaskWithRelations } from '../services/taskService';

type CommentWithAuthor = Prisma.TaskCommentGetPayload<{ include: { author: true } }>;

const FIELD_LIMIT = 1024;

const TASK_STATUS_COLORS: Record<TaskStatus, number> = {
  [TaskStatus.A_FAIRE]: 0x95a5a6,
  [TaskStatus.EN_COURS]: 0x3498db,
  [TaskStatus.EN_ATTENTE]: 0xf39c12,
  [TaskStatus.EN_TEST]: 0x9b59b6,
  [TaskStatus.TERMINE]: 0x27ae60,
};

export function buildTaskEmbed(
  task: TaskWithRelations,
  comments: CommentWithAuthor[] = [],
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`📋 ${task.title}`)
    .setColor(TASK_STATUS_COLORS[task.status])
    .addFields(
      { name: 'Statut', value: TASK_STATUS_LABELS[task.status], inline: true },
      { name: 'Priorité', value: EmbedFactory.getPriorityLabel(task.priority), inline: true },
      {
        name: 'Assignée à',
        value: task.assignee ? `<@${task.assignee.discordId}>` : '_Non assignée_',
        inline: true,
      },
      { name: 'Projet', value: task.project?.title ?? '—', inline: true },
      { name: 'Échéance', value: task.dueDate ? formatDate(task.dueDate) : '—', inline: true },
      { name: 'Créée par', value: `<@${task.creator.discordId}>`, inline: true },
    )
    .setFooter({ text: `Réf. ${task.id}` })
    .setTimestamp(task.updatedAt);

  if (task.description) {
    embed.setDescription(truncate(task.description, 4096));
  }

  if (task.attachments.length > 0) {
    const files = task.attachments
      .map((a) => `[${a.fileName}](${a.fileUrl})`)
      .join('\n');
    embed.addFields({ name: `Pièces jointes (${task.attachments.length})`, value: truncate(files, FIELD_LIMIT) });
  }

  if (comments.length > 0) {
    embed.addFields({
      name: `Derniers commentaires (${task._count.comments})`,
      value: truncate(formatComments(comments), FIELD_LIMIT),
    });
  }

  return embed;
}

export function buildTaskButtons(task: TaskWithRelations): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`tache:claim:${task.id}`)
      .setLabel("S'assigner")
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Success)
      // Une tâche déjà prise ne se réclame pas d'un clic : passer par
      // `/tache assigner`, qui applique les règles de permission complètes.
      .setDisabled(task.assigneeId !== null),
    new ButtonBuilder()
      .setCustomId(`tache:status:${task.id}`)
      .setLabel('Changer le statut')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`tache:comment:${task.id}`)
      .setLabel('Commenter')
      .setEmoji('💬')
      .setStyle(ButtonStyle.Secondary),
  );

  return [row];
}

export function buildTaskStatusSelectMenu(
  task: TaskWithRelations,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = getAvailableTaskStatuses(task.status).map((status) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(TASK_STATUS_LABELS[status])
      .setValue(status)
      .setDescription(`Passer la tâche en « ${TASK_STATUS_LABELS[status]} »`),
  );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`tacheselect:status:${task.id}`)
      .setPlaceholder('Choisir le nouveau statut')
      .addOptions(options),
  );
}

function formatComments(comments: CommentWithAuthor[]): string {
  return comments
    .map((c) => `\`${formatDateTime(c.createdAt)}\` <@${c.author.discordId}> — ${c.content}`)
    .join('\n');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
