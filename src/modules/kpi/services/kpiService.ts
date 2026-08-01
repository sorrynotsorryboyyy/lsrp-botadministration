import { MeetingStatus, ObjectiveStatus, ProjectStatus, TaskStatus } from '@prisma/client';
import prisma from '@database/prisma';
import logger from '@core/Logger';

/** Identifiants stables des métriques, réutilisés d'une semaine à l'autre. */
export const KpiMetric = {
  TASKS_CREATED: 'taches_creees',
  TASKS_COMPLETED: 'taches_terminees',
  PROJECTS_COMPLETED: 'projets_termines',
  MEETINGS_HELD: 'reunions_realisees',
  ANNOUNCEMENTS: 'annonces_publiees',
  OBJECTIVES_ACHIEVED: 'objectifs_atteints',
  DECISIONS_MADE: 'decisions_prises',
  EXPENSES_APPROVED: 'depenses_validees',
  ABSENCES: 'absences',
} as const;

export type KpiMetricValue = (typeof KpiMetric)[keyof typeof KpiMetric];

export const KPI_LABELS: Record<KpiMetricValue, string> = {
  [KpiMetric.TASKS_CREATED]: 'Tâches créées',
  [KpiMetric.TASKS_COMPLETED]: 'Tâches terminées',
  [KpiMetric.PROJECTS_COMPLETED]: 'Projets terminés',
  [KpiMetric.MEETINGS_HELD]: 'Réunions réalisées',
  [KpiMetric.ANNOUNCEMENTS]: 'Annonces publiées',
  [KpiMetric.OBJECTIVES_ACHIEVED]: 'Objectifs atteints',
  [KpiMetric.DECISIONS_MADE]: 'Décisions prises',
  [KpiMetric.EXPENSES_APPROVED]: 'Dépenses validées',
  [KpiMetric.ABSENCES]: 'Absences',
};

export interface KpiSnapshot {
  weekStart: Date;
  metrics: Record<KpiMetricValue, number>;
}

/** Début de la semaine ISO (lundi minuit) contenant la date donnée. */
export function startOfIsoWeek(reference = new Date()): Date {
  const date = new Date(reference);
  const day = date.getDay();
  // getDay() renvoie 0 pour dimanche : on le ramène à 7 pour un calcul ISO.
  const offset = day === 0 ? 6 : day - 1;

  date.setDate(date.getDate() - offset);
  date.setHours(0, 0, 0, 0);

  return date;
}

/** Calcule les métriques sur une période donnée, sans rien persister. */
export async function computeMetrics(from: Date, to: Date): Promise<Record<KpiMetricValue, number>> {
  const range = { gte: from, lt: to };

  const [
    tasksCreated,
    tasksCompleted,
    projectsCompleted,
    meetingsHeld,
    announcements,
    objectivesAchieved,
    decisionsMade,
    expensesApproved,
    absences,
  ] = await Promise.all([
    prisma.task.count({ where: { createdAt: range } }),
    prisma.task.count({ where: { status: TaskStatus.TERMINE, completedAt: range } }),
    prisma.project.count({ where: { status: ProjectStatus.TERMINE, updatedAt: range } }),
    prisma.meeting.count({ where: { status: MeetingStatus.TERMINEE, endedAt: range } }),
    prisma.announcement.count({ where: { createdAt: range } }),
    prisma.objective.count({ where: { status: ObjectiveStatus.ATTEINT, endDate: range } }),
    prisma.decision.count({ where: { decidedAt: range } }),
    prisma.expense.count({ where: { status: 'ACCEPTEE', decidedAt: range } }),
    prisma.absence.count({ where: { startDate: range } }),
  ]);

  return {
    [KpiMetric.TASKS_CREATED]: tasksCreated,
    [KpiMetric.TASKS_COMPLETED]: tasksCompleted,
    [KpiMetric.PROJECTS_COMPLETED]: projectsCompleted,
    [KpiMetric.MEETINGS_HELD]: meetingsHeld,
    [KpiMetric.ANNOUNCEMENTS]: announcements,
    [KpiMetric.OBJECTIVES_ACHIEVED]: objectivesAchieved,
    [KpiMetric.DECISIONS_MADE]: decisionsMade,
    [KpiMetric.EXPENSES_APPROVED]: expensesApproved,
    [KpiMetric.ABSENCES]: absences,
  };
}

/**
 * Calcule et enregistre les métriques d'une semaine.
 *
 * Les entrées existantes de la semaine sont remplacées, ce qui rend l'appel
 * rejouable : relancer le calcul d'une semaine ne produit pas de doublons.
 */
export async function snapshotWeek(weekStart = startOfIsoWeek()): Promise<KpiSnapshot> {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const metrics = await computeMetrics(weekStart, weekEnd);

  await prisma.kPISnapshot.deleteMany({ where: { weekStart, poleId: null } });

  await prisma.kPISnapshot.createMany({
    data: Object.entries(metrics).map(([metricName, metricValue]) => ({
      weekStart,
      metricName,
      metricValue,
    })),
  });

  logger.info(`KPI enregistrés pour la semaine du ${weekStart.toISOString().slice(0, 10)}`);

  return { weekStart, metrics };
}

/** Relit un instantané enregistré ; `null` si la semaine n'a pas été calculée. */
export async function getStoredSnapshot(weekStart: Date): Promise<KpiSnapshot | null> {
  const rows = await prisma.kPISnapshot.findMany({ where: { weekStart, poleId: null } });

  if (rows.length === 0) return null;

  const metrics = {} as Record<KpiMetricValue, number>;
  for (const row of rows) {
    metrics[row.metricName as KpiMetricValue] = row.metricValue;
  }

  return { weekStart, metrics };
}

export interface KpiComparison {
  current: KpiSnapshot;
  previous: KpiSnapshot | null;
}

/** Semaine courante comparée à la précédente, pour afficher les tendances. */
export async function getWeeklyComparison(): Promise<KpiComparison> {
  const currentStart = startOfIsoWeek();
  const currentEnd = new Date(currentStart);
  currentEnd.setDate(currentEnd.getDate() + 7);

  const previousStart = new Date(currentStart);
  previousStart.setDate(previousStart.getDate() - 7);

  const [current, previousMetrics] = await Promise.all([
    computeMetrics(currentStart, currentEnd),
    computeMetrics(previousStart, currentStart),
  ]);

  return {
    current: { weekStart: currentStart, metrics: current },
    previous: { weekStart: previousStart, metrics: previousMetrics },
  };
}
