import { MemberStatus, ProjectStatus, TaskStatus } from '@prisma/client';
import prisma from '@database/prisma';

export interface DashboardStats {
  members: { total: number; active: number; suspended: number; onLeave: number };
  projects: { total: number; inProgress: number; blocked: number; completed: number };
  tasks: { open: number; overdue: number; unassigned: number; completedThisWeek: number };
  applications: { pending: number };
  announcements: { thisWeek: number };
}

export interface DashboardLists {
  overdueTasks: Array<{ title: string; assignee: string | null; dueDate: Date }>;
  blockedProjects: Array<{ title: string; pole: string | null }>;
  pendingApplications: Array<{ pseudo: string; pole: string | null; submittedAt: Date }>;
}

export interface DashboardData {
  stats: DashboardStats;
  lists: DashboardLists;
  generatedAt: Date;
}

/** Nombre d'éléments affichés dans chaque liste de l'embed. */
const LIST_LIMIT = 5;

/** Début de la semaine glissante servant aux compteurs hebdomadaires. */
function startOfWeek(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Agrège l'état courant de l'organisation.
 *
 * Toutes les requêtes partent en parallèle : elles sont indépendantes, et les
 * enchaîner rendrait la commande sensiblement plus lente à mesure que la base
 * grossit.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const weekStart = startOfWeek();
  const now = new Date();

  const [
    memberTotal,
    memberActive,
    memberSuspended,
    memberOnLeave,
    projectTotal,
    projectInProgress,
    projectBlocked,
    projectCompleted,
    tasksOpen,
    tasksOverdue,
    tasksUnassigned,
    tasksCompletedThisWeek,
    applicationsPending,
    announcementsThisWeek,
    overdueTaskRows,
    blockedProjectRows,
    pendingApplicationRows,
  ] = await Promise.all([
    prisma.member.count({ where: { status: { not: MemberStatus.PARTI } } }),
    prisma.member.count({ where: { status: MemberStatus.ACTIF } }),
    prisma.member.count({ where: { status: MemberStatus.SUSPENDU } }),
    prisma.member.count({ where: { status: MemberStatus.EN_CONGE } }),

    prisma.project.count({ where: { status: { not: ProjectStatus.ARCHIVE } } }),
    prisma.project.count({ where: { status: ProjectStatus.EN_COURS } }),
    prisma.project.count({ where: { status: ProjectStatus.EN_ATTENTE } }),
    prisma.project.count({ where: { status: ProjectStatus.TERMINE } }),

    prisma.task.count({ where: { status: { not: TaskStatus.TERMINE } } }),
    prisma.task.count({
      where: { status: { not: TaskStatus.TERMINE }, dueDate: { lt: now } },
    }),
    prisma.task.count({
      where: { status: { not: TaskStatus.TERMINE }, assigneeId: null },
    }),
    prisma.task.count({
      where: { status: TaskStatus.TERMINE, completedAt: { gte: weekStart } },
    }),

    prisma.recruitmentApplication.count({ where: { status: 'EN_ATTENTE' } }),
    prisma.announcement.count({ where: { createdAt: { gte: weekStart } } }),

    prisma.task.findMany({
      where: { status: { not: TaskStatus.TERMINE }, dueDate: { lt: now } },
      include: { assignee: true },
      orderBy: { dueDate: 'asc' },
      take: LIST_LIMIT,
    }),
    prisma.project.findMany({
      where: { status: ProjectStatus.EN_ATTENTE },
      include: { pole: true },
      orderBy: { updatedAt: 'desc' },
      take: LIST_LIMIT,
    }),
    prisma.recruitmentApplication.findMany({
      where: { status: 'EN_ATTENTE' },
      include: { targetPole: true },
      orderBy: { submittedAt: 'asc' },
      take: LIST_LIMIT,
    }),
  ]);

  return {
    stats: {
      members: {
        total: memberTotal,
        active: memberActive,
        suspended: memberSuspended,
        onLeave: memberOnLeave,
      },
      projects: {
        total: projectTotal,
        inProgress: projectInProgress,
        blocked: projectBlocked,
        completed: projectCompleted,
      },
      tasks: {
        open: tasksOpen,
        overdue: tasksOverdue,
        unassigned: tasksUnassigned,
        completedThisWeek: tasksCompletedThisWeek,
      },
      applications: { pending: applicationsPending },
      announcements: { thisWeek: announcementsThisWeek },
    },
    lists: {
      overdueTasks: overdueTaskRows.map((task) => ({
        title: task.title,
        assignee: task.assignee?.username ?? null,
        // Le filtre garantit une date non nulle ; le typage l'ignore.
        dueDate: task.dueDate!,
      })),
      blockedProjects: blockedProjectRows.map((project) => ({
        title: project.title,
        pole: project.pole?.displayName ?? null,
      })),
      pendingApplications: pendingApplicationRows.map((application) => ({
        pseudo: application.candidatePseudo,
        pole: application.targetPole?.displayName ?? null,
        submittedAt: application.submittedAt,
      })),
    },
    generatedAt: now,
  };
}

/** Répartition des effectifs par pôle. */
export async function getPoleBreakdown(): Promise<Array<{ pole: string; members: number; projects: number }>> {
  const poles = await prisma.pole.findMany({
    include: {
      _count: {
        select: {
          members: { where: { status: { not: MemberStatus.PARTI } } },
          projects: { where: { status: { not: ProjectStatus.ARCHIVE } } },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return poles.map((pole) => ({
    pole: pole.displayName,
    members: pole._count.members,
    projects: pole._count.projects,
  }));
}
