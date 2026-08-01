import { Member, Priority, Prisma, Task, TaskStatus } from '@prisma/client';
import prisma from '@database/prisma';
import logger from '@core/Logger';
import { canTransitionTask, TASK_STATUS_LABELS } from '@modules/projects/workflow';

export type TaskWithRelations = Prisma.TaskGetPayload<{
  include: {
    assignee: true;
    creator: true;
    project: true;
    attachments: true;
    _count: { select: { comments: true } };
  };
}>;

const WITH_RELATIONS = {
  assignee: true,
  creator: true,
  project: true,
  attachments: true,
  _count: { select: { comments: true } },
} as const;

export interface CreateTaskInput {
  title: string;
  description?: string;
  creator: Member;
  priority: Priority;
  projectId?: string;
  assignee?: Member;
  dueDate?: Date;
}

export async function createTask(input: CreateTaskInput): Promise<TaskWithRelations> {
  if (input.projectId) {
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) throw new Error('Projet introuvable.');
  }

  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description,
      creatorId: input.creator.id,
      assigneeId: input.assignee?.id,
      projectId: input.projectId,
      priority: input.priority,
      dueDate: input.dueDate,
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Tâche créée : "${task.title}" (${task.id}) par ${input.creator.username}`);

  return task;
}

export async function getTask(id: string): Promise<TaskWithRelations | null> {
  return prisma.task.findUnique({ where: { id }, include: WITH_RELATIONS });
}

/** Recherche pour l'autocomplétion — les tâches terminées sont exclues. */
export async function searchTasks(query: string, limit = 25): Promise<Task[]> {
  return prisma.task.findMany({
    where: {
      status: { not: TaskStatus.TERMINE },
      ...(query ? { title: { contains: query } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
}

export async function assignTask(taskId: string, assignee: Member | null): Promise<TaskWithRelations> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error('Tâche introuvable.');

  if (task.assigneeId === (assignee?.id ?? null)) {
    throw new Error(
      assignee ? `La tâche est déjà assignée à **${assignee.username}**.` : 'La tâche est déjà non assignée.',
    );
  }

  const updated = await prisma.task.update({
    where: { id: taskId },
    data: { assigneeId: assignee?.id ?? null },
    include: WITH_RELATIONS,
  });

  logger.info(`Tâche "${updated.title}" assignée à ${assignee?.username ?? 'personne'}`);

  return updated;
}

export interface TaskStatusChangeResult {
  task: TaskWithRelations;
  previousStatus: TaskStatus;
}

export async function updateTaskStatus(
  taskId: string,
  newStatus: TaskStatus,
): Promise<TaskStatusChangeResult> {
  const current = await prisma.task.findUnique({ where: { id: taskId } });
  if (!current) throw new Error('Tâche introuvable.');

  if (current.status === newStatus) {
    throw new Error(`La tâche est déjà au statut ${TASK_STATUS_LABELS[newStatus]}.`);
  }

  if (!canTransitionTask(current.status, newStatus)) {
    throw new Error(
      `Transition impossible : ${TASK_STATUS_LABELS[current.status]} → ${TASK_STATUS_LABELS[newStatus]}.`,
    );
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      status: newStatus,
      // `completedAt` est remis à null si la tâche est rouverte, pour que les
      // futurs KPI ne comptent pas une tâche terminée puis reprise.
      completedAt: newStatus === TaskStatus.TERMINE ? new Date() : null,
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Tâche "${task.title}" : ${current.status} → ${newStatus}`);

  return { task, previousStatus: current.status };
}

export async function addTaskComment(taskId: string, author: Member, content: string): Promise<void> {
  await prisma.taskComment.create({ data: { taskId, authorId: author.id, content } });
}

export async function addAttachment(
  taskId: string,
  fileName: string,
  fileUrl: string,
): Promise<void> {
  await prisma.attachment.create({ data: { taskId, fileName, fileUrl } });
}

export async function getRecentTaskComments(taskId: string, limit = 5) {
  return prisma.taskComment.findMany({
    where: { taskId },
    include: { author: true },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/** Tâches assignées à un membre, hors terminées — alimente le futur dashboard. */
export async function getMemberTasks(memberId: string): Promise<TaskWithRelations[]> {
  return prisma.task.findMany({
    where: { assigneeId: memberId, status: { not: TaskStatus.TERMINE } },
    include: WITH_RELATIONS,
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
  });
}
