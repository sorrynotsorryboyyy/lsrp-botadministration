import { PermissionFlagsBits, OverwriteResolvable, Guild } from 'discord.js';
import { Grade } from '@prisma/client';
import { GRADE_HIERARCHY, isGradeHigherOrEqual } from '@apptypes/grade.types';
import GuildStructureService from '@services/GuildStructureService';

/** Table `Grade → ID de rôle Discord`, résolue une fois par exécution de setup. */
export type RoleIdMap = Map<Grade, string>;

/** Contraintes d'accès d'un salon, extraites de `ChannelConfig`. */
export interface ChannelAccess {
  minGradeView?: Grade;
  minGradeWrite?: Grade;
  botOnlyWrite?: boolean;
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
): OverwriteResolvable[] {
  const { minGradeView, minGradeWrite, botOnlyWrite } = access;

  const everyoneDeny = [];
  if (minGradeView) everyoneDeny.push(PermissionFlagsBits.ViewChannel);

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
    everyoneDeny.push(PermissionFlagsBits.SendMessages);
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

  // Sans aucune restriction, le salon est ouvert : rien à accorder par rôle.
  if (!minGradeView && !minGradeWrite && !botOnlyWrite) return overwrites;

  for (const grade of GRADE_HIERARCHY) {
    const roleId = roleIds.get(grade);
    if (!roleId) continue;

    const canView = !minGradeView || isGradeHigherOrEqual(grade, minGradeView);
    // Voir est un prérequis pour écrire : inutile d'accorder SendMessages à un
    // grade qui n'a pas accès au salon.
    const canWrite =
      !botOnlyWrite && canView && (!minGradeWrite || isGradeHigherOrEqual(grade, minGradeWrite));

    const allow = [];
    // On ne réaccorde ViewChannel que s'il a été refusé à @everyone.
    if (canView && minGradeView) allow.push(PermissionFlagsBits.ViewChannel);
    if (canWrite && minGradeWrite) allow.push(PermissionFlagsBits.SendMessages);

    if (allow.length > 0) {
      overwrites.push({ id: roleId, allow });
    }
  }

  return overwrites;
}
