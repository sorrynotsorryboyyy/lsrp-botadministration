import { AlertSeverity, AlertStatus, MeetingStatus, ProjectStatus, TaskStatus } from '@prisma/client';
import prisma from '@database/prisma';
import logger from '@core/Logger';

export interface DetectedAlert {
  title: string;
  description: string;
  severity: AlertSeverity;
  /** Clé de déduplication, pour ne pas recréer une alerte déjà ouverte. */
  key: string;
}

/**
 * Nombre de jours au-delà duquel un projet sans mise à jour est jugé bloqué.
 */
const STALE_PROJECT_DAYS = 14;

/**
 * Parcourt l'état de l'organisation et repère les anomalies.
 *
 * Fonction pure de lecture : elle ne persiste rien, ce qui permet de l'appeler
 * aussi bien depuis un cron que depuis une commande de diagnostic.
 */
export async function detectAlerts(): Promise<DetectedAlert[]> {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_PROJECT_DAYS * 24 * 60 * 60 * 1000);

  const alerts: DetectedAlert[] = [];

  const [overdueTasks, staleProjects, forgottenMeetings, overdueObjectives, pendingExpenses, pendingApplications] =
    await Promise.all([
      prisma.task.count({ where: { status: { not: TaskStatus.TERMINE }, dueDate: { lt: now } } }),
      prisma.project.count({
        where: { status: ProjectStatus.EN_COURS, updatedAt: { lt: staleThreshold } },
      }),
      prisma.meeting.count({
        where: { status: MeetingStatus.PLANIFIEE, scheduledAt: { lt: now } },
      }),
      prisma.objective.count({ where: { status: 'EN_COURS', endDate: { lt: now } } }),
      prisma.expense.count({ where: { status: { in: ['SOUMISE', 'VALIDEE_RESPONSABLE'] } } }),
      prisma.recruitmentApplication.count({ where: { status: 'EN_ATTENTE' } }),
    ]);

  if (overdueTasks > 0) {
    alerts.push({
      key: 'tasks.overdue',
      title: 'Tâches en retard',
      description: `**${overdueTasks}** tâche(s) ont dépassé leur échéance.`,
      severity: overdueTasks > 5 ? AlertSeverity.CRITIQUE : AlertSeverity.ATTENTION,
    });
  }

  if (staleProjects > 0) {
    alerts.push({
      key: 'projects.stale',
      title: 'Projets sans activité',
      description: `**${staleProjects}** projet(s) en cours sans mise à jour depuis ${STALE_PROJECT_DAYS} jours.`,
      severity: AlertSeverity.ATTENTION,
    });
  }

  if (forgottenMeetings > 0) {
    alerts.push({
      key: 'meetings.forgotten',
      title: 'Réunions non clôturées',
      description: `**${forgottenMeetings}** réunion(s) passée(s) attendent leur compte-rendu.`,
      severity: AlertSeverity.ATTENTION,
    });
  }

  if (overdueObjectives > 0) {
    alerts.push({
      key: 'objectives.overdue',
      title: 'Objectifs échus',
      description: `**${overdueObjectives}** objectif(s) ont dépassé leur échéance sans être clos.`,
      severity: AlertSeverity.ATTENTION,
    });
  }

  if (pendingExpenses > 0) {
    alerts.push({
      key: 'expenses.pending',
      title: 'Dépenses en attente',
      description: `**${pendingExpenses}** dépense(s) attendent une validation.`,
      severity: pendingExpenses > 5 ? AlertSeverity.CRITIQUE : AlertSeverity.INFO,
    });
  }

  if (pendingApplications > 0) {
    alerts.push({
      key: 'applications.pending',
      title: 'Candidatures en attente',
      description: `**${pendingApplications}** candidature(s) attendent une décision.`,
      severity: AlertSeverity.INFO,
    });
  }

  return alerts;
}

/**
 * Enregistre les alertes détectées, sans dupliquer celles déjà ouvertes.
 *
 * La déduplication se fait sur le titre : une alerte « Tâches en retard » déjà
 * active est mise à jour plutôt que recréée, sinon le salon serait noyé sous les
 * répétitions à chaque passage du cron.
 */
export async function persistAlerts(detected: DetectedAlert[]): Promise<number> {
  let created = 0;

  for (const alert of detected) {
    const existing = await prisma.alert.findFirst({
      where: { title: alert.title, status: AlertStatus.ACTIVE },
    });

    if (existing) {
      await prisma.alert.update({
        where: { id: existing.id },
        data: { description: alert.description, severity: alert.severity },
      });
      continue;
    }

    await prisma.alert.create({
      data: { title: alert.title, description: alert.description, severity: alert.severity },
    });
    created++;
  }

  // Les alertes qui ne remontent plus sont résolues automatiquement.
  const activeTitles = detected.map((a) => a.title);
  const resolved = await prisma.alert.updateMany({
    where: { status: AlertStatus.ACTIVE, title: { notIn: activeTitles.length > 0 ? activeTitles : [''] } },
    data: { status: AlertStatus.RESOLUE, resolvedAt: new Date() },
  });

  if (created > 0 || resolved.count > 0) {
    logger.info(`Alertes : ${created} créée(s), ${resolved.count} résolue(s).`);
  }

  return created;
}

export async function getActiveAlerts() {
  return prisma.alert.findMany({
    where: { status: AlertStatus.ACTIVE },
    include: { assignee: true },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });
}
