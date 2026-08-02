import { GuildMember } from 'discord.js';
import { Member, MemberHistoryEventType, PoleName } from '@prisma/client';
import prisma from '@database/prisma';
import GuildStructureService from '@services/GuildStructureService';
import { POLES_CONFIG } from '@config/poles.config';
import {
  POLE_RANK_LABELS,
  PoleRank,
  getRolesForPole,
  poleRoleKey,
} from '@config/poleRoles.config';
import { recordAudit } from '@modules/audit/services/auditService';
import { AuditAction, AuditEntity } from '@modules/audit/actions';
import logger from '@core/Logger';

export interface AssignmentInput {
  target: Member;
  targetMember: GuildMember;
  pole: PoleName;
  rank: PoleRank;
  actor: Member;
}

export interface AssignmentResult {
  previousPole: PoleName | null;
  rolesSynced: boolean;
}

/**
 * Affecte un membre à un pôle avec un rang donné.
 *
 * Met à jour la base puis les rôles Discord. L'ordre importe : la base est la
 * référence, la synchronisation Discord peut échouer sans invalider la décision
 * — elle est alors signalée et rejouable via `/pole sync`.
 */
export async function assignToPole(input: AssignmentInput): Promise<AssignmentResult> {
  const { target, targetMember, pole, rank, actor } = input;

  const poleRecord = await prisma.pole.findUnique({ where: { name: pole } });
  if (!poleRecord) {
    throw new Error(`Le pôle ${pole} n'existe pas en base. Exécutez \`/setup\`.`);
  }

  const previous = target.poleId
    ? await prisma.pole.findUnique({ where: { id: target.poleId } })
    : null;

  await prisma.$transaction([
    prisma.member.update({ where: { id: target.id }, data: { poleId: poleRecord.id } }),
    prisma.memberHistory.create({
      data: {
        subjectId: target.id,
        actorId: actor.id,
        eventType: MemberHistoryEventType.CHANGEMENT_POLE,
        details: `Affecté comme ${POLE_RANK_LABELS[rank]}`,
        previousValue: previous?.displayName ?? null,
        newValue: poleRecord.displayName,
      },
    }),
  ]);

  const rolesSynced = await syncPoleRoles(targetMember, pole, rank);

  logger.info(
    `${target.username} affecté au pôle ${poleRecord.displayName} (${POLE_RANK_LABELS[rank]}).`,
  );

  await recordAudit({
    action: AuditAction.MEMBER_POLE_CHANGED,
    entityType: AuditEntity.MEMBER,
    entityId: target.id,
    actorId: actor.id,
    metadata: {
      target: target.username,
      from: previous?.displayName ?? 'aucun',
      to: poleRecord.displayName,
      rang: POLE_RANK_LABELS[rank],
    },
  });

  return { previousPole: (previous?.name as PoleName) ?? null, rolesSynced };
}

/**
 * Aligne les rôles Discord sur l'affectation.
 *
 * Retire tous les rôles de pôle du membre avant d'ajouter le bon : un membre ne
 * doit appartenir qu'à un pôle à la fois, sinon il verrait plusieurs catégories
 * et la notion de cloisonnement perdrait son sens.
 */
export async function syncPoleRoles(
  member: GuildMember,
  pole: PoleName,
  rank: PoleRank,
): Promise<boolean> {
  try {
    const targetRoleId = await GuildStructureService.get(poleRoleKey(pole, rank));

    if (!targetRoleId) {
      logger.warn(`Rôle ${pole}/${rank} absent du registre — exécutez \`/setup\`.`);
      return false;
    }

    const allPoleRoleIds = await getAllPoleRoleIds();
    const toRemove = member.roles.cache.filter(
      (role) => allPoleRoleIds.has(role.id) && role.id !== targetRoleId,
    );

    if (toRemove.size > 0) {
      await member.roles.remove(toRemove, 'Changement de pôle');
    }

    if (!member.roles.cache.has(targetRoleId)) {
      await member.roles.add(targetRoleId, 'Affectation à un pôle');
    }

    return true;
  } catch (error) {
    logger.warn(`Échec de synchronisation des rôles de pôle pour ${member.user.tag} :`, error);
    return false;
  }
}

/** Retire toute appartenance à un pôle — utilisé lors d'un retrait d'équipe. */
export async function removeFromPole(
  target: Member,
  targetMember: GuildMember,
  actor: Member,
): Promise<void> {
  await prisma.$transaction([
    prisma.member.update({ where: { id: target.id }, data: { poleId: null } }),
    prisma.memberHistory.create({
      data: {
        subjectId: target.id,
        actorId: actor.id,
        eventType: MemberHistoryEventType.CHANGEMENT_POLE,
        details: 'Retiré de son pôle',
        newValue: 'aucun',
      },
    }),
  ]);

  try {
    const allPoleRoleIds = await getAllPoleRoleIds();
    const toRemove = targetMember.roles.cache.filter((role) => allPoleRoleIds.has(role.id));

    if (toRemove.size > 0) {
      await targetMember.roles.remove(toRemove, 'Retrait du pôle');
    }
  } catch (error) {
    logger.warn(`Échec du retrait des rôles de pôle pour ${targetMember.user.tag} :`, error);
  }
}

/** IDs de tous les rôles de pôle, tous rangs et tous pôles confondus. */
async function getAllPoleRoleIds(): Promise<Set<string>> {
  const ids = new Set<string>();

  for (const pole of Object.values(PoleName)) {
    for (const config of getRolesForPole(pole)) {
      const id = await GuildStructureService.get(config.key);
      if (id) ids.add(id);
    }
  }

  return ids;
}

/** Membres sans pôle — ceux qui attendent une affectation. */
export async function getUnassignedMembers(): Promise<Member[]> {
  return prisma.member.findMany({
    where: { poleId: null, status: { not: 'PARTI' } },
    orderBy: { joinedAt: 'asc' },
    take: 25,
  });
}

/** Rang d'un membre dans son pôle, déduit de ses rôles Discord. */
export async function resolvePoleRank(
  member: GuildMember,
  pole: PoleName,
): Promise<PoleRank | null> {
  for (const config of getRolesForPole(pole)) {
    const id = await GuildStructureService.get(config.key);
    if (id && member.roles.cache.has(id)) return config.rank;
  }

  return null;
}

/** Libellé lisible d'un pôle. */
export function poleLabel(pole: PoleName): string {
  const config = POLES_CONFIG[pole];
  return `${config.emoji} ${config.displayName}`;
}
