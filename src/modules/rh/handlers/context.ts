import { ChatInputCommandInteraction, GuildMember, MessageFlags } from 'discord.js';
import { Grade, Member } from '@prisma/client';
import MemberService from '@services/MemberService';
import PermissionService from '@services/PermissionService';
import EmbedFactory from '@services/EmbedFactory';
import { PermissionCheck } from '../permissions';

export interface ActorContext {
  actor: Member;
  actorGrade: Grade;
}

export interface TargetContext {
  target: Member;
  targetMember: GuildMember;
  targetGrade: Grade;
}

/**
 * Résout l'auteur de la commande : son enregistrement en base et son grade réel
 * déduit de ses rôles Discord.
 *
 * Le grade provient des rôles Discord (source de vérité décidée pour ce projet)
 * et non de la colonne `Member.grade`, qui peut avoir dérivé si un rôle a été
 * modifié à la main.
 */
export async function resolveActor(
  interaction: ChatInputCommandInteraction<'cached'>,
): Promise<ActorContext | null> {
  const grade = await PermissionService.resolveGrade(interaction.member);

  if (!grade) {
    await replyError(
      interaction,
      "Aucun grade détecté sur votre compte. Un rôle de la hiérarchie doit vous être attribué.",
    );
    return null;
  }

  const actor = await MemberService.getOrCreateMember(
    interaction.user.id,
    interaction.user.username,
    interaction.member.displayName,
    grade,
  );

  return { actor, actorGrade: grade };
}

/** Résout un membre visé par une action RH, en refusant les bots. */
export async function resolveTarget(
  interaction: ChatInputCommandInteraction<'cached'>,
  guildMember: GuildMember,
): Promise<TargetContext | null> {
  if (guildMember.user.bot) {
    await replyError(interaction, 'Les bots ne peuvent pas faire l\'objet d\'une action RH.');
    return null;
  }

  const grade = (await PermissionService.resolveGrade(guildMember)) ?? Grade.RECRUE;

  const target = await MemberService.getOrCreateMember(
    guildMember.id,
    guildMember.user.username,
    guildMember.displayName,
    grade,
  );

  return { target, targetMember: guildMember, targetGrade: grade };
}

/** Applique une règle de permission RH, en répondant à l'utilisateur si elle refuse. */
export async function enforce(
  interaction: ChatInputCommandInteraction,
  check: PermissionCheck,
): Promise<boolean> {
  if (check.allowed) return true;

  await replyError(interaction, check.reason ?? 'Action non autorisée.');
  return false;
}

export async function replyError(
  interaction: ChatInputCommandInteraction,
  message: string,
): Promise<void> {
  const payload = {
    embeds: [EmbedFactory.errorEmbed('Action impossible', message)],
    flags: MessageFlags.Ephemeral as const,
  };

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}
