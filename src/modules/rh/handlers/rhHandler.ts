import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
  TextChannel,
} from 'discord.js';
import {
  ApplicationType,
  Grade,
  PoleName,
  SanctionSeverity,
  SanctionType,
} from '@prisma/client';
import ChannelResolver from '@services/ChannelResolver';
import EmbedFactory from '@services/EmbedFactory';
import MemberService from '@services/MemberService';
import prisma from '@database/prisma';
import logger from '@core/Logger';
import { getGradeLevel } from '@apptypes/grade.types';
import * as rules from '../permissions';
import { createApplication } from '../services/applicationService';
import { applyGradeChange, applyPoleTransfer } from '../services/promotionService';
import { createSanction, createWarning, countWarnings } from '../services/sanctionService';
import { getMemberDossier } from '../services/memberHistoryService';
import {
  buildApplicationButtons,
  buildApplicationEmbed,
  buildHistoryEmbed,
  buildPoleTransferEmbed,
  buildPromotionEmbed,
  buildSanctionEmbed,
  buildWarningEmbed,
} from '../embeds/rhEmbeds';
import { enforce, replyError, resolveActor, resolveTarget } from './context';

/** Route `/rh <sous-commande>` vers son handler. */
export async function handleRh(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'recruter':
      return handleRecruit(interaction);
    case 'candidature':
      return handleApply(interaction);
    case 'promouvoir':
      return handleGradeChange(interaction, 'promote');
    case 'retrograder':
      return handleGradeChange(interaction, 'demote');
    case 'changer-pole':
      return handleTransfer(interaction);
    case 'avertir':
      return handleWarn(interaction);
    case 'sanctionner':
      return handleSanction(interaction);
    case 'historique':
      return handleHistory(interaction);
    default:
      return replyError(interaction, `Sous-commande inconnue : ${subcommand}`);
  }
}

/** `/rh recruter` — ouvre une candidature au nom d'un candidat externe. */
async function handleRecruit(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveActor(interaction);
  if (!context) return;

  const candidate = interaction.options.getUser('candidat', true);
  const pole = interaction.options.getString('pole', true) as PoleName;
  const motivation = interaction.options.getString('motivation', true);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const application = await createApplication({
      type: ApplicationType.RECRUTEMENT_EXTERNE,
      candidateDiscordId: candidate.id,
      candidatePseudo: candidate.username,
      motivation,
      targetPole: pole,
    });

    const posted = await publishApplication(interaction, application);

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Candidature enregistrée',
          posted
            ? `La candidature de **${candidate.username}** a été publiée dans ${posted}.`
            : `La candidature de **${candidate.username}** est enregistrée, mais le salon des candidatures est introuvable. Exécutez \`/setup\`.`,
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error);
  }
}

/** `/rh candidature` — candidature interne, déposée pour soi-même. */
async function handleApply(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveActor(interaction);
  if (!context) return;

  const pole = interaction.options.getString('pole', true) as PoleName;
  const motivation = interaction.options.getString('motivation', true);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const application = await createApplication({
      type: ApplicationType.CANDIDATURE_INTERNE,
      candidateDiscordId: interaction.user.id,
      candidatePseudo: interaction.user.username,
      candidateId: context.actor.id,
      motivation,
      targetPole: pole,
    });

    const posted = await publishApplication(interaction, application);

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Candidature transmise',
          posted
            ? `Votre candidature a été transmise dans ${posted}. Vous serez notifié de la décision.`
            : 'Votre candidature est enregistrée, mais le salon des candidatures est introuvable. Prévenez un administrateur.',
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error);
  }
}

