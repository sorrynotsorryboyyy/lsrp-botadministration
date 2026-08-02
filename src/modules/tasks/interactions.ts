import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  AnySelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { TaskStatus } from '@prisma/client';
import EmbedFactory from '@services/EmbedFactory';
import { enforce, failGracefully, resolveActor } from '@services/InteractionContext';
import { ButtonHandler, ModalHandler, SelectMenuHandler } from '@apptypes/command.types';
import {
  addTaskComment,
  assignTask,
  getRecentTaskComments,
  getTask,
  updateTaskStatus,
} from './services/taskService';
import { buildTaskButtons, buildTaskEmbed, buildTaskStatusSelectMenu } from './embeds/taskEmbeds';
import { canAssignTask, canCommentTask, canUpdateTaskStatus } from './permissions';

const COMMENT_INPUT_ID = 'content';

/** Boutons d'un embed de tâche : `tache:<action>:<taskId>`. */
export const taskButtons: ButtonHandler = {
  customIdPrefix: 'tache',
  async execute(interaction: ButtonInteraction): Promise<void> {
    const [, action, taskId] = interaction.customId.split(':');
    if (!taskId || !interaction.inCachedGuild()) return;

    if (action === 'comment') {
      await interaction.showModal(buildCommentModal(taskId));
      return;
    }

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    const task = await getTask(taskId);
    if (!task) {
      await interaction.reply({
        embeds: [EmbedFactory.errorEmbed('Introuvable', 'Cette tâche n\'existe plus.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (action === 'claim') {
      await interaction.deferUpdate();

      try {
        const check = canAssignTask(
          { grade: context.actorGrade, memberId: context.actor.id },
          { assigneeId: task.assigneeId, creatorId: task.creatorId },
          context.actor.id,
        );

        if (!check.allowed) {
          await interaction.followUp({
            embeds: [EmbedFactory.errorEmbed('Permission refusée', check.reason!)],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }

        const updated = await assignTask(taskId, context.actor);

        // Le bouton « S'assigner » doit désormais apparaître désactivé.
        await interaction.message.edit({
          embeds: [buildTaskEmbed(updated)],
          components: buildTaskButtons(updated),
        });

        await interaction.followUp({
          embeds: [
            EmbedFactory.successEmbed('Tâche assignée', `**${updated.title}** vous est assignée.`),
          ],
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        await failGracefully(interaction, error, 'auto-assignation de tâche');
      }
      return;
    }

    if (action === 'status') {
      const check = canUpdateTaskStatus(
        { grade: context.actorGrade, memberId: context.actor.id },
        { assigneeId: task.assigneeId, creatorId: task.creatorId },
      );

      if (!check.allowed) {
        await interaction.reply({
          embeds: [EmbedFactory.errorEmbed('Permission refusée', check.reason!)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        embeds: [EmbedFactory.infoEmbed(task.title, `Statut actuel : **${task.status}**`)],
        components: [buildTaskStatusSelectMenu(task)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

/** Select menu de statut : `tacheselect:status:<taskId>`. */
export const taskStatusSelect: SelectMenuHandler = {
  customIdPrefix: 'tacheselect',
  async execute(interaction: AnySelectMenuInteraction): Promise<void> {
    const [, , taskId] = interaction.customId.split(':');
    if (!taskId || !interaction.inCachedGuild()) return;

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    await interaction.deferUpdate();

    try {
      const task = await getTask(taskId);
      if (!task) throw new Error('Tâche introuvable.');

      const check = canUpdateTaskStatus(
        { grade: context.actorGrade, memberId: context.actor.id },
        { assigneeId: task.assigneeId, creatorId: task.creatorId },
      );

      if (!check.allowed) {
        await interaction.editReply({
          embeds: [EmbedFactory.errorEmbed('Permission refusée', check.reason!)],
          components: [],
        });
        return;
      }

      const { task: updated } = await updateTaskStatus(taskId, interaction.values[0] as TaskStatus);

      await interaction.editReply({
        embeds: [
          EmbedFactory.successEmbed(
            'Statut mis à jour',
            `**${updated.title}** est passée en **${updated.status}**.`,
          ),
        ],
        components: [],
      });
    } catch (error) {
      await failGracefully(interaction, error, 'changement de statut de tâche');
    }
  },
};

/** Modal de commentaire : `tachemodal:comment:<taskId>`. */
export const taskCommentModal: ModalHandler = {
  customIdPrefix: 'tachemodal',
  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    const [, , taskId] = interaction.customId.split(':');
    if (!taskId || !interaction.inCachedGuild()) return;

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      if (!(await enforce(interaction, canCommentTask(context.actorGrade)))) return;

      const task = await getTask(taskId);
      if (!task) throw new Error('Tâche introuvable.');

      await addTaskComment(taskId, context.actor, interaction.fields.getTextInputValue(COMMENT_INPUT_ID));

      const refreshed = await getTask(taskId);
      if (refreshed && interaction.message) {
        const comments = await getRecentTaskComments(taskId);
        await interaction.message.edit({
          embeds: [buildTaskEmbed(refreshed, comments)],
          components: buildTaskButtons(refreshed),
        });
      }

      await interaction.editReply({
        embeds: [EmbedFactory.successEmbed('Commentaire ajouté', `Publié sur **${task.title}**.`)],
      });
    } catch (error) {
      await failGracefully(interaction, error, 'commentaire de tâche');
    }
  },
};

function buildCommentModal(taskId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`tachemodal:comment:${taskId}`)
    .setTitle('Commenter la tâche')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(COMMENT_INPUT_ID)
          .setLabel('Votre commentaire')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000),
      ),
    );
}
