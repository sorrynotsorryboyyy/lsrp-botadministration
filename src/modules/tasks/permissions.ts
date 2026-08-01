import { Grade } from '@prisma/client';
import { isGradeHigherOrEqual } from '@apptypes/grade.types';
import { PermissionCheck, PERMISSION_ALLOWED, permissionDenied } from '@apptypes/permission.types';

/** Grade minimum pour créer une tâche — ouvert largement, c'est l'outil du quotidien. */
export const MIN_GRADE_CREATE_TASK = Grade.COLLABORATEUR;
/** Grade minimum pour assigner une tâche à quelqu'un d'autre. */
export const MIN_GRADE_ASSIGN_OTHERS = Grade.CHEF_EQUIPE;

const ALLOWED = PERMISSION_ALLOWED;
const denied = permissionDenied;

export interface TaskActorContext {
  grade: Grade;
  memberId: string;
}

export interface TaskSubject {
  assigneeId: string | null;
  creatorId: string;
}

function isAssignee(actor: TaskActorContext, task: TaskSubject): boolean {
  return task.assigneeId === actor.memberId;
}

export function canCreateTask(grade: Grade): PermissionCheck {
  if (!isGradeHigherOrEqual(grade, MIN_GRADE_CREATE_TASK)) {
    return denied('Les recrues ne peuvent pas encore créer de tâche.');
  }
  return ALLOWED;
}

/**
 * Assignation : chacun peut s'attribuer une tâche libre (auto-assignation), mais
 * il faut être Chef d'équipe pour l'attribuer à autrui ou pour retirer une tâche
 * déjà prise par quelqu'un d'autre.
 */
export function canAssignTask(
  actor: TaskActorContext,
  task: TaskSubject,
  targetMemberId: string | null,
): PermissionCheck {
  const isSelfAssign = targetMemberId === actor.memberId;
  const isLead = isGradeHigherOrEqual(actor.grade, MIN_GRADE_ASSIGN_OTHERS);

  if (isLead) return ALLOWED;

  if (!isSelfAssign) {
    return denied("Seuls les Chefs d'équipe et au-dessus peuvent assigner une tâche à un autre membre.");
  }

  // Auto-assignation : uniquement si la tâche est libre, ou déjà la sienne.
  if (task.assigneeId && task.assigneeId !== actor.memberId) {
    return denied('Cette tâche est déjà assignée à un autre membre.');
  }

  return ALLOWED;
}

/** Le statut est modifiable par la personne assignée, son créateur ou l'encadrement. */
export function canUpdateTaskStatus(actor: TaskActorContext, task: TaskSubject): PermissionCheck {
  if (
    isAssignee(actor, task) ||
    task.creatorId === actor.memberId ||
    isGradeHigherOrEqual(actor.grade, MIN_GRADE_ASSIGN_OTHERS)
  ) {
    return ALLOWED;
  }

  return denied('Seule la personne assignée, le créateur ou un encadrant peut modifier ce statut.');
}

/** Commenter et joindre un fichier restent ouverts à tout collaborateur. */
export function canCommentTask(grade: Grade): PermissionCheck {
  if (!isGradeHigherOrEqual(grade, MIN_GRADE_CREATE_TASK)) {
    return denied('Vous ne pouvez pas commenter cette tâche.');
  }
  return ALLOWED;
}
