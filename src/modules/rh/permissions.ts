import { Grade, SanctionType } from '@prisma/client';
import { isGradeHigherOrEqual, getGradeLevel } from '@apptypes/grade.types';
import { PermissionCheck, PERMISSION_ALLOWED, permissionDenied } from '@apptypes/permission.types';

export type { PermissionCheck };

/**
 * Règles de permission propres au module RH.
 *
 * Elles s'ajoutent au `minGrade` déclaré sur la commande (vérifié en amont par
 * `permissionMiddleware`) et couvrent ce que la cascade brute ne sait pas
 * exprimer : agir sur autrui, escalader un grade, sanctionner plus haut que soi.
 */

/** Grade minimum requis pour promouvoir quelqu'un. */
export const MIN_GRADE_PROMOTE = Grade.DIRECTEUR_POLE;
/** Grade minimum requis pour rétrograder — plus strict qu'une promotion. */
export const MIN_GRADE_DEMOTE = Grade.DIRECTEUR_GENERAL;
/** Grade minimum requis pour changer un membre de pôle. */
export const MIN_GRADE_TRANSFER = Grade.DIRECTEUR_POLE;
/** Grade minimum requis pour émettre un avertissement. */
export const MIN_GRADE_WARN = Grade.CHEF_EQUIPE;
/** Grade minimum requis pour une sanction légère (blâme). */
export const MIN_GRADE_SANCTION = Grade.RESPONSABLE;
/** Grade minimum requis pour une sanction lourde (suspension, exclusion). */
export const MIN_GRADE_HEAVY_SANCTION = Grade.DIRECTEUR_POLE;
/** Grade minimum requis pour statuer sur une candidature. */
export const MIN_GRADE_REVIEW_APPLICATION = Grade.RESPONSABLE;

const ALLOWED = PERMISSION_ALLOWED;
const denied = permissionDenied;

/**
 * Règle transverse : on n'agit jamais sur un membre de grade supérieur ou égal
 * au sien. Sans cela, deux Responsables pourraient se sanctionner mutuellement
 * et un Directeur de Pôle pourrait rétrograder un Fondateur.
 */
export function canActOn(actor: Grade, target: Grade): PermissionCheck {
  if (getGradeLevel(actor) >= getGradeLevel(target)) {
    return denied(
      'Vous ne pouvez pas effectuer cette action sur un membre de grade supérieur ou égal au vôtre.',
    );
  }
  return ALLOWED;
}

/**
 * Promotion : réservée aux Directeurs de Pôle et au-dessus, et on ne peut jamais
 * promouvoir quelqu'un à un grade supérieur ou égal au sien — cela reviendrait à
 * se cloner ou à créer un supérieur.
 */
export function canPromote(actor: Grade, target: Grade, newGrade: Grade): PermissionCheck {
  if (!isGradeHigherOrEqual(actor, MIN_GRADE_PROMOTE)) {
    return denied('Seuls les Directeurs de Pôle et au-dessus peuvent promouvoir un membre.');
  }

  const actOn = canActOn(actor, target);
  if (!actOn.allowed) return actOn;

  if (getGradeLevel(newGrade) <= getGradeLevel(actor)) {
    return denied('Vous ne pouvez pas promouvoir un membre à un grade supérieur ou égal au vôtre.');
  }

  if (getGradeLevel(newGrade) >= getGradeLevel(target)) {
    return denied('Le nouveau grade doit être supérieur au grade actuel du membre.');
  }

  return ALLOWED;
}

/** Rétrogradation : Directeur Général et au-dessus uniquement. */
export function canDemote(actor: Grade, target: Grade, newGrade: Grade): PermissionCheck {
  if (!isGradeHigherOrEqual(actor, MIN_GRADE_DEMOTE)) {
    return denied('Seuls les Directeurs Généraux et au-dessus peuvent rétrograder un membre.');
  }

  const actOn = canActOn(actor, target);
  if (!actOn.allowed) return actOn;

  if (getGradeLevel(newGrade) <= getGradeLevel(target)) {
    return denied('Le nouveau grade doit être inférieur au grade actuel du membre.');
  }

  return ALLOWED;
}

export function canTransferPole(actor: Grade, target: Grade): PermissionCheck {
  if (!isGradeHigherOrEqual(actor, MIN_GRADE_TRANSFER)) {
    return denied('Seuls les Directeurs de Pôle et au-dessus peuvent changer un membre de pôle.');
  }
  return canActOn(actor, target);
}

export function canWarn(actor: Grade, target: Grade): PermissionCheck {
  if (!isGradeHigherOrEqual(actor, MIN_GRADE_WARN)) {
    return denied("Seuls les Chefs d'équipe et au-dessus peuvent émettre un avertissement.");
  }
  return canActOn(actor, target);
}

/**
 * Sanction : le seuil dépend de la gravité. Suspension et exclusion engagent
 * l'appartenance du membre à l'équipe et sont donc réservées aux Directeurs.
 */
export function canSanction(actor: Grade, target: Grade, type: SanctionType): PermissionCheck {
  const isHeavy = type === SanctionType.SUSPENSION || type === SanctionType.EXCLUSION;
  const required = isHeavy ? MIN_GRADE_HEAVY_SANCTION : MIN_GRADE_SANCTION;

  if (!isGradeHigherOrEqual(actor, required)) {
    return denied(
      isHeavy
        ? 'Les suspensions et exclusions sont réservées aux Directeurs de Pôle et au-dessus.'
        : 'Seuls les Responsables et au-dessus peuvent émettre une sanction.',
    );
  }

  return canActOn(actor, target);
}

export function canReviewApplication(actor: Grade): PermissionCheck {
  if (!isGradeHigherOrEqual(actor, MIN_GRADE_REVIEW_APPLICATION)) {
    return denied('Seuls les Responsables et au-dessus peuvent statuer sur une candidature.');
  }
  return ALLOWED;
}

/**
 * Consultation d'historique : ouverte à partir de Chef d'équipe, mais chacun
 * peut toujours consulter le sien.
 */
export function canViewHistory(actor: Grade, isSelf: boolean): PermissionCheck {
  if (isSelf) return ALLOWED;

  if (!isGradeHigherOrEqual(actor, Grade.CHEF_EQUIPE)) {
    return denied("Vous ne pouvez consulter que votre propre historique.");
  }

  return ALLOWED;
}
