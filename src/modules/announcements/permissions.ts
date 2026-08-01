import { Grade, PoleName } from '@prisma/client';
import { isGradeHigherOrEqual } from '@apptypes/grade.types';
import { PermissionCheck, PERMISSION_ALLOWED, permissionDenied } from '@apptypes/permission.types';

/** Grade minimum pour annoncer dans son propre pôle. */
export const MIN_GRADE_ANNOUNCE = Grade.CHEF_EQUIPE;
/** Grade minimum pour annoncer au-delà de son pôle. */
export const MIN_GRADE_ANNOUNCE_CROSS_POLE = Grade.RESPONSABLE;

const ALLOWED = PERMISSION_ALLOWED;
const denied = permissionDenied;

export interface AnnouncementActor {
  grade: Grade;
  /** Pôle d'appartenance ; `null` si le membre n'est rattaché à aucun. */
  pole: PoleName | null;
}

/**
 * Autorise la publication d'une annonce.
 *
 * Un Chef d'équipe ne peut s'adresser qu'à son propre pôle. Dès qu'un autre pôle
 * est visé, le grade Responsable est requis : diffuser à toute l'organisation
 * n'est pas du même ordre qu'informer son équipe.
 */
export function canAnnounce(actor: AnnouncementActor, targetPoles: PoleName[]): PermissionCheck {
  if (!isGradeHigherOrEqual(actor.grade, MIN_GRADE_ANNOUNCE)) {
    return denied("Seuls les Chefs d'équipe et au-dessus peuvent publier une annonce.");
  }

  if (targetPoles.length === 0) {
    return denied('Sélectionnez au moins un pôle destinataire.');
  }

  if (isGradeHigherOrEqual(actor.grade, MIN_GRADE_ANNOUNCE_CROSS_POLE)) {
    return ALLOWED;
  }

  // En dessous de Responsable : la cible doit se limiter à son propre pôle.
  const targetsOwnPoleOnly = targetPoles.length === 1 && targetPoles[0] === actor.pole;

  if (!targetsOwnPoleOnly) {
    return denied(
      "Vous ne pouvez annoncer que dans votre propre pôle. Une diffusion vers d'autres pôles requiert le grade Responsable.",
    );
  }

  return ALLOWED;
}
