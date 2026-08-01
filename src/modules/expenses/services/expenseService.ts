import { ExpenseStatus, Grade, Member, Prisma } from '@prisma/client';
import prisma from '@database/prisma';
import { isGradeHigherOrEqual } from '@apptypes/grade.types';
import { recordAudit } from '@modules/audit/services/auditService';
import { AuditAction, AuditEntity } from '@modules/audit/actions';
import logger from '@core/Logger';

export type ExpenseWithRelations = Prisma.ExpenseGetPayload<{
  include: { submitter: true; reviewer: true };
}>;

const WITH_RELATIONS = { submitter: true, reviewer: true } as const;

/**
 * Seuil au-delà duquel une validation de Directeur est requise en plus de celle
 * du Responsable. En dessous, l'aval d'un Responsable suffit.
 */
export const DIRECTOR_APPROVAL_THRESHOLD = 100;

export interface CreateExpenseInput {
  title: string;
  amount: number;
  description?: string;
  receiptUrl?: string;
  submitter: Member;
}

export async function createExpense(input: CreateExpenseInput): Promise<ExpenseWithRelations> {
  if (input.amount <= 0) {
    throw new Error('Le montant doit être strictement positif.');
  }

  const expense = await prisma.expense.create({
    data: {
      title: input.title,
      amount: new Prisma.Decimal(input.amount),
      description: input.description,
      receiptUrl: input.receiptUrl,
      submitterId: input.submitter.id,
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Dépense soumise : "${expense.title}" (${input.amount} €) par ${input.submitter.username}`);

  await recordAudit({
    action: AuditAction.EXPENSE_SUBMITTED,
    entityType: AuditEntity.EXPENSE,
    entityId: expense.id,
    actorId: input.submitter.id,
    metadata: { titre: expense.title, montant: input.amount },
  });

  return expense;
}

export async function getExpense(id: string): Promise<ExpenseWithRelations | null> {
  return prisma.expense.findUnique({ where: { id }, include: WITH_RELATIONS });
}

export async function getPendingExpenses(limit = 25): Promise<ExpenseWithRelations[]> {
  return prisma.expense.findMany({
    where: { status: { in: [ExpenseStatus.SOUMISE, ExpenseStatus.VALIDEE_RESPONSABLE] } },
    include: WITH_RELATIONS,
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}

/** Étape de validation attendue pour une dépense, selon son état et son montant. */
export function nextApprovalStep(expense: {
  status: ExpenseStatus;
  amount: Prisma.Decimal;
}): { requiredGrade: Grade; nextStatus: ExpenseStatus } | null {
  const needsDirector = expense.amount.greaterThan(DIRECTOR_APPROVAL_THRESHOLD);

  if (expense.status === ExpenseStatus.SOUMISE) {
    return {
      requiredGrade: Grade.RESPONSABLE,
      // Une petite dépense est acceptée dès l'aval du Responsable ; une grosse
      // passe en attente de contreseing du Directeur.
      nextStatus: needsDirector ? ExpenseStatus.VALIDEE_RESPONSABLE : ExpenseStatus.ACCEPTEE,
    };
  }

  if (expense.status === ExpenseStatus.VALIDEE_RESPONSABLE) {
    return { requiredGrade: Grade.DIRECTEUR_POLE, nextStatus: ExpenseStatus.ACCEPTEE };
  }

  // ACCEPTEE, REFUSEE, VALIDEE_DIRECTEUR : plus rien à valider.
  return null;
}

export interface ReviewResult {
  expense: ExpenseWithRelations;
  fullyApproved: boolean;
}

/**
 * Fait avancer une dépense dans le circuit de validation.
 *
 * Le grade requis dépend de l'étape courante : un Responsable ne peut pas
 * contresigner à la place d'un Directeur sur une dépense importante.
 */
export async function approveExpense(
  expenseId: string,
  actor: Member,
  actorGrade: Grade,
): Promise<ReviewResult> {
  const current = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!current) throw new Error('Dépense introuvable.');

  const step = nextApprovalStep(current);
  if (!step) {
    throw new Error(`Cette dépense a déjà été traitée (${current.status}).`);
  }

  if (!isGradeHigherOrEqual(actorGrade, step.requiredGrade)) {
    throw new Error(
      `Cette étape requiert le grade **${step.requiredGrade}** ou supérieur.`,
    );
  }

  // On ne valide pas sa propre dépense : le contrôle perdrait tout son sens.
  if (current.submitterId === actor.id) {
    throw new Error('Vous ne pouvez pas valider votre propre dépense.');
  }

  const expense = await prisma.expense.update({
    where: { id: expenseId },
    data: {
      status: step.nextStatus,
      reviewerId: actor.id,
      decidedAt: step.nextStatus === ExpenseStatus.ACCEPTEE ? new Date() : null,
    },
    include: WITH_RELATIONS,
  });

  const fullyApproved = step.nextStatus === ExpenseStatus.ACCEPTEE;

  logger.info(`Dépense "${expense.title}" → ${step.nextStatus} (par ${actor.username})`);

  if (fullyApproved) {
    await recordAudit({
      action: AuditAction.EXPENSE_APPROVED,
      entityType: AuditEntity.EXPENSE,
      entityId: expense.id,
      actorId: actor.id,
      metadata: { target: expense.title, montant: expense.amount.toString() },
    });
  }

  return { expense, fullyApproved };
}

export async function refuseExpense(
  expenseId: string,
  actor: Member,
  actorGrade: Grade,
  reason?: string,
): Promise<ExpenseWithRelations> {
  const current = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!current) throw new Error('Dépense introuvable.');

  if (current.status === ExpenseStatus.ACCEPTEE || current.status === ExpenseStatus.REFUSEE) {
    throw new Error(`Cette dépense a déjà été traitée (${current.status}).`);
  }

  if (!isGradeHigherOrEqual(actorGrade, Grade.RESPONSABLE)) {
    throw new Error('Seuls les Responsables et au-dessus peuvent refuser une dépense.');
  }

  const expense = await prisma.expense.update({
    where: { id: expenseId },
    data: {
      status: ExpenseStatus.REFUSEE,
      reviewerId: actor.id,
      decidedAt: new Date(),
      description: reason ? `${current.description ?? ''}\n\n[Refus] ${reason}`.trim() : current.description,
    },
    include: WITH_RELATIONS,
  });

  logger.info(`Dépense "${expense.title}" refusée par ${actor.username}`);

  await recordAudit({
    action: AuditAction.EXPENSE_REFUSED,
    entityType: AuditEntity.EXPENSE,
    entityId: expense.id,
    actorId: actor.id,
    metadata: { target: expense.title, motif: reason },
  });

  return expense;
}

/** Total des dépenses acceptées depuis une date — alimente le dashboard. */
export async function getApprovedTotal(since?: Date): Promise<number> {
  const result = await prisma.expense.aggregate({
    where: { status: ExpenseStatus.ACCEPTEE, ...(since ? { decidedAt: { gte: since } } : {}) },
    _sum: { amount: true },
  });

  return Number(result._sum.amount ?? 0);
}
