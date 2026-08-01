import { Grade } from '@prisma/client';

export const GRADE_HIERARCHY: Grade[] = [
  Grade.FONDATEUR,
  Grade.CO_FONDATEUR,
  Grade.DIRECTEUR_GENERAL,
  Grade.DIRECTEUR_POLE,
  Grade.RESPONSABLE,
  Grade.CHEF_EQUIPE,
  Grade.COLLABORATEUR,
  Grade.RECRUE,
];

export function getGradeLevel(grade: Grade): number {
  return GRADE_HIERARCHY.indexOf(grade);
}

export function isGradeHigherOrEqual(actual: Grade, required: Grade): boolean {
  return getGradeLevel(actual) <= getGradeLevel(required);
}
