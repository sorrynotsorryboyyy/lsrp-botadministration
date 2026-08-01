import { Grade, ProjectStatus } from '@prisma/client';
import { isGradeHigherOrEqual } from '@apptypes/grade.types';
import { PermissionCheck, PERMISSION_ALLOWED, permissionDenied } from '@apptypes/permission.types';

/** Grade minimum pour créer un projet. */
export const MIN_GRADE_CREATE_PROJECT = Grade.CHEF_EQUIPE;
/** Grade minimum pour clôturer ou archiver un projet, hors responsable. */
export const MIN_GRADE_CLOSE_PROJECT = Grade.RESPONSABLE;

const ALLOWED = PERMISSION_ALLOWED;
const denied = permissionDenied;

export interface ProjectActorContext {
  grade: Grade;
  /** Identifiant `Member` de l'utilisateur agissant. */
  memberId: string;
}

export interface ProjectSubject {
  managerId: string;
  memberIds: string[];
}

/** Le responsable d'un projet garde la main dessus quel que soit son grade. */
function isManager(actor: ProjectActorContext, project: ProjectSubject): boolean {
  return project.managerId === actor.memberId;
}

function isParticipant(actor: ProjectActorContext, project: ProjectSubject): boolean {
  return isManager(actor, project) || project.memberIds.includes(actor.memberId);
}

export function canCreateProject(grade: Grade): PermissionCheck {
  if (!isGradeHigherOrEqual(grade, MIN_GRADE_CREATE_PROJECT)) {
    return denied("Seuls les Chefs d'équipe et au-dessus peuvent créer un projet.");
  }
  return ALLOWED;
}

/**
 * Changement de statut : réservé au responsable du projet ou à un Responsable+.
 * La clôture (`TERMINE`) et l'archivage exigent en plus un grade Responsable,
 * même pour le porteur du projet — c'est une décision qui engage le pôle.
 */
export function canUpdateProjectStatus(
  actor: ProjectActorContext,
  project: ProjectSubject,
  newStatus: ProjectStatus,
): PermissionCheck {
  const isClosing = newStatus === ProjectStatus.TERMINE || newStatus === ProjectStatus.ARCHIVE;

  if (isClosing && !isGradeHigherOrEqual(actor.grade, MIN_GRADE_CLOSE_PROJECT)) {
    return denied('Seuls les Responsables et au-dessus peuvent clôturer ou archiver un projet.');
  }

  if (isManager(actor, project) || isGradeHigherOrEqual(actor.grade, MIN_GRADE_CLOSE_PROJECT)) {
    return ALLOWED;
  }

  return denied('Seul le responsable du projet ou un Responsable peut modifier son statut.');
}

/**
 * Droit d'ouvrir le menu de changement de statut.
 *
 * Distinct de `canUpdateProjectStatus` : à ce stade le statut cible n'est pas
 * encore connu, on ne vérifie donc que le lien avec le projet. La restriction
 * propre à la clôture est appliquée après le choix.
 */
export function canOpenStatusMenu(
  actor: ProjectActorContext,
  project: ProjectSubject,
): PermissionCheck {
  if (isManager(actor, project) || isGradeHigherOrEqual(actor.grade, MIN_GRADE_CLOSE_PROJECT)) {
    return ALLOWED;
  }
  return denied('Seul le responsable du projet ou un Responsable peut modifier son statut.');
}

export function canManageProjectMembers(
  actor: ProjectActorContext,
  project: ProjectSubject,
): PermissionCheck {
  if (isManager(actor, project) || isGradeHigherOrEqual(actor.grade, MIN_GRADE_CLOSE_PROJECT)) {
    return ALLOWED;
  }
  return denied('Seul le responsable du projet ou un Responsable peut gérer ses membres.');
}

/** Commenter est ouvert aux participants, et à l'encadrement pour le suivi. */
export function canCommentProject(
  actor: ProjectActorContext,
  project: ProjectSubject,
): PermissionCheck {
  if (isParticipant(actor, project) || isGradeHigherOrEqual(actor.grade, Grade.CHEF_EQUIPE)) {
    return ALLOWED;
  }
  return denied('Vous devez participer au projet pour le commenter.');
}
