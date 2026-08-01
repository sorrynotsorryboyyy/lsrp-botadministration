import {
  ChatInputCommandInteraction,
  GuildMember,
  MessageFlags,
  RepliableInteraction,
} from 'discord.js';
import { Grade, Member } from '@prisma/client';
import MemberService from './MemberService';
import PermissionService from './PermissionService';
import EmbedFactory from './EmbedFactory';
import { PermissionCheck } from '@apptypes/permission.types';
import logger from '@core/Logger';

export interface ActorContext {
  actor: Member;
  actorGrade: Grade;
}

/**
 * Résout l'auteur d'une interaction : son enregistrement `Member` et son grade.
 *
 * Le grade provient des rôles Discord — source de vérité retenue pour ce projet —
 * et non de `Member.grade`, qui peut avoir dérivé si un rôle a été modifié à la
 * main hors du bot.
 *
 * Répond directement à l'utilisateur et renvoie `null` si aucun grade n'est
 * détecté, l'appelant n'ayant alors plus qu'à s'arrêter.
 */
export async function resolveActor(
  interaction: RepliableInteraction,
  member: GuildMember,
): Promise<ActorContext | null> {
  const grade = await PermissionService.resolveGrade(member);

  if (!grade) {
    await replyError(
      interaction,
      "Aucun grade détecté sur votre compte. Un rôle de la hiérarchie doit vous être attribué.",
    );
    return null;
  }

  const actor = await MemberService.getOrCreateMember(
    member.id,
    member.user.username,
    member.displayName,
    grade,
  );

  return { actor, actorGrade: grade };
}

/** Résout un membre visé par une action, en refusant les bots. */
export async function resolveMemberTarget(
  interaction: RepliableInteraction,
  guildMember: GuildMember,
): Promise<Member | null> {
  if (guildMember.user.bot) {
    await replyError(interaction, "Les bots ne peuvent pas être visés par cette action.");
    return null;
  }

  const grade = (await PermissionService.resolveGrade(guildMember)) ?? Grade.RECRUE;

  return MemberService.getOrCreateMember(
    guildMember.id,
    guildMember.user.username,
    guildMember.displayName,
    grade,
  );
}

/** Applique une règle métier, en répondant à l'utilisateur si elle refuse. */
export async function enforce(
  interaction: RepliableInteraction,
  check: PermissionCheck,
): Promise<boolean> {
  if (check.allowed) return true;

  await replyError(interaction, check.reason ?? 'Action non autorisée.');
  return false;
}

export async function replyError(
  interaction: RepliableInteraction,
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

/**
 * Transforme une erreur en réponse lisible.
 *
 * Les erreurs métier (`throw new Error('...')` dans les services) portent un
 * message destiné à l'utilisateur et sont affichées telles quelles ; la stack
 * n'est jamais exposée, seulement journalisée.
 */
export async function failGracefully(
  interaction: RepliableInteraction,
  error: unknown,
  context: string,
): Promise<void> {
  const message = error instanceof Error ? error.message : 'Erreur inconnue.';
  logger.error(`Erreur — ${context}:`, error);

  const embed = EmbedFactory.errorEmbed('Action impossible', message);

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ embeds: [embed] });
  } else {
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  }
}

/** Raccourci pour les commandes slash, où le membre est toujours disponible. */
export async function resolveCommandActor(
  interaction: ChatInputCommandInteraction<'cached'>,
): Promise<ActorContext | null> {
  return resolveActor(interaction, interaction.member);
}
