export type ResetTargetKind = 'channel' | 'category' | 'role';

export interface ResetTarget {
  kind: ResetTargetKind;
  id: string;
  label: string;
  /** `registry` = trouvé via GuildConfig, `name` = repli par nom. */
  source: 'registry' | 'name';
}

/** Élément identifié mais que le bot ne peut pas supprimer. */
export interface ProtectedTarget {
  label: string;
  reason: string;
}

export interface ResetInventory {
  channels: ResetTarget[];
  categories: ResetTarget[];
  roles: ResetTarget[];
  protectedRoles: ProtectedTarget[];
  configKeyCount: number;
}

export type ResetAction = 'deleted' | 'already_gone' | 'failed';

export interface ResetOutcome {
  label: string;
  kind: ResetTargetKind;
  action: ResetAction;
  error?: string;
}

export interface ResetReport {
  outcomes: ResetOutcome[];
  purgedKeys: number;
  durationMs: number;
}

export function countInventory(inventory: ResetInventory): number {
  return inventory.channels.length + inventory.categories.length + inventory.roles.length;
}

export function countByAction(outcomes: ResetOutcome[], action: ResetAction): number {
  return outcomes.filter((o) => o.action === action).length;
}
