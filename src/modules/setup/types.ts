/** Issue d'une opération de provisioning unitaire (un rôle, un salon, une catégorie). */
export type ProvisionAction = 'created' | 'updated' | 'skipped' | 'failed';

export interface ProvisionResult {
  /** Libellé lisible de l'élément (nom du rôle ou du salon). */
  label: string;
  action: ProvisionAction;
  /** Renseigné uniquement si `action === 'failed'`. */
  error?: string;
}

export interface SetupReport {
  roles: ProvisionResult[];
  categories: ProvisionResult[];
  channels: ProvisionResult[];
  poles: ProvisionResult[];
  /** Durée totale d'exécution en millisecondes. */
  durationMs: number;
}

export function countByAction(results: ProvisionResult[], action: ProvisionAction): number {
  return results.filter((r) => r.action === action).length;
}

export function hasFailures(report: SetupReport): boolean {
  return [...report.roles, ...report.categories, ...report.channels, ...report.poles].some(
    (r) => r.action === 'failed',
  );
}