/** `/rh promouvoir` et `/rh retrograder` partagent toute leur mécanique. */
async function handleGradeChange(
  interaction: ChatInputCommandInteraction<'cached'>,
  mode: 'promote' | 'demote',
): Promise<void> {
  const context = await resolveActor(interaction);
  if (!context) return;

  const targetUser = interaction.options.getMember('membre');
  if (!targetUser || !('user' in targetUser)) {
    return replyError(interaction, 'Membre introuvable sur le serveur.');
  }

  const targetContext = await resolveTarget(interaction, targetUser);
  if (!targetContext) return;

  const newGrade = interaction.options.getString('grade', true) as Grade;
  const reason = interaction.options.getString('motif') ?? undefined;

  const check =
    mode === 'promote'
      ? rules.canPromote(context.actorGrade, targetContext.targetGrade, newGrade)
      : rules.canDemote(context.actorGrade, targetContext.targetGrade, newGrade);

  if (!(await enforce(interaction, check))) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const rolesSynced = await applyGradeChange({
      target: targetContext.target,
      targetMember: targetContext.targetMember,
      actor: context.actor,
      newGrade,
      reason,
    });

    const embed = buildPromotionEmbed(
      targetContext.target,
      context.actor,
      targetContext.targetGrade,
      newGrade,
      reason,
      mode === 'promote',
    );

    const channel = await ChannelResolver.getChannel(interaction.guild, 'RH_HUB');
    await channel?.send({ embeds: [embed] });

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          mode === 'promote' ? 'Promotion appliquée' : 'Rétrogradation appliquée',
          buildGradeChangeSummary(rolesSynced, channel),
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error);
  }
}

/** `/rh changer-pole` */
async function handleTransfer(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveActor(interaction);
  if (!context) return;

  const targetUser = interaction.options.getMember('membre');
  if (!targetUser || !('user' in targetUser)) {
    return replyError(interaction, 'Membre introuvable sur le serveur.');
  }

  const targetContext = await resolveTarget(interaction, targetUser);
  if (!targetContext) return;

  const check = rules.canTransferPole(context.actorGrade, targetContext.targetGrade);
  if (!(await enforce(interaction, check))) return;

  const newPole = interaction.options.getString('pole', true) as PoleName;
  const reason = interaction.options.getString('motif') ?? undefined;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const previousPole = targetContext.target.poleId
      ? await prisma.pole.findUnique({ where: { id: targetContext.target.poleId } })
      : null;

    await applyPoleTransfer(targetContext.target, context.actor, newPole, reason);

    const pole = await prisma.pole.findUnique({ where: { name: newPole } });

    const embed = buildPoleTransferEmbed(
      targetContext.target,
      context.actor,
      previousPole?.displayName ?? 'Aucun',
      pole?.displayName ?? newPole,
      reason,
    );

    const channel = await ChannelResolver.getChannel(interaction.guild, 'RH_HUB');
    await channel?.send({ embeds: [embed] });

    await interaction.editReply({
      embeds: [EmbedFactory.successEmbed('Changement de pôle appliqué', `Nouveau pôle : **${pole?.displayName ?? newPole}**.`)],
    });
  } catch (error) {
    await failGracefully(interaction, error);
  }
}

/** `/rh avertir` */
async function handleWarn(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveActor(interaction);
  if (!context) return;

  const targetUser = interaction.options.getMember('membre');
  if (!targetUser || !('user' in targetUser)) {
    return replyError(interaction, 'Membre introuvable sur le serveur.');
  }

  const targetContext = await resolveTarget(interaction, targetUser);
  if (!targetContext) return;

  const check = rules.canWarn(context.actorGrade, targetContext.targetGrade);
  if (!(await enforce(interaction, check))) return;

  const reason = interaction.options.getString('motif', true);

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const warning = await createWarning(targetContext.target, context.actor, reason);
    const total = await countWarnings(targetContext.target.id);

    const embed = buildWarningEmbed(warning, targetContext.target, context.actor, total);

    const channel = await ChannelResolver.getChannel(interaction.guild, 'RH_CONFIDENTIEL');
    await channel?.send({ embeds: [embed] });

    await notifyMember(targetContext.targetMember, embed, 'un avertissement');

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Avertissement enregistré',
          `**${targetContext.target.username}** totalise désormais **${total}** avertissement(s).`,
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error);
  }
}

