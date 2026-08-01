import { ProjectStatus, TaskStatus } from '@prisma/client';

/**
 * Transitions autorisées du workflow projet.
 *
 * Le cycle nominal est À faire → En cours → En attente → En test → Terminé, mais
 * les allers-retours sont permis (un test qui échoue renvoie en cours). Seul
 * `ARCHIVE` est terminal : un projet archivé ne se rouvre pas, il se recrée.
 */
export const PROJECT_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  [ProjectStatus.A_FAIRE]: [ProjectStatus.EN_COURS, ProjectStatus.EN_ATTENTE, ProjectStatus.ARCHIVE],
  [ProjectStatus.EN_COURS]: [
    ProjectStatus.EN_ATTENTE,
    ProjectStatus.EN_TEST,
    ProjectStatus.TERMINE,
    ProjectStatus.A_FAIRE,
  ],
  [ProjectStatus.EN_ATTENTE]: [ProjectStatus.EN_COURS, ProjectStatus.A_FAIRE, ProjectStatus.ARCHIVE],
  [ProjectStatus.EN_TEST]: [ProjectStatus.EN_COURS, ProjectStatus.TERMINE, ProjectStatus.EN_ATTENTE],
  [ProjectStatus.TERMINE]: [ProjectStatus.ARCHIVE, ProjectStatus.EN_COURS],
  [ProjectStatus.ARCHIVE]: [],
};

/** Mêmes principes pour les tâches, sans état d'archivage. */
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.A_FAIRE]: [TaskStatus.EN_COURS, TaskStatus.EN_ATTENTE],
  [TaskStatus.EN_COURS]: [
    TaskStatus.EN_ATTENTE,
    TaskStatus.EN_TEST,
    TaskStatus.TERMINE,
    TaskStatus.A_FAIRE,
  ],
  [TaskStatus.EN_ATTENTE]: [TaskStatus.EN_COURS, TaskStatus.A_FAIRE],
  [TaskStatus.EN_TEST]: [TaskStatus.EN_COURS, TaskStatus.TERMINE],
  [TaskStatus.TERMINE]: [TaskStatus.EN_COURS],
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  [ProjectStatus.A_FAIRE]: '📋 À faire',
  [ProjectStatus.EN_COURS]: '🔨 En cours',
  [ProjectStatus.EN_ATTENTE]: '⏸️ En attente',
  [ProjectStatus.EN_TEST]: '🧪 En test',
  [ProjectStatus.TERMINE]: '✅ Terminé',
  [ProjectStatus.ARCHIVE]: '🗄️ Archivé',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.A_FAIRE]: '📋 À faire',
  [TaskStatus.EN_COURS]: '🔨 En cours',
  [TaskStatus.EN_ATTENTE]: '⏸️ En attente',
  [TaskStatus.EN_TEST]: '🧪 En test',
  [TaskStatus.TERMINE]: '✅ Terminé',
};

const PROJECT_STATUS_COLORS: Record<ProjectStatus, number> = {
  [ProjectStatus.A_FAIRE]: 0x95a5a6,
  [ProjectStatus.EN_COURS]: 0x3498db,
  [ProjectStatus.EN_ATTENTE]: 0xf39c12,
  [ProjectStatus.EN_TEST]: 0x9b59b6,
  [ProjectStatus.TERMINE]: 0x27ae60,
  [ProjectStatus.ARCHIVE]: 0x555555,
};

export function getProjectStatusColor(status: ProjectStatus): number {
  return PROJECT_STATUS_COLORS[status];
}

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  return PROJECT_TRANSITIONS[from].includes(to);
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

/** Statuts proposés dans le select menu, selon l'état courant. */
export function getAvailableProjectStatuses(from: ProjectStatus): ProjectStatus[] {
  return PROJECT_TRANSITIONS[from];
}

export function getAvailableTaskStatuses(from: TaskStatus): TaskStatus[] {
  return TASK_TRANSITIONS[from];
}

/** Vrai si le statut clôt le projet — déclenche l'horodatage d'archivage. */
export function isTerminalProjectStatus(status: ProjectStatus): boolean {
  return status === ProjectStatus.ARCHIVE;
}

export function isCompletedTaskStatus(status: TaskStatus): boolean {
  return status === TaskStatus.TERMINE;
}
