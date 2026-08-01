import { PermissionFlagsBits, PermissionResolvable, ColorResolvable } from 'discord.js';
import { Grade } from '@prisma/client';

export interface RoleConfig {
  grade: Grade;
  /** Nom affiché du rôle sur Discord — sert aussi de clé de recherche pour l'idempotence. */
  name: string;
  color: ColorResolvable;
  hoist: boolean;
  mentionable: boolean;
  permissions: PermissionResolvable[];
}

/**
 * Définition des 9 rôles de la hiérarchie, du plus élevé au plus bas.
 *
 * Choix délibéré : seuls Fondateur et Co-Fondateur reçoivent `Administrator`.
 * Les grades inférieurs obtiennent des permissions Discord granulaires, afin que
 * la logique métier du bot (cascade vérifiée par `PermissionService`) reste la
 * source de vérité des actions — un rôle Discord trop permissif contournerait
 * silencieusement les règles applicatives.
 */
export const ROLES_CONFIG: RoleConfig[] = [
  {
    grade: Grade.FONDATEUR,
    name: 'Fondateur',
    color: '#E91E63',
    hoist: true,
    mentionable: true,
    permissions: [PermissionFlagsBits.Administrator],
  },
  {
    grade: Grade.CO_FONDATEUR,
    name: 'Co-Fondateur',
    color: '#9C27B0',
    hoist: true,
    mentionable: true,
    permissions: [PermissionFlagsBits.Administrator],
  },
  {
    grade: Grade.DIRECTEUR_GENERAL,
    name: 'Directeur Général',
    color: '#3F51B5',
    hoist: true,
    mentionable: true,
    permissions: [
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.ViewAuditLog,
    ],
  },
  {
    grade: Grade.DIRECTEUR_POLE,
    name: 'Directeur de Pôle',
    color: '#2196F3',
    hoist: true,
    mentionable: true,
    permissions: [
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.MuteMembers,
      PermissionFlagsBits.MoveMembers,
      PermissionFlagsBits.MentionEveryone,
    ],
  },
  {
    grade: Grade.RESPONSABLE,
    name: 'Responsable',
    color: '#00BCD4',
    hoist: true,
    mentionable: true,
    permissions: [
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageThreads,
      PermissionFlagsBits.MuteMembers,
    ],
  },
  {
    grade: Grade.CHEF_EQUIPE,
    name: "Chef d'équipe",
    color: '#4CAF50',
    hoist: true,
    mentionable: true,
    permissions: [PermissionFlagsBits.ManageThreads, PermissionFlagsBits.ManageMessages],
  },
  {
    grade: Grade.COLLABORATEUR,
    name: 'Collaborateur',
    color: '#8BC34A',
    hoist: true,
    mentionable: true,
    permissions: [
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
    ],
  },
  {
    grade: Grade.RECRUE,
    name: 'Recrue',
    color: '#9E9E9E',
    hoist: true,
    mentionable: false,
    permissions: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions],
  },
];
