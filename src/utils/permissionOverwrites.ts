import { PermissionFlagsBits, OverwriteResolvable, Guild } from 'discord.js';
import { Grade } from '@prisma/client';
import { GRADE_HIERARCHY, isGradeHigherOrEqual } from '@apptypes/grade.types';
import GuildStructureService from '@services/GuildStructureService';

/** Table `Grade → ID de rôle Discord`, résolue une fois par exécution de setup. */
export type RoleIdMap = Map<Grade, string>;

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
 * Construit les permission overwrites d'un salon à partir de ses seuils de grade.
 *
 * Principe : `@everyone` porte le refus, et seuls les grades effectivement
 * habilités reçoivent une autorisation explicite. Un seuil absent signifie
 * « ouvert à tous » et ne produit donc aucun overwrite par rôle.
 *
 * @param guild         Serveur cible — son ID est aussi celui du rôle `@everyone`.
 * @param roleIds       Table préchargée via `loadRoleIdMap`.
 * @param minGradeView  Grade minimum pour voir le salon. Absent = visible par tous.
 * @param minGradeWrite Grade minimum pour y écrire. Absent = ouvert à tous ceux qui voient.
 */
export function buildChannelOverwrites(
  guild: Guild,
  roleIds: RoleIdMap,
  minGradeView?: Grade,
  minGradeWrite?: Grade,
): OverwriteResolvable[] {
  const everyoneDeny = [];
  if (minGradeView) everyoneDeny.push(PermissionFlagsBits.ViewChannel);
  if (minGradeWrite) everyoneDeny.push(PermissionFlagsBits.SendMessages);

  const overwrites: OverwriteResolvable[] = [{ id: guild.id, deny: everyoneDeny }];

  // Sans aucune restriction, le salon est ouvert : rien à accorder par rôle.
  if (!minGradeView && !minGradeWrite) return overwrites;

  for (const grade of GRADE_HIERARCHY) {
    const roleId = roleIds.get(grade);
    if (!roleId) continue;

    const canView = !minGradeView || isGradeHigherOrEqual(grade, minGradeView);
    // Voir est un prérequis pour écrire : inutile d'accorder SendMessages à un
    // grade qui n'a pas accès au salon.
    const canWrite = canView && (!minGradeWrite || isGradeHigherOrEqual(grade, minGradeWrite));

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
