import { EmbedBuilder, User } from 'discord.js';
import { ObjectiveScope, ObjectiveStatus, AlertSeverity } from '@prisma/client';
import { formatDate } from '@utils/dateFormatter';
import { progressBar } from '@modules/dashboard/embeds/dashboardEmbeds';
import { ObjectiveWithRelations } from '../services/objectiveService';
import { KpiComparison, KPI_LABELS, KpiMetricValue } from '@modules/kpi/services/kpiService';
import { RoadmapItemWithRelations, ROADMAP_STATUS_LABELS } from '@modules/roadmap/services/roadmapService';
import { DocumentWithAuthor, DOCUMENT_CATEGORY_LABELS } from '@modules/documents/services/documentService';
import { AbsenceWithRelations, ABSENCE_TYPE_LABELS } from '@modules/absences/services/absenceService';

const FIELD_LIMIT = 1024;

const SCOPE_LABELS: Record<ObjectiveScope, string> = {
  [ObjectiveScope.HEBDOMADAIRE]: 'Hebdomadaire',
  [ObjectiveScope.MENSUEL]: 'Mensuel',
  [ObjectiveScope.POLE]: 'Pôle',
  [ObjectiveScope.INDIVIDUEL]: 'Individuel',
};

const OBJECTIVE_STYLE: Record<ObjectiveStatus, { color: number; label: string }> = {
  [ObjectiveStatus.EN_COURS]: { color: 0x3498db, label: '🎯 En cours' },
  [ObjectiveStatus.ATTEINT]: { color: 0x27ae60, label: '🏆 Atteint' },
  [ObjectiveStatus.MANQUE]: { color: 0xe74c3c, label: '❌ Manqué' },
  [ObjectiveStatus.ANNULE]: { color: 0x95a5a6, label: '⛔ Annulé' },
};

export function buildObjectiveEmbed(objective: ObjectiveWithRelations): EmbedBuilder {
  const style = OBJECTIVE_STYLE[objective.status];

  // Avancement temporel : où en est-on entre le début et l'échéance ?
  const total = objective.endDate.getTime() - objective.startDate.getTime();
  const elapsed = Date.now() - objective.startDate.getTime();

  const embed = new EmbedBuilder()
    .setTitle(`🎯 ${objective.title}`)
    .setColor(style.color)
    .addFields(
      { name: 'Statut', value: style.label, inline: true },
      { name: 'Portée', value: SCOPE_LABELS[objective.scope], inline: true },
      { name: 'Pôle', value: objective.pole?.displayName ?? '—', inline: true },
      { name: 'Début', value: formatDate(objective.startDate), inline: true },
      { name: 'Échéance', value: formatDate(objective.endDate), inline: true },
      {
        name: 'Responsable',
        value: objective.owner ? `<@${objective.owner.discordId}>` : '—',
        inline: true,
      },
    )
    .setFooter({ text: `Réf. ${objective.id}` })
    .setTimestamp(objective.createdAt);

  if (objective.description) {
    embed.setDescription(truncate(objective.description, 4096));
  }

  if (objective.status === ObjectiveStatus.EN_COURS) {
    embed.addFields({ name: 'Temps écoulé', value: progressBar(elapsed, total) });
  }

  return embed;
}

export function buildKpiEmbed(comparison: KpiComparison, requester: User): EmbedBuilder {
  const { current, previous } = comparison;

  const lines = (Object.keys(current.metrics) as KpiMetricValue[]).map((metric) => {
    const value = current.metrics[metric];
    const before = previous?.metrics[metric] ?? 0;
    return `${KPI_LABELS[metric]} : **${value}** ${trend(value, before)}`;
  });

  return new EmbedBuilder()
    .setTitle('📈 Indicateurs hebdomadaires')
    .setColor(0x9b59b6)
    .setDescription(`Semaine du **${formatDate(current.weekStart)}**`)
    .addFields({ name: 'Métriques', value: truncate(lines.join('\n'), FIELD_LIMIT) })
    .setFooter({
      text: `Comparé à la semaine précédente • ${requester.username}`,
      iconURL: requester.displayAvatarURL(),
    })
    .setTimestamp();
}

/** Flèche de tendance par rapport à la période précédente. */
function trend(current: number, previous: number): string {
  if (current > previous) return `📈 (+${current - previous})`;
  if (current < previous) return `📉 (${current - previous})`;
  return '➖';
}

export function buildRoadmapEmbed(items: RoadmapItemWithRelations[], requester: User): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🗺️ Roadmap')
    .setColor(0x1abc9c)
    .setFooter({ text: `Demandé par ${requester.username}`, iconURL: requester.displayAvatarURL() })
    .setTimestamp();

  if (items.length === 0) {
    embed.setDescription('_Aucun élément de roadmap enregistré._');
    return embed;
  }

  // Regroupement par statut : la roadmap se lit par colonne d'avancement.
  const grouped = new Map<string, string[]>();

  for (const item of items) {
    const label = ROADMAP_STATUS_LABELS[item.status];
    const line = `• **${item.title}**${item.targetDate ? ` — ${formatDate(item.targetDate)}` : ''}`;
    grouped.set(label, [...(grouped.get(label) ?? []), line]);
  }

  for (const [label, lines] of grouped) {
    embed.addFields({ name: label, value: truncate(lines.join('\n'), FIELD_LIMIT) });
  }

  return embed;
}

