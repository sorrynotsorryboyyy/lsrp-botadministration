import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { PoleName, Priority } from '@prisma/client';
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
import {
  addProjectComment,
  addProjectMember,
  createProject,
  getProject,
  getRecentComments,
  removeProjectMember,
  searchProjects,
} from '../services/projectService';
import {
  buildProjectButtons,
  buildProjectEmbed,
  buildStatusSelectMenu,
} from '../embeds/projectEmbeds';
import {
  canCommentProject,
  canCreateProject,
  canManageProjectMembers,
  canOpenStatusMenu,
} from '../permissions';

export async function handleProject(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  switch (interaction.options.getSubcommand()) {
    case 'creer':
      return handleCreate(interaction);
    case 'info':
      return handleInfo(interaction);
    case 'statut':
      return handleStatus(interaction);
    case 'membre':
      return handleMember(interaction);
    case 'commenter':
      return handleComment(interaction);
    default:
      return replyError(interaction, 'Sous-commande inconnue.');
  }
}

async function handleCreate(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  if (!(await enforce(interaction, canCreateProject(context.actorGrade)))) return;

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
    const project = await createProject({
      title: interaction.options.getString('titre', true),
      description: interaction.options.getString('description', true),
      manager: context.actor,
      priority: interaction.options.getString('priorite', true) as Priority,
      pole: (interaction.options.getString('pole') as PoleName) ?? undefined,
      dueDate,
    });

    const channel = project.pole
      ? await ChannelResolver.getPoleChannel(interaction.guild, project.pole.name, 'HUB')
      : null;

    await channel?.send({
      embeds: [buildProjectEmbed(project)],
      components: buildProjectButtons(project),
    });

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Projet créé',
          channel
            ? `**${project.title}** a été publié dans ${channel}.`
            : `**${project.title}** a été créé. Aucun salon de pôle associé — pensez à \`/setup\`.`,
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'création de projet');
  }
}

async function handleInfo(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const project = await requireProject(interaction.options.getString('projet', true));
    const comments = await getRecentComments(project.id);

    await interaction.editReply({ embeds: [buildProjectEmbed(project, comments)] });
  } catch (error) {
    await failGracefully(interaction, error, 'consultation de projet');
  }
}

/**
 * Affiche le select menu des transitions possibles. Le changement lui-même est
 * appliqué par le handler de select menu.
 */
async function handleStatus(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  try {
    const project = await requireProject(interaction.options.getString('projet', true));

    // Seul le lien avec le projet est vérifié ici : le statut cible n'est pas
    // encore choisi. La restriction propre à la clôture est appliquée par le
    // handler du select menu, une fois la cible connue.
    const check = canOpenStatusMenu(
      { grade: context.actorGrade, memberId: context.actor.id },
      { managerId: project.managerId, memberIds: project.members.map((m) => m.memberId) },
    );
    if (!(await enforce(interaction, check))) return;

    await interaction.reply({
      embeds: [
        EmbedFactory.infoEmbed(
          project.title,
          `Statut actuel : **${project.status}**\nChoisissez le nouveau statut ci-dessous.`,
        ),
      ],
      components: [buildStatusSelectMenu(project)],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    await failGracefully(interaction, error, 'changement de statut');
  }
}

async function handleMember(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  const guildMember = interaction.options.getMember('membre');
  if (!guildMember || !('user' in guildMember)) {
    return replyError(interaction, 'Membre introuvable sur le serveur.');
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const project = await requireProject(interaction.options.getString('projet', true));

    const check = canManageProjectMembers(
      { grade: context.actorGrade, memberId: context.actor.id },
      { managerId: project.managerId, memberIds: project.members.map((m) => m.memberId) },
    );
    if (!(await enforce(interaction, check))) return;

    const target = await resolveMemberTarget(interaction, guildMember);
    if (!target) return;

    const action = interaction.options.getString('action', true);

    if (action === 'ajouter') {
      await addProjectMember(project.id, target);
    } else {
      await removeProjectMember(project.id, target);
    }

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          action === 'ajouter' ? 'Membre ajouté' : 'Membre retiré',
          `**${target.username}** ${action === 'ajouter' ? 'participe désormais à' : 'ne participe plus à'} **${project.title}**.`,
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'gestion des membres du projet');
  }
}

async function handleComment(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const project = await requireProject(interaction.options.getString('projet', true));

    const check = canCommentProject(
      { grade: context.actorGrade, memberId: context.actor.id },
      { managerId: project.managerId, memberIds: project.members.map((m) => m.memberId) },
    );
    if (!(await enforce(interaction, check))) return;

    await addProjectComment(
      project.id,
      context.actor,
      interaction.options.getString('message', true),
    );

    await interaction.editReply({
      embeds: [EmbedFactory.successEmbed('Commentaire ajouté', `Publié sur **${project.title}**.`)],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'commentaire de projet');
  }
}

/** Autocomplétion de l'option `projet`. */
export async function handleProjectAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const focused = interaction.options.getFocused();
  const projects = await searchProjects(focused);

  await interaction.respond(
    projects.map((project) => ({
      name: truncateChoice(project.title),
      value: project.id,
    })),
  );
}

async function requireProject(id: string) {
  const project = await getProject(id);
  if (!project) {
    throw new Error('Projet introuvable. Sélectionnez-le dans la liste proposée.');
  }
  return project;
}

/** Un choix d'autocomplétion Discord est limité à 100 caractères. */
function truncateChoice(text: string): string {
  return text.length <= 100 ? text : `${text.slice(0, 97)}...`;
}
