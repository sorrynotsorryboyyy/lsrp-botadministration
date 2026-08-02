import { ChannelType, PermissionFlagsBits, OverwriteResolvable, Guild } from 'discord.js';
import { Grade, PoleName } from '@prisma/client';
import { GRADE_HIERARCHY, isGradeHigherOrEqual } from '@apptypes/grade.types';
import GuildStructureService from '@services/GuildStructureService';
import { getRolesForPole } from '@config/poleRoles.config';

/** Table `Grade → ID de rôle Discord`, résolue une fois par exécution de setup. */
export type RoleIdMap = Map<Grade, string>;

/** Contraintes d'accès d'un salon, extraites de `ChannelConfig`. */
export interface ChannelAccess {
  minGradeView?: Grade;
  minGradeWrite?: Grade;
  botOnlyWrite?: boolean;
  poleRestricted?: boolean;
  /** Type Discord ; un vocal raisonne en `Connect`/`Speak`, pas en `SendMessages`. */
  type?: ChannelType;
}

/** IDs des rôles d'appartenance d'un pôle, à autoriser sur ses salons. */
export type PoleRoleIds = string[];

/**
 * Charge les IDs des rôles d'un pôle depuis le registre.
 *
 * Les quatre rangs donnent accès à la catégorie : un Directeur n'a pas besoin de
 * cumuler son rang et le rôle « Membre ».
 */
export async function loadPoleRoleIds(guild: Guild, pole: PoleName): Promise<PoleRoleIds> {
  const ids: string[] = [];

  for (const config of getRolesForPole(pole)) {
    const id = await GuildStructureService.get(config.key);
    if (id && guild.roles.cache.has(id)) ids.push(id);
  }

  return ids;
}

/**
 * Charge la correspondance grade → ID de rôle depuis le registre `GuildConfig`.
 *
 * À appeler une seule fois puis à passer à `buildChannelOverwrites` : sans cela,
 * chaque salon déclencherait une requête par grade (~370 requêtes pour un setup
 * complet).
 *
 * Les grades dont le rôle est absent du registre ou introuvable sur le serveur
 * sont omis — un overwrite ne peut référencer qu'un rôle existant.
 */
export async function loadRoleIdMap(guild: Guild): Promise<RoleIdMap> {
  const map: RoleIdMap = new Map();

  for (const grade of GRADE_HIERARCHY) {
    const roleId = await GuildStructureService.getRoleId(grade);
    if (roleId && guild.roles.cache.has(roleId)) {
      map.set(grade, roleId);
    }
  }

  return map;
}

/**
 * Construit les permission overwrites d'un salon.
 *
 * Principe : `@everyone` porte le refus, et seuls les grades effectivement
 * habilités reçoivent une autorisation explicite. Un seuil absent signifie
 * « ouvert à tous » et ne produit donc aucun overwrite par rôle.
 *
 * ⚠️ Limite Discord assumée : les rôles portant `Administrator` (Fondateur et
 * Co-Fondateur) ignorent les refus. Un `botOnlyWrite` ne les empêchera pas
 * d'écrire. Le verrou vise l'ergonomie pour l'immense majorité des membres, pas
 * une garantie absolue ; `panelRefreshService` compense en repositionnant le
 * panneau s'il n'est plus le dernier message du salon.
 */
export function buildChannelOverwrites(
  guild: Guild,
  roleIds: RoleIdMap,
  access: ChannelAccess,
  poleRoleIds: PoleRoleIds = [],
): OverwriteResolvable[] {
  const { minGradeView, minGradeWrite, botOnlyWrite, poleRestricted } = access;

  const isVoice = access.type === ChannelType.GuildVoice;

  /** Permissions d'usage du salon, une fois l'accès accordé. */
  const usePermissions = isVoice
    ? [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
    : [PermissionFlagsBits.SendMessages];

  const everyoneDeny = [];
  // Un salon cloisonné est masqué à tous par défaut : seuls les porteurs d'un
  // rôle du pôle — et la direction générale — le voient.
  if (minGradeView || poleRestricted) {
    everyoneDeny.push(PermissionFlagsBits.ViewChannel);

    // Sur un vocal, on refuse aussi `Connect` explicitement. Discord empêche en
    // pratique de rejoindre un salon invisible, mais s'appuyer sur ce
    // comportement implicite rendrait le cloisonnement dépendant d'un détail
    // d'implémentation de la plateforme.
    if (isVoice) everyoneDeny.push(PermissionFlagsBits.Connect);
  }

  if (botOnlyWrite) {
    // Les fils sont refusés aussi : sans cela, un membre contournerait le
    // verrou en ouvrant un fil dans le salon.
    everyoneDeny.push(
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.CreatePublicThreads,
      PermissionFlagsBits.CreatePrivateThreads,
      PermissionFlagsBits.SendMessagesInThreads,
    );
  } else if (minGradeWrite) {
    everyoneDeny.push(...usePermissions);
  }

  const overwrites: OverwriteResolvable[] = [{ id: guild.id, deny: everyoneDeny }];

  // Salon verrouillé : le bot doit conserver ses propres droits, sinon il ne
  // pourrait ni publier ni épingler son panneau.
  if (botOnlyWrite && guild.members.me) {
    overwrites.push({
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  // Salon cloisonné : chaque rôle du pôle ouvre l'accès, et l'écriture suit sauf
  // si le salon est un hub réservé au bot.
  if (poleRestricted) {
    for (const roleId of poleRoleIds) {
      const allow = [PermissionFlagsBits.ViewChannel];
      if (!botOnlyWrite) allow.push(...usePermissions);
      overwrites.push({ id: roleId, allow });
    }
  }

  // Sans aucune restriction, le salon est ouvert : rien à accorder par rôle.
  if (!minGradeView && !minGradeWrite && !botOnlyWrite && !poleRestricted) return overwrites;

  for (const grade of GRADE_HIERARCHY) {
    const roleId = roleIds.get(grade);
    if (!roleId) continue;

    // Sur un salon cloisonné, la direction générale garde une vue d'ensemble :
    // sans cela, piloter l'entreprise imposerait de cumuler les 32 rôles.
    if (poleRestricted) {
      if (isGradeHigherOrEqual(grade, Grade.DIRECTEUR_GENERAL)) {
        const allow = [PermissionFlagsBits.ViewChannel];
        if (!botOnlyWrite) allow.push(...usePermissions);
        overwrites.push({ id: roleId, allow });
      }
      continue;
    }

    const canView = !minGradeView || isGradeHigherOrEqual(grade, minGradeView);
    // Voir est un prérequis pour écrire : inutile d'accorder SendMessages à un
    // grade qui n'a pas accès au salon.
    const canWrite =
      !botOnlyWrite && canView && (!minGradeWrite || isGradeHigherOrEqual(grade, minGradeWrite));

    const allow = [];
    // On ne réaccorde ViewChannel que s'il a été refusé à @everyone.
    if (canView && minGradeView) allow.push(PermissionFlagsBits.ViewChannel);
    if (canWrite && minGradeWrite) allow.push(...usePermissions);

    if (allow.length > 0) {
      overwrites.push({ id: roleId, allow });
    }
  }

  return overwrites;
}