export function buildDocumentEmbed(document: DocumentWithAuthor): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`📚 ${document.title}`)
    .setColor(0x34495e)
    .addFields(
      { name: 'Catégorie', value: DOCUMENT_CATEGORY_LABELS[document.category], inline: true },
      { name: 'Auteur', value: `<@${document.author.discordId}>`, inline: true },
    )
    .setFooter({ text: `Réf. ${document.id}` })
    .setTimestamp(document.updatedAt);

  if (document.content) embed.setDescription(truncate(document.content, 4096));
  if (document.fileUrl) {
    embed.addFields({ name: 'Fichier', value: `[Télécharger](${document.fileUrl})` });
  }

  return embed;
}

export function buildDocumentListEmbed(
  documents: DocumentWithAuthor[],
  requester: User,
): EmbedBuilder {
  const lines = documents.map(
    (doc) => `• ${DOCUMENT_CATEGORY_LABELS[doc.category]} **${doc.title}**`,
  );

  return new EmbedBuilder()
    .setTitle('📚 Bibliothèque documentaire')
    .setColor(0x34495e)
    .setDescription(truncate(lines.join('\n') || '_Aucun document._', 4096))
    .setFooter({ text: `Demandé par ${requester.username}`, iconURL: requester.displayAvatarURL() })
    .setTimestamp();
}

export function buildAbsenceEmbed(absence: AbsenceWithRelations): EmbedBuilder {
  const days = Math.ceil(
    (absence.endDate.getTime() - absence.startDate.getTime()) / (24 * 60 * 60 * 1000),
  ) + 1;

  const embed = new EmbedBuilder()
    .setTitle('🌴 Absence')
    .setColor(absence.status === 'VALIDEE' ? 0x27ae60 : absence.status === 'REFUSEE' ? 0xe74c3c : 0x3498db)
    .addFields(
      { name: 'Membre', value: `<@${absence.member.discordId}>`, inline: true },
      { name: 'Type', value: ABSENCE_TYPE_LABELS[absence.type], inline: true },
      { name: 'Statut', value: absence.status, inline: true },
      { name: 'Du', value: formatDate(absence.startDate), inline: true },
      { name: 'Au', value: formatDate(absence.endDate), inline: true },
      { name: 'Durée', value: `${days} jour(s)`, inline: true },
    )
    .setFooter({ text: `Réf. ${absence.id}` })
    .setTimestamp(absence.createdAt);

  if (absence.reason) embed.addFields({ name: 'Motif', value: truncate(absence.reason, FIELD_LIMIT) });

  return embed;
}

export function buildAbsenceListEmbed(
  absences: AbsenceWithRelations[],
  requester: User,
): EmbedBuilder {
  const lines = absences.map(
    (a) =>
      `• <@${a.member.discordId}> — ${ABSENCE_TYPE_LABELS[a.type]} jusqu'au ${formatDate(a.endDate)}`,
  );

  return new EmbedBuilder()
    .setTitle('🌴 Absences en cours')
    .setColor(0xf39c12)
    .setDescription(truncate(lines.join('\n') || '_Personne n\'est absent actuellement._', 4096))
    .setFooter({ text: `Demandé par ${requester.username}`, iconURL: requester.displayAvatarURL() })
    .setTimestamp();
}

const ALERT_EMOJI: Record<AlertSeverity, string> = {
  [AlertSeverity.INFO]: 'ℹ️',
  [AlertSeverity.ATTENTION]: '⚠️',
  [AlertSeverity.CRITIQUE]: '🚨',
};

export function buildAlertsEmbed(
  alerts: Array<{ title: string; description: string | null; severity: AlertSeverity }>,
  requester: User,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🚨 Alertes actives')
    .setColor(
      alerts.some((a) => a.severity === AlertSeverity.CRITIQUE)
        ? 0xe74c3c
        : alerts.length > 0
          ? 0xf39c12
          : 0x27ae60,
    )
    .setFooter({ text: `Demandé par ${requester.username}`, iconURL: requester.displayAvatarURL() })
    .setTimestamp();

  if (alerts.length === 0) {
    embed.setDescription('✅ Aucune anomalie détectée.');
    return embed;
  }

  for (const alert of alerts) {
    embed.addFields({
      name: `${ALERT_EMOJI[alert.severity]} ${alert.title}`,
      value: truncate(alert.description ?? '—', FIELD_LIMIT),
    });
  }

  return embed;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
