import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { Grade, PoleName } from '@prisma/client';
import { isGradeHigherOrEqual } from '@apptypes/grade.types';
import EmbedFactory from '@services/EmbedFactory';
import {
  failGracefully,
  replyError,
  resolveCommandActor,
  resolveMemberTarget,
} from '@services/InteractionContext';
import { POLE_RANK_LABELS, PoleRank, getRolesForPole } from '@config/poleRoles.config';
import GuildStructureService from '@services/GuildStructureService';
import prisma from '@database/prisma';
import { schedulePanelRefresh } from '@modules/panels/services/panelRefreshService';
import { PanelId } from '@modules/panels/registry';
import {
  assignToPole,
  getUnassignedMembers,
  poleLabel,
  removeFromPole,
  syncPoleRoles,
} from '../services/assignmentService';
import { MIN_GRADE_ASSIGN } from '../interactions';

export async function handlePole(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  switch (interaction.options.getSubcommand()) {
    case 'affecter':
      return handleAssign(interaction);
    case 'retirer':
      return handleRemove(interaction);
    case 'en-attente':
      return handleWaiting(interaction);
    case 'sync':
      return handleSync(interaction);
    default:
      return replyError(interaction, 'Sous-commande inconnue.');
  }
}

async function handleAssign(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  if (!isGradeHigherOrEqual(context.actorGrade, MIN_GRADE_ASSIGN)) {
    return replyError(
      interaction,
      "Seuls les Chefs d'équipe et au-dessus peuvent affecter un membre à un pôle.",
    );
  }

  const guildMember = interaction.options.getMember('membre');
  if (!guildMember || !('user' in guildMember)) {
    return replyError(interaction, 'Membre introuvable sur le serveur.');
  }

  const pole = interaction.options.getString('pole', true) as PoleName;
  const rank = interaction.options.getString('rang', true) as PoleRank;

  // Nommer un Directeur de pôle engage la structure : ce n'est pas à la portée
  // d'un Chef d'équipe, même s'il peut affecter les rangs inférieurs.
  if (rank === PoleRank.DIRECTEUR && !isGradeHigherOrEqual(context.actorGrade, Grade.DIRECTEUR_POLE)) {
    return replyError(
      interaction,
      'Seuls les Directeurs de Pôle et au-dessus peuvent nommer un Directeur de pôle.',
    );
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const target = await resolveMemberTarget(interaction, guildMember);
    if (!target) return;

    const result = await assignToPole({
      target,
      targetMember: guildMember,
      pole,
      rank,
      actor: context.actor,
    });

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Membre affecté',
          `**${target.username}** rejoint **${poleLabel(pole)}** comme **${POLE_RANK_LABELS[rank]}**.` +
            (result.rolesSynced
              ? ''
              : "\n\n⚠️ Les rôles Discord n'ont pas pu être appliqués — vérifiez la position du rôle du bot."),
        ),
      ],
    });

    schedulePanelRefresh(interaction.guild, PanelId.ATTENTE, null);
    schedulePanelRefresh(interaction.guild, PanelId.POLE, pole);
  } catch (error) {
    await failGracefully(interaction, error, 'affectation à un pôle');
  }
}

async function handleRemove(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  if (!isGradeHigherOrEqual(context.actorGrade, MIN_GRADE_ASSIGN)) {
    return replyError(interaction, "Seuls les Chefs d'équipe et au-dessus peuvent retirer un membre.");
  }

  const guildMember = interaction.options.getMember('membre');
  if (!guildMember || !('user' in guildMember)) {
    return replyError(interaction, 'Membre introuvable sur le serveur.');
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const target = await resolveMemberTarget(interaction, guildMember);
    if (!target) return;

    await removeFromPole(target, guildMember, context.actor);

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Membre retiré',
          `**${target.username}** n'appartient plus à aucun pôle et retourne en attente.`,
        ),
      ],
    });

    schedulePanelRefresh(interaction.guild, PanelId.ATTENTE, null);
  } catch (error) {
    await failGracefully(interaction, error, 'retrait de pôle');
  }
}

async function handleWaiting(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const waiting = await getUnassignedMembers();

    await interaction.editReply({
      embeds: [
        EmbedFactory.infoEmbed(
          "Membres en attente d'affectation",
          waiting.length > 0
            ? waiting.map((m) => `• <@${m.discordId}> — arrivé le ${m.joinedAt.toLocaleDateString('fr-FR')}`).join('\n')
            : '_Personne en attente._',
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'liste des membres en attente');
  }
}

/**
 * Réaligne les rôles Discord sur les affectations enregistrées en base.
 *
 * Utile après un `/setup` qui a recréé les rôles : les IDs ont changé, et les
 * membres portent d'anciens rôles supprimés.
 */
async function handleSync(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveCommandActor(interaction);
  if (!context) return;

  if (!isGradeHigherOrEqual(context.actorGrade, Grade.DIRECTEUR_POLE)) {
    return replyError(interaction, 'Seuls les Directeurs de Pôle et au-dessus peuvent resynchroniser.');
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const members = await prisma.member.findMany({
      where: { poleId: { not: null }, status: { not: 'PARTI' } },
      include: { pole: true },
    });

    let synced = 0;
    let failed = 0;

    for (const record of members) {
      if (!record.pole) continue;

      const guildMember = await interaction.guild.members.fetch(record.discordId).catch(() => null);
      if (!guildMember) continue;

      // Le rang n'est pas stocké en base : on conserve celui déjà porté, ou on
      // retombe sur Membre pour ceux dont le rôle a disparu.
      const rank = (await findCurrentRank(guildMember, record.pole.name)) ?? PoleRank.MEMBRE;

      const ok = await syncPoleRoles(guildMember, record.pole.name, rank);
      ok ? synced++ : failed++;
    }

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Synchronisation terminée',
          `**${synced}** membre(s) synchronisé(s)` + (failed > 0 ? `, **${failed}** en échec.` : '.'),
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'synchronisation des rôles de pôle');
  }
}

async function findCurrentRank(
  guildMember: { roles: { cache: Map<string, unknown> } },
  pole: PoleName,
): Promise<PoleRank | null> {
  for (const config of getRolesForPole(pole)) {
    const id = await GuildStructureService.get(config.key);
    if (id && guildMember.roles.cache.has(id)) return config.rank;
  }

  return null;
}
