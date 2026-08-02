import { PermissionFlagsBits, PermissionResolvable, ColorResolvable } from 'discord.js';
import { PoleName } from '@prisma/client';
import { POLES_CONFIG } from './poles.config';

/**
 * Grades internes à un pôle.
 *
 * Strictement distincts de la hiérarchie business (`Grade` dans Prisma) : un
 * Admin en jeu sur Garry's Mod n'est pas un « Collaborateur de l'entreprise »,
 * c'est quelqu'un qui opère sur une entité précise. Les deux grilles coexistent
 * et un même membre peut porter un grade business ET un grade de pôle.
 */
export enum PoleRank {
  DIRECTEUR = 'DIRECTEUR',
  RESPONSABLE = 'RESPONSABLE',
  CHEF_EQUIPE = 'CHEF_EQUIPE',
  MEMBRE = 'MEMBRE',
}

/** Du plus élevé au plus bas — sert aux comparaisons d'autorité interne au pôle. */
export const POLE_RANK_ORDER: PoleRank[] = [
  PoleRank.DIRECTEUR,
  PoleRank.RESPONSABLE,
  PoleRank.CHEF_EQUIPE,
  PoleRank.MEMBRE,
];

export const POLE_RANK_LABELS: Record<PoleRank, string> = {
  [PoleRank.DIRECTEUR]: 'Directeur',
  [PoleRank.RESPONSABLE]: 'Responsable',
  [PoleRank.CHEF_EQUIPE]: "Chef d'équipe",
  [PoleRank.MEMBRE]: 'Membre',
};

/**
 * Permissions Discord accordées par rang.
 *
 * Volontairement modestes : l'autorité d'un encadrant de pôle s'exerce dans son
 * périmètre via le bot, pas par des permissions Discord globales. Un Directeur
 * de pôle ne doit pas pouvoir modifier les salons des autres pôles.
 */
const RANK_PERMISSIONS: Record<PoleRank, PermissionResolvable[]> = {
  [PoleRank.DIRECTEUR]: [
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ManageThreads,
    PermissionFlagsBits.MentionEveryone,
  ],
  [PoleRank.RESPONSABLE]: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageThreads],
  [PoleRank.CHEF_EQUIPE]: [PermissionFlagsBits.ManageThreads],
  [PoleRank.MEMBRE]: [],
};

/** Assombrit progressivement la couleur du pôle selon le rang. */
const RANK_SHADE: Record<PoleRank, number> = {
  [PoleRank.DIRECTEUR]: 1,
  [PoleRank.RESPONSABLE]: 0.8,
  [PoleRank.CHEF_EQUIPE]: 0.62,
  [PoleRank.MEMBRE]: 0.45,
};

export interface PoleRoleConfig {
  pole: PoleName;
  rank: PoleRank;
  /** Nom affiché sur Discord — sert aussi de clé de recherche pour l'idempotence. */
  name: string;
  /** Clé stable dans `GuildConfig`. */
  key: string;
  color: ColorResolvable;
  hoist: boolean;
  mentionable: boolean;
  permissions: PermissionResolvable[];
}

/** Clé `GuildConfig` d'un rôle de pôle. */
export function poleRoleKey(pole: PoleName, rank: PoleRank): string {
  return `POLEROLE_${pole}_${rank}`;
}

/**
 * Les 32 rôles de pôle : 4 rangs × 8 pôles.
 *
 * Le rôle `Membre` porte l'accès à la catégorie ; les trois autres l'accordent
 * aussi, si bien qu'un Directeur n'a pas besoin de cumuler deux rôles.
 */
export const POLE_ROLES: PoleRoleConfig[] = Object.values(POLES_CONFIG).flatMap((pole) =>
  POLE_RANK_ORDER.map((rank) => ({
    pole: pole.name,
    rank,
    name: `${POLE_RANK_LABELS[rank]} ${pole.displayName}`,
    key: poleRoleKey(pole.name, rank),
    color: shade(pole.color, RANK_SHADE[rank]),
    // Seuls les encadrants sont affichés séparément dans la liste des membres :
    // 32 rôles tous « hoist » rendraient la barre latérale illisible.
    hoist: rank !== PoleRank.MEMBRE,
    mentionable: true,
    permissions: RANK_PERMISSIONS[rank],
  })),
);

/** Tous les rôles d'un pôle donné, du plus élevé au plus bas. */
export function getRolesForPole(pole: PoleName): PoleRoleConfig[] {
  return POLE_ROLES.filter((role) => role.pole === pole);
}

/** Vrai si `actual` est au moins au niveau de `required` dans la grille du pôle. */
export function isPoleRankAtLeast(actual: PoleRank, required: PoleRank): boolean {
  return POLE_RANK_ORDER.indexOf(actual) <= POLE_RANK_ORDER.indexOf(required);
}

/** Applique un facteur de luminosité à une couleur hexadécimale. */
function shade(hex: string, factor: number): ColorResolvable {
  const value = Number.parseInt(hex.replace('#', ''), 16);

  const r = Math.round(((value >> 16) & 0xff) * factor);
  const g = Math.round(((value >> 8) & 0xff) * factor);
  const b = Math.round((value & 0xff) * factor);

  return ((r << 16) | (g << 8) | b) as ColorResolvable;
}
