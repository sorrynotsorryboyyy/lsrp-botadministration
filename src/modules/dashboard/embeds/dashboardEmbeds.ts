import { EmbedBuilder, User } from 'discord.js';
import { formatDate } from '@utils/dateFormatter';
import { DashboardData } from '../services/dashboardService';

const FIELD_LIMIT = 1024;
const BAR_WIDTH = 12;

/**
 * Barre de progression en caractères pleins.
 *
 * Un total nul rend la barre vide plutôt que de produire une division par zéro
 * — cas courant sur une base fraîchement installée.
 */
export function progressBar(value: number, total: number): string {
  if (total <= 0) return `${'░'.repeat(BAR_WIDTH)} 0 %`;

  const ratio = Math.min(1, Math.max(0, value / total));
  const filled = Math.round(ratio * BAR_WIDTH);

  return `${'█'.repeat(filled)}${'░'.repeat(BAR_WIDTH - filled)} ${Math.round(ratio * 100)} %`;
}

export function buildDashboardEmbed(data: DashboardData, requester: User): EmbedBuilder {
  const { stats, lists } = data;

  // La couleur reflète l'urgence : rien à signaler, retards, ou blocages nets.
  const color =
    stats.tasks.overdue > 5 || stats.projects.blocked > 2
      ? 0xe74c3c
      : stats.tasks.overdue > 0 || stats.applications.pending > 0
        ? 0xf39c12
        : 0x27ae60;

  const embed = new EmbedBuilder()
    .setTitle('📊 Tableau de bord')
    .setColor(color)
    .addFields(
      {
        name: '👥 Effectifs',
        value: [
          `Actifs : **${stats.members.active}** / ${stats.members.total}`,
          `En congé : **${stats.members.onLeave}** · Suspendus : **${stats.members.suspended}**`,
          progressBar(stats.members.active, stats.members.total),
        ].join('\n'),
        inline: false,
      },
      {
        name: '📁 Projets',
        value: [
          `En cours : **${stats.projects.inProgress}** · Bloqués : **${stats.projects.blocked}**`,
          `Terminés : **${stats.projects.completed}** / ${stats.projects.total}`,
          progressBar(stats.projects.completed, stats.projects.total),
        ].join('\n'),
        inline: false,
      },
      {
        name: '📋 Tâches',
        value: [
          `Ouvertes : **${stats.tasks.open}** · En retard : **${stats.tasks.overdue}**`,
          `Non assignées : **${stats.tasks.unassigned}**`,
          `Terminées cette semaine : **${stats.tasks.completedThisWeek}**`,
        ].join('\n'),
        inline: false,
      },
    );

  const alerts = buildAlerts(data);
  if (alerts) {
    embed.addFields({ name: '⚠️ Points d\'attention', value: alerts });
  }

  if (lists.overdueTasks.length > 0) {
    embed.addFields({
      name: `⏰ Tâches en retard (${stats.tasks.overdue})`,
      value: truncate(
        lists.overdueTasks
          .map((task) => `• **${task.title}** — ${task.assignee ?? '_non assignée_'} (${formatDate(task.dueDate)})`)
          .join('\n'),
        FIELD_LIMIT,
      ),
    });
  }

  if (lists.blockedProjects.length > 0) {
    embed.addFields({
      name: `⏸️ Projets en attente (${stats.projects.blocked})`,
      value: truncate(
        lists.blockedProjects.map((p) => `• **${p.title}** — ${p.pole ?? 'sans pôle'}`).join('\n'),
        FIELD_LIMIT,
      ),
    });
  }

  if (lists.pendingApplications.length > 0) {
    embed.addFields({
      name: `📋 Candidatures en attente (${stats.applications.pending})`,
      value: truncate(
        lists.pendingApplications
          .map((a) => `• **${a.pseudo}** — ${a.pole ?? 'sans pôle'} (${formatDate(a.submittedAt)})`)
          .join('\n'),
        FIELD_LIMIT,
      ),
    });
  }

  embed
    .setFooter({
      text: `Généré pour ${requester.username} • ${stats.announcements.thisWeek} annonce(s) cette semaine`,
      iconURL: requester.displayAvatarURL(),
    })
    .setTimestamp(data.generatedAt);

  return embed;
}

/** Synthèse des anomalies, ou `null` s'il n'y a rien à signaler. */
function buildAlerts(data: DashboardData): string | null {
  const { stats } = data;
  const alerts: string[] = [];

  if (stats.tasks.overdue > 0) alerts.push(`**${stats.tasks.overdue}** tâche(s) en retard`);
  if (stats.tasks.unassigned > 0) alerts.push(`**${stats.tasks.unassigned}** tâche(s) sans responsable`);
  if (stats.projects.blocked > 0) alerts.push(`**${stats.projects.blocked}** projet(s) en attente`);
  if (stats.applications.pending > 0)
    alerts.push(`**${stats.applications.pending}** candidature(s) à traiter`);
  if (stats.members.suspended > 0) alerts.push(`**${stats.members.suspended}** membre(s) suspendu(s)`);

  return alerts.length > 0 ? alerts.map((a) => `• ${a}`).join('\n') : null;
}

export function buildPoleBreakdownEmbed(
  breakdown: Array<{ pole: string; members: number; projects: number }>,
  requester: User,
): EmbedBuilder {
  const rows = breakdown
    .map((row) => `**${row.pole}** — ${row.members} membre(s) · ${row.projects} projet(s)`)
    .join('\n');

  return new EmbedBuilder()
    .setTitle('🏛️ Répartition par pôle')
    .setColor(0x3498db)
    .setDescription(truncate(rows || '_Aucun pôle enregistré. Exécutez `/setup`._', 4096))
    .setFooter({ text: `Demandé par ${requester.username}`, iconURL: requester.displayAvatarURL() })
    .setTimestamp();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