/** `/rh sanctionner` */
async function handleSanction(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveActor(interaction);
  if (!context) return;

  const targetUser = interaction.options.getMember('membre');
  if (!targetUser || !('user' in targetUser)) {
    return replyError(interaction, 'Membre introuvable sur le serveur.');
  }

  const targetContext = await resolveTarget(interaction, targetUser);
  if (!targetContext) return;

  const type = interaction.options.getString('type', true) as SanctionType;
  const severity = interaction.options.getString('gravite', true) as SanctionSeverity;
  const reason = interaction.options.getString('motif', true);
  const durationDays = interaction.options.getInteger('duree') ?? undefined;

  const check = rules.canSanction(context.actorGrade, targetContext.targetGrade, type);
  if (!(await enforce(interaction, check))) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const sanction = await createSanction({
      target: targetContext.target,
      actor: context.actor,
      type,
      severity,
      reason,
      durationDays,
    });

    const embed = buildSanctionEmbed(sanction, targetContext.target, context.actor);

    const channel = await ChannelResolver.getChannel(interaction.guild, 'RH_CONFIDENTIEL');
    await channel?.send({ embeds: [embed] });

    await notifyMember(targetContext.targetMember, embed, 'une sanction');

    await interaction.editReply({
      embeds: [
        EmbedFactory.successEmbed(
          'Sanction enregistrée',
          `Sanction **${type}** appliquée à **${targetContext.target.username}**.`,
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error);
  }
}

/** `/rh historique` */
async function handleHistory(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
  const context = await resolveActor(interaction);
  if (!context) return;

  const requested = interaction.options.getUser('membre') ?? interaction.user;
  const isSelf = requested.id === interaction.user.id;

  const check = rules.canViewHistory(context.actorGrade, isSelf);
  if (!(await enforce(interaction, check))) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const member = await MemberService.getMemberByDiscordId(requested.id);

    if (!member) {
      await interaction.editReply({
        embeds: [
          EmbedFactory.infoEmbed(
            'Aucun dossier',
            `**${requested.username}** n'a pas encore de dossier RH enregistré.`,
          ),
        ],
      });
      return;
    }

    const dossier = await getMemberDossier(member.id);
    if (!dossier) {
      await interaction.editReply({
        embeds: [EmbedFactory.errorEmbed('Erreur', 'Dossier introuvable.')],
      });
      return;
    }

    await interaction.editReply({ embeds: [buildHistoryEmbed(dossier, interaction.user)] });
  } catch (error) {
    await failGracefully(interaction, error);
  }
}

/** Publie une candidature dans `#candidatures` avec ses boutons de décision. */
async function publishApplication(
  interaction: ChatInputCommandInteraction<'cached'>,
  application: Awaited<ReturnType<typeof createApplication>>,
): Promise<TextChannel | null> {
  const channel = await ChannelResolver.getChannel(interaction.guild, 'RH_HUB');
  if (!channel) return null;

  await channel.send({
    embeds: [buildApplicationEmbed(application)],
    components: [buildApplicationButtons(application.id)],
  });

  return channel;
}

/**
 * Informe le membre en message privé.
 *
 * Un DM fermé est un cas courant et sans gravité : on journalise sans remonter
 * d'erreur, l'action RH étant déjà enregistrée et publiée dans le salon dédié.
 */
async function notifyMember(
  member: GuildMember,
  embed: EmbedBuilder,
  label: string,
): Promise<void> {
  try {
    await member.send({
      content: `Vous avez reçu ${label} sur **La Scène RP**.`,
      embeds: [embed],
    });
  } catch {
    logger.info(`Impossible de notifier ${member.user.tag} en MP (messages privés fermés).`);
  }
}

function buildGradeChangeSummary(rolesSynced: boolean, channel: TextChannel | null): string {
  const parts: string[] = [];

  parts.push(
    rolesSynced
      ? 'Les rôles Discord ont été synchronisés.'
      : '⚠️ Les rôles Discord n\'ont pas pu être synchronisés — vérifiez la position du rôle du bot.',
  );

  if (!channel) {
    parts.push('Le salon `#rh` est introuvable : exécutez `/setup`.');
  }

  return parts.join('\n');
}

/** Transforme une erreur métier en réponse lisible, sans exposer la stack. */
async function failGracefully(
  interaction: ChatInputCommandInteraction,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : 'Erreur inconnue.';
  logger.error('Erreur dans le module RH:', error);

  const embed = EmbedFactory.errorEmbed('Action impossible', message);

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}
