/**
 * Catalogue des actions journalisables.
 *
 * Volontairement centralisé et typé : si chaque module inventait ses propres
 * libellés, filtrer l'historique deviendrait impossible dès la première faute de
 * frappe. Ajouter une action ici avant de l'émettre.
 */
export const AuditAction = {
  // RH
  APPLICATION_CREATED: 'application.created',
  APPLICATION_ACCEPTED: 'application.accepted',
  APPLICATION_REJECTED: 'application.rejected',
  MEMBER_PROMOTED: 'member.promoted',
  MEMBER_DEMOTED: 'member.demoted',
  MEMBER_POLE_CHANGED: 'member.pole_changed',
  MEMBER_WARNED: 'member.warned',
  MEMBER_SANCTIONED: 'member.sanctioned',

  // Projets
  PROJECT_CREATED: 'project.created',
  PROJECT_STATUS_CHANGED: 'project.status_changed',
  PROJECT_MEMBER_ADDED: 'project.member_added',
  PROJECT_MEMBER_REMOVED: 'project.member_removed',

  // Tâches
  TASK_CREATED: 'task.created',
  TASK_ASSIGNED: 'task.assigned',
  TASK_STATUS_CHANGED: 'task.status_changed',

  // Annonces
  ANNOUNCEMENT_PUBLISHED: 'announcement.published',

  // Réunions et décisions
  MEETING_CREATED: 'meeting.created',
  MEETING_CLOSED: 'meeting.closed',
  DECISION_CREATED: 'decision.created',
  DECISION_VALIDATED: 'decision.validated',
  DECISION_REJECTED: 'decision.rejected',

  // Dépenses
  EXPENSE_SUBMITTED: 'expense.submitted',
  EXPENSE_APPROVED: 'expense.approved',
  EXPENSE_REFUSED: 'expense.refused',

  // Objectifs
  OBJECTIVE_CREATED: 'objective.created',
  OBJECTIVE_COMPLETED: 'objective.completed',

  // Roadmap, documents, absences
  ROADMAP_ITEM_CREATED: 'roadmap.created',
  ROADMAP_ITEM_UPDATED: 'roadmap.updated',
  DOCUMENT_PUBLISHED: 'document.published',
  ABSENCE_DECLARED: 'absence.declared',
  ABSENCE_REVIEWED: 'absence.reviewed',

  // Administration
  SETUP_EXECUTED: 'setup.executed',
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

/** Type d'entité concernée, pour retrouver l'historique d'un objet précis. */
export const AuditEntity = {
  MEMBER: 'Member',
  APPLICATION: 'RecruitmentApplication',
  PROJECT: 'Project',
  TASK: 'Task',
  ANNOUNCEMENT: 'Announcement',
  MEETING: 'Meeting',
  DECISION: 'Decision',
  EXPENSE: 'Expense',
  OBJECTIVE: 'Objective',
  ROADMAP: 'RoadmapItem',
  DOCUMENT: 'Document',
  ABSENCE: 'Absence',
  GUILD: 'Guild',
} as const;

export type AuditEntityValue = (typeof AuditEntity)[keyof typeof AuditEntity];

/** Libellés lisibles, pour l'affichage dans les embeds. */
export const AUDIT_ACTION_LABELS: Record<AuditActionValue, string> = {
  [AuditAction.APPLICATION_CREATED]: '📋 Candidature déposée',
  [AuditAction.APPLICATION_ACCEPTED]: '✅ Candidature acceptée',
  [AuditAction.APPLICATION_REJECTED]: '❌ Candidature refusée',
  [AuditAction.MEMBER_PROMOTED]: '🎉 Promotion',
  [AuditAction.MEMBER_DEMOTED]: '📉 Rétrogradation',
  [AuditAction.MEMBER_POLE_CHANGED]: '🔄 Changement de pôle',
  [AuditAction.MEMBER_WARNED]: '⚠️ Avertissement',
  [AuditAction.MEMBER_SANCTIONED]: '⚖️ Sanction',
  [AuditAction.PROJECT_CREATED]: '📁 Projet créé',
  [AuditAction.PROJECT_STATUS_CHANGED]: '🔄 Statut de projet modifié',
  [AuditAction.PROJECT_MEMBER_ADDED]: '➕ Participant ajouté',
  [AuditAction.PROJECT_MEMBER_REMOVED]: '➖ Participant retiré',
  [AuditAction.TASK_CREATED]: '📋 Tâche créée',
  [AuditAction.TASK_ASSIGNED]: '🙋 Tâche assignée',
  [AuditAction.TASK_STATUS_CHANGED]: '🔄 Statut de tâche modifié',
  [AuditAction.ANNOUNCEMENT_PUBLISHED]: '📢 Annonce publiée',
  [AuditAction.MEETING_CREATED]: '📅 Réunion planifiée',
  [AuditAction.MEETING_CLOSED]: '📝 Réunion clôturée',
  [AuditAction.DECISION_CREATED]: '💡 Décision proposée',
  [AuditAction.DECISION_VALIDATED]: '✅ Décision validée',
  [AuditAction.DECISION_REJECTED]: '❌ Décision rejetée',
  [AuditAction.EXPENSE_SUBMITTED]: '💶 Dépense soumise',
  [AuditAction.EXPENSE_APPROVED]: '✅ Dépense acceptée',
  [AuditAction.EXPENSE_REFUSED]: '❌ Dépense refusée',
  [AuditAction.OBJECTIVE_CREATED]: '🎯 Objectif défini',
  [AuditAction.OBJECTIVE_COMPLETED]: '🏆 Objectif atteint',
  [AuditAction.ROADMAP_ITEM_CREATED]: '🗺️ Élément de roadmap ajouté',
  [AuditAction.ROADMAP_ITEM_UPDATED]: '🔄 Roadmap mise à jour',
  [AuditAction.DOCUMENT_PUBLISHED]: '📚 Document publié',
  [AuditAction.ABSENCE_DECLARED]: '🌴 Absence déclarée',
  [AuditAction.ABSENCE_REVIEWED]: '📋 Absence traitée',
  [AuditAction.SETUP_EXECUTED]: '⚙️ Configuration du serveur',
};
