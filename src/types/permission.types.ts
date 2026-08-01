/**
 * Résultat d'une règle de permission métier.
 *
 * Partagé par tous les modules : chacun définit ses propres règles, mais toutes
 * renvoient cette forme afin que les handlers puissent les traiter uniformément
 * (voir `enforce` dans les handlers de module).
 */
export interface PermissionCheck {
  allowed: boolean;
  /** Message affiché à l'utilisateur en cas de refus. */
  reason?: string;
}

export const PERMISSION_ALLOWED: PermissionCheck = { allowed: true };

export function permissionDenied(reason: string): PermissionCheck {
  return { allowed: false, reason };
}
