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
import { ProjectStatus } from '@prisma/client';
import EmbedFactory from '@services/EmbedFactory';
import ChannelResolver from '@services/ChannelResolver';
import { enforce, failGracefully, resolveActor } from '@services/InteractionContext';
import { ButtonHandler, ModalHandler, SelectMenuHandler } from '@apptypes/command.types';
import {
  addProjectComment,
  getProject,
  getRecentComments,
  updateProjectStatus,
} from './services/projectService';
import {
  buildProjectButtons,
  buildProjectEmbed,
  buildStatusChangeEmbed,
  buildStatusSelectMenu,
} from './embeds/projectEmbeds';
import { canCommentProject, canUpdateProjectStatus } from './permissions';

const COMMENT_INPUT_ID = 'content';

/** Boutons d'un embed de projet : `projet:<action>:<projectId>`. */
export const projectButtons: ButtonHandler = {
  customIdPrefix: 'projet',
  async execute(interaction: ButtonInteraction): Promise<void> {
    const [, action, projectId] = interaction.customId.split(':');
    if (!projectId || !interaction.inCachedGuild()) return;

    if (action === 'comment') {
      await interaction.showModal(buildCommentModal(projectId));
      return;
    }

    if (action === 'status') {
      const context = await resolveActor(interaction, interaction.member);
      if (!context) return;

      const project = await getProject(projectId);
      if (!project) {
        await interaction.reply({
          embeds: [EmbedFactory.errorEmbed('Introuvable', 'Ce projet n\'existe plus.')],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        embeds: [
          EmbedFactory.infoEmbed(project.title, `Statut actuel : **${project.status}**`),
        ],
        components: [buildStatusSelectMenu(project)],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

/** Select menu de statut : `projetselect:status:<projectId>`. */
export const projectStatusSelect: SelectMenuHandler = {
  customIdPrefix: 'projetselect',
  async execute(interaction: AnySelectMenuInteraction): Promise<void> {
    const [, , projectId] = interaction.customId.split(':');
    if (!projectId || !interaction.inCachedGuild()) return;

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    await interaction.deferUpdate();

    try {
      const project = await getProject(projectId);
      if (!project) throw new Error('Projet introuvable.');

      const newStatus = interaction.values[0] as ProjectStatus;

      const check = canUpdateProjectStatus(
        { grade: context.actorGrade, memberId: context.actor.id },
        { managerId: project.managerId, memberIds: project.members.map((m) => m.memberId) },
        newStatus,
      );

      if (!check.allowed) {
        await interaction.editReply({
          embeds: [EmbedFactory.errorEmbed('Permission refusée', check.reason!)],
          components: [],
        });
        return;
      }

      const { project: updated, previousStatus } = await updateProjectStatus(
        projectId,
        newStatus,
        context.actor,
      );

      await publishStatusChange(interaction, updated, previousStatus);

      await interaction.editReply({
        embeds: [
          EmbedFactory.successEmbed(
            'Statut mis à jour',
            `**${updated.title}** est passé en **${newStatus}**.`,
          ),
        ],
        components: [],
      });
    } catch (error) {
      await failGracefully(interaction, error, 'changement de statut de projet');
    }
  },
};

/** Modal de commentaire : `projetmodal:comment:<projectId>`. */
export const projectCommentModal: ModalHandler = {
  customIdPrefix: 'projetmodal',
  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    const [, , projectId] = interaction.customId.split(':');
    if (!projectId || !interaction.inCachedGuild()) return;

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const project = await getProject(projectId);
      if (!project) throw new Error('Projet introuvable.');

      const check = canCommentProject(
        { grade: context.actorGrade, memberId: context.actor.id },
        { managerId: project.managerId, memberIds: project.members.map((m) => m.memberId) },
      );
      if (!(await enforce(interaction, check))) return;

      const content = interaction.fields.getTextInputValue(COMMENT_INPUT_ID);
      await addProjectComment(projectId, context.actor, content);

      // L'embed d'origine affiche les derniers commentaires : on le rafraîchit
      // pour que le nouveau message y apparaisse immédiatement.
      const refreshed = await getProject(projectId);
      if (refreshed && interaction.message) {
        const comments = await getRecentComments(projectId);
        await interaction.message.edit({
          embeds: [buildProjectEmbed(refreshed, comments)],
          components: buildProjectButtons(refreshed),
        });
      }

      await interaction.editReply({
        embeds: [EmbedFactory.successEmbed('Commentaire ajouté', `Publié sur **${project.title}**.`)],
      });
    } catch (error) {
      await failGracefully(interaction, error, 'commentaire de projet');
    }
  },
};

/** Annonce le changement de statut dans le salon du pôle. */
async function publishStatusChange(
  interaction: AnySelectMenuInteraction<'cached'>,
  project: Awaited<ReturnType<typeof getProject>>,
  previousStatus: ProjectStatus,
): Promise<void> {
  if (!project?.pole) return;

  // Tout reste dans le hub du pôle : la catégorie Archives a disparu, un projet
  // clôturé se retrouve désormais par filtre plutôt qu'en changeant de salon.
  const channel = await ChannelResolver.getPoleChannel(
    interaction.guild,
    project.pole.name,
    'HUB',
  );

  await channel?.send({
    embeds: [buildStatusChangeEmbed(project, previousStatus, interaction.user.id)],
  });
}

function buildCommentModal(projectId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`projetmodal:comment:${projectId}`)
    .setTitle('Commenter le projet')
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
