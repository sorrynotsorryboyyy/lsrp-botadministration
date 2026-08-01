import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { Priority } from '@prisma/client';
import ChannelResolver from '@services/ChannelResolver';
import EmbedFactory from '@services/EmbedFactory';
import {
  enforce,
  failGracefully,
  replyError,
  resolveCommandActor,
  resolveMemberTarget,
} from '@services/InteractionContext';
import { parseDueDate } from '@utils/dateFormatter';
import { getProject } from '@modules/projects/services/projectService';
import {
  addAttachment,
  addTaskComment,
  assignTask,
  createTask,
  getRecentTaskComments,
  getTask,
  searchTasks,
} from '../services/taskService';
import { buildTaskButtons, buildTaskEmbed, buildTaskStatusSelectMenu } from '../embeds/taskEmbeds';
import { canAssignTask, canCommentTask, canCreateTask, canUpdateTaskStatus } from '../permissions';

export async function handleTask(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  switch (interaction.options.getSubcommand()) {
    case 'creer':
      return handleCreate(interaction);
    case 'info':
      return handleInfo(interaction);
    case 'assigner':
      return handleAssign(interaction);
    case 'statut':
      return handleStatus(interaction);
    case 'commenter':
      return handleComment(interaction);
    case 'piece-jointe':
      return handleAttachment(interaction);
    default:
      return replyError(interaction, 'Sous-commande inconnue.');
  }
}

async function handleCreate(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  if (!(await enforce(interaction, canCreateTask(context.actorGrade)))) return;

  const rawDueDate = interaction.options.getString('echeance');
  let dueDate: Date | undefined;

  if (rawDueDate) {
    const parsed = parseDueDate(rawDueDate);
    if (!parsed) {
      return replyError(interaction, 'Date invalide. Format attendu : `JJ/MM/AAAA` (ex. 31/12/2026).');
    }
    dueDate = parsed;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const assigneeMember = interaction.options.getMember('assignee');
    const assignee =
      assigneeMember && 'user' in assigneeMember
        ? await resolveMemberTarget(interaction, assigneeMember)
        : null;

    const task = await createTask({
      title: interaction.options.getString('titre', true),
      description: interaction.options.getString('description') ?? undefined,
      creator: context.actor,
      priority: interaction.options.getString('priorite', true) as Priority,
      projectId: interaction.options.getString('projet') ?? undefined,
      assignee: assignee ?? undefined,
      dueDate,
    });

    const channel = await resolveTaskChannel(interaction, task.projectId);

    await channel?.send({
      embeds: [buildTaskEmbed(task)],
      components: buildTaskButtons(task),
    });

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Tâche créée',
          channel
            ? `**${task.title}** a été publiée dans ${channel}.`
            : `**${task.title}** a été créée. Associez-la à un projet pour qu'elle soit publiée dans le salon du pôle.`,
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'création de tâche');
  }
}

async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const task = await requireTask(interaction.options.getString('tache', true));
    const comments = await getRecentTaskComments(task.id);

    await interaction.editReply({ embeds: [buildTaskEmbed(task, comments)] });
  } catch (error) {
    await failGracefully(interaction, error, 'consultation de tâche');
  }
}

async function handleAssign(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const task = await requireTask(interaction.options.getString('tache', true));

    const guildMember = interaction.options.getMember('membre');
    // Option omise : l'utilisateur se retire ou s'assigne lui-même.
    const target =
      guildMember && 'user' in guildMember
        ? await resolveMemberTarget(interaction, guildMember)
        : context.actor;

    if (!target) return;

    const check = canAssignTask(
      { grade: context.actorGrade, memberId: context.actor.id },
      { assigneeId: task.assigneeId, creatorId: task.creatorId },
      target.id,
    );
    if (!(await enforce(interaction, check))) return;

    const updated = await assignTask(task.id, target);

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Tâche assignée',
          `**${updated.title}** est désormais assignée à **${target.username}**.`,
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'assignation de tâche');
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  try {
    const task = await requireTask(interaction.options.getString('tache', true));

    const check = canUpdateTaskStatus(
      { grade: context.actorGrade, memberId: context.actor.id },
      { assigneeId: task.assigneeId, creatorId: task.creatorId },
    );
    if (!(await enforce(interaction, check))) return;

    await interaction.reply({
      embeds: [
        EmbedFactory.infoEmbed(
          task.title,
          `Statut actuel : **${task.status}**\nChoisissez le nouveau statut ci-dessous.`,
        ),
      ],
      components: [buildTaskStatusSelectMenu(task)],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    await failGracefully(interaction, error, 'changement de statut de tâche');
  }
}

async function handleComment(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  if (!(await enforce(interaction, canCommentTask(context.actorGrade)))) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const task = await requireTask(interaction.options.getString('tache', true));

    await addTaskComment(task.id, context.actor, interaction.options.getString('message', true));

    await interaction.editReply({
      embeds: [EmbedFactory.successEmbed('Commentaire ajouté', `Publié sur **${task.title}**.`)],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'commentaire de tâche');
  }
}

async function handleAttachment(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  if (!(await enforce(interaction, canCommentTask(context.actorGrade)))) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const task = await requireTask(interaction.options.getString('tache', true));
    const attachment = interaction.options.getAttachment('fichier', true);

    await addAttachment(task.id, attachment.name, attachment.url);

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Pièce jointe ajoutée',
          `**${attachment.name}** a été joint à **${task.title}**.\n\n` +
            '_Note : Discord peut expirer les liens de fichiers au bout d\'un certain temps._',
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'ajout de pièce jointe');
  }
}

export async function handleTaskAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused();
  const tasks = await searchTasks(focused);

  await interaction.respond(
    tasks.map((task) => ({ name: truncateChoice(task.title), value: task.id })),
  );
}

/** Le salon de publication d'une tâche est celui du pôle de son projet. */
async function resolveTaskChannel(
  interaction: ChatInputCommandInteraction<'cached'>,
  projectId: string | null,
) {
  if (!projectId) return null;

  const project = await getProject(projectId);
  if (!project?.pole) return null;

  return ChannelResolver.getPoleChannel(interaction.guild, project.pole.name, 'TACHES');
}

async function requireTask(id: string) {
  const task = await getTask(id);
  if (!task) {
    throw new Error('Tâche introuvable. Sélectionnez-la dans la liste proposée.');
  }
  return task;
}

function truncateChoice(text: string): string {
  return text.length <= 100 ? text : `${text.slice(0, 97)}...`;
}
