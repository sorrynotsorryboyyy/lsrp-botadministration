import { GuildMember } from 'discord.js';
import { Grade, Member, MemberHistoryEventType, PoleName } from '@prisma/client';
import prisma from '@database/prisma';
import GuildStructureService from '@services/GuildStructureService';
import { getGradeLevel } from '@apptypes/grade.types';
import { recordAudit } from '@modules/audit/services/auditService';
import { AuditAction, AuditEntity } from '@modules/audit/actions';
import logger from '@core/Logger';

export interface GradeChangeInput {
  target: Member;
  targetMember: GuildMember;
  actor: Member;
  newGrade: Grade;
  reason?: string;
}

/**
 * Applique un changement de grade : base de données, historique et rôles Discord.
 *
 * L'écriture en base (grade + historique + trace de promotion) est transactionnelle
 * pour qu'un incident ne laisse jamais un membre promu sans trace. La
 * synchronisation des rôles Discord se fait ensuite : elle peut échouer sans
 * invalider la décision RH, qui reste enregistrée et rejouable.
 *
 * @returns `true` si les rôles Discord ont pu être synchronisés.
 */
export async function applyGradeChange(input: GradeChangeInput): Promise<boolean> {
  const { target, targetMember, actor, newGrade, reason } = input;
  const previousGrade = target.grade;

  await prisma.$transaction([
    prisma.member.update({
      where: { id: target.id },
      data: { grade: newGrade },
    }),
    prisma.promotionHistory.create({
      data: {
        targetId: target.id,
        issuerId: actor.id,
        previousGrade,
        newGrade,
        reason,
      },
    }),
    prisma.memberHistory.create({
      data: {
        subjectId: target.id,
        actorId: actor.id,
        eventType: isGradeUpgrade(previousGrade, newGrade)
          ? MemberHistoryEventType.PROMOTION
          : MemberHistoryEventType.RETROGRADATION,
        details: reason,
        previousValue: previousGrade,
        newValue: newGrade,
      },
    }),
  ]);

  logger.info(
    `Grade modifié : ${target.username} ${previousGrade} → ${newGrade} (par ${actor.username})`,
  );

  await recordAudit({
    action: isGradeUpgrade(previousGrade, newGrade)
      ? AuditAction.MEMBER_PROMOTED
      : AuditAction.MEMBER_DEMOTED,
    entityType: AuditEntity.MEMBER,
    entityId: target.id,
    actorId: actor.id,
    metadata: { target: target.username, from: previousGrade, to: newGrade, motif: reason },
  });

  return syncGradeRoles(targetMember, previousGrade, newGrade);
}

/**
 * Remplace le rôle Discord de l'ancien grade par celui du nouveau.
 *
 * Échoue silencieusement (log en `warn`) : le bot peut manquer de permissions ou
 * viser un membre dont le rôle est au-dessus du sien, sans que cela doive
 * annuler la décision RH déjà enregistrée.
 */
export async function syncGradeRoles(
  member: GuildMember,
  previousGrade: Grade | null,
  newGrade: Grade,
): Promise<boolean> {
  try {
    const newRoleId = await GuildStructureService.getRoleId(newGrade);
    if (!newRoleId) {
      logger.warn(`Rôle du grade ${newGrade} absent du registre — exécutez /setup.`);
      return false;
    }

    if (previousGrade && previousGrade !== newGrade) {
      const oldRoleId = await GuildStructureService.getRoleId(previousGrade);
      if (oldRoleId && member.roles.cache.has(oldRoleId)) {
        await member.roles.remove(oldRoleId, 'Changement de grade');
      }
    }

    if (!member.roles.cache.has(newRoleId)) {
      await member.roles.add(newRoleId, 'Changement de grade');
    }

    return true;
  } catch (error) {
    logger.warn(`Échec de la synchronisation des rôles pour ${member.user.tag}:`, error);
    return false;
  }
}

/** Change un membre de pôle et journalise l'événement. */
export async function applyPoleTransfer(
  target: Member,
  actor: Member,
  newPole: PoleName,
  reason?: string,
): Promise<void> {
  const pole = await prisma.pole.findUnique({ where: { name: newPole } });

  if (!pole) {
    throw new Error(`Le pôle ${newPole} n'existe pas en base — exécutez /setup.`);
  }

  const previousPole = target.poleId
    ? await prisma.pole.findUnique({ where: { id: target.poleId } })
    : null;

  await prisma.$transaction([
    prisma.member.update({
      where: { id: target.id },
      data: { poleId: pole.id },
    }),
    prisma.memberHistory.create({
      data: {
        subjectId: target.id,
        actorId: actor.id,
        eventType: MemberHistoryEventType.CHANGEMENT_POLE,
        details: reason,
        previousValue: previousPole?.displayName ?? null,
        newValue: pole.displayName,
      },
    }),
  ]);

  logger.info(
    `Pôle modifié : ${target.username} ${previousPole?.displayName ?? 'aucun'} → ${pole.displayName}`,
  );

  await recordAudit({
    action: AuditAction.MEMBER_POLE_CHANGED,
    entityType: AuditEntity.MEMBER,
    entityId: target.id,
    actorId: actor.id,
    metadata: {
      target: target.username,
      from: previousPole?.displayName ?? 'aucun',
      to: pole.displayName,
      motif: reason,
    },
  });
}

/** Vrai si `next` est hiérarchiquement supérieur à `previous`. */
function isGradeUpgrade(previous: Grade, next: Grade): boolean {
  return getGradeLevel(next) < getGradeLevel(previous);
}
