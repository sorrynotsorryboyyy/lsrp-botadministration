import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, User } from 'discord.js';
import {
  ApplicationStatus,
  Grade,
  Member,
  Sanction,
  SanctionType,
  Warning,
} from '@prisma/client';
import { formatDate, formatDateTime } from '@utils/dateFormatter';
import { ApplicationWithRelations } from '../services/applicationService';
import { MemberDossier, HistoryEntry } from '../services/memberHistoryService';

/** Libellés lisibles des grades, pour l'affichage. */
export const GRADE_LABELS: Record<Grade, string> = {
  [Grade.FONDATEUR]: 'Fondateur',
  [Grade.CO_FONDATEUR]: 'Co-Fondateur',
  [Grade.DIRECTEUR_GENERAL]: 'Directeur Général',
  [Grade.DIRECTEUR_POLE]: 'Directeur de Pôle',
  [Grade.RESPONSABLE]: 'Responsable',
  [Grade.CHEF_EQUIPE]: "Chef d'équipe",
  [Grade.COLLABORATEUR]: 'Collaborateur',
  [Grade.RECRUE]: 'Recrue',
};

const STATUS_STYLE: Record<ApplicationStatus, { color: number; label: string }> = {
  [ApplicationStatus.EN_ATTENTE]: { color: 0x3498db, label: '🕐 En attente' },
  [ApplicationStatus.EN_ENTRETIEN]: { color: 0xf39c12, label: '🗣️ En entretien' },
  [ApplicationStatus.ACCEPTEE]: { color: 0x27ae60, label: '✅ Acceptée' },
  [ApplicationStatus.REFUSEE]: { color: 0xe74c3c, label: '❌ Refusée' },
  [ApplicationStatus.ANNULEE]: { color: 0x95a5a6, label: '⛔ Annulée' },
};

/**
 * Embed d'une candidature. Sa couleur et ses champs suivent le statut, si bien
 * que le même message peut être édité en place à chaque étape du workflow.
 */
export function buildApplicationEmbed(application: ApplicationWithRelations): EmbedBuilder {
  const style = STATUS_STYLE[application.status];

  const embed = new EmbedBuilder()
    .setTitle('📋 Candidature')
    .setColor(style.color)
    .addFields(
      { name: 'Candidat', value: `<@${application.candidateDiscordId}>`, inline: true },
      { name: 'Pôle visé', value: application.targetPole?.displayName ?? '—', inline: true },
      { name: 'Statut', value: style.label, inline: true },
      { name: 'Motivation', value: truncate(application.motivation, 1024) },
    )
    .setFooter({ text: `Réf. ${application.id}` })
    .setTimestamp(application.submittedAt);

  if (application.reviewer) {
    embed.addFields({
      name: 'Traitée par',
      value: `<@${application.reviewer.discordId}>`,
      inline: true,
    });
  }

  if (application.decisionNote) {
    embed.addFields({ name: 'Note de décision', value: truncate(application.decisionNote, 1024) });
  }

  return embed;
}

/** Boutons de décision, à n'attacher qu'à une candidature encore ouverte. */
export function buildApplicationButtons(applicationId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rh:app:accept:${applicationId}`)
      .setLabel('Accepter')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rh:app:interview:${applicationId}`)
      .setLabel('Entretien')
      .setEmoji('🗣️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`rh:app:reject:${applicationId}`)
      .setLabel('Refuser')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  );
}

export function buildPromotionEmbed(
  target: Member,
  actor: Member,
  previousGrade: Grade,
  newGrade: Grade,
  reason: string | undefined,
  isPromotion: boolean,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(isPromotion ? '🎉 Promotion' : '📉 Changement de grade')
    .setColor(isPromotion ? 0xffd700 : 0xe67e22)
    .addFields(
      { name: 'Membre', value: `<@${target.discordId}>`, inline: true },
      { name: 'Ancien grade', value: GRADE_LABELS[previousGrade], inline: true },
      { name: 'Nouveau grade', value: GRADE_LABELS[newGrade], inline: true },
      { name: 'Décidé par', value: `<@${actor.discordId}>`, inline: false },
    )
    .setTimestamp();

  if (reason) embed.addFields({ name: 'Motif', value: truncate(reason, 1024) });

  return embed;
}

export function buildPoleTransferEmbed(
  target: Member,
  actor: Member,
  previousPole: string,
  newPole: string,
  reason?: string,
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🔄 Changement de pôle')
    .setColor(0x3498db)
    .addFields(
      { name: 'Membre', value: `<@${target.discordId}>`, inline: true },
      { name: 'Ancien pôle', value: previousPole, inline: true },
      { name: 'Nouveau pôle', value: newPole, inline: true },
      { name: 'Décidé par', value: `<@${actor.discordId}>` },
    )
    .setTimestamp();

  if (reason) embed.addFields({ name: 'Motif', value: truncate(reason, 1024) });

  return embed;
}

export function buildSanctionEmbed(
  sanction: Sanction,
  target: Member,
  actor: Member,
): EmbedBuilder {
  const heavy = sanction.type === SanctionType.SUSPENSION || sanction.type === SanctionType.EXCLUSION;

  const embed = new EmbedBuilder()
    .setTitle('⚖️ Sanction')
    .setColor(heavy ? 0xc0392b : 0xe67e22)
    .addFields(
      { name: 'Membre', value: `<@${target.discordId}>`, inline: true },
      { name: 'Type', value: sanction.type, inline: true },
      { name: 'Gravité', value: sanction.severity, inline: true },
      { name: 'Motif', value: truncate(sanction.reason, 1024) },
      { name: 'Émise par', value: `<@${actor.discordId}>`, inline: true },
      {
        name: 'Expiration',
        value: sanction.expiresAt ? formatDate(sanction.expiresAt) : 'Permanente',
        inline: true,
      },
    )
    .setFooter({ text: 'Confidentiel — usage interne' })
    .setTimestamp(sanction.createdAt);

  return embed;
}

export function buildWarningEmbed(
  warning: Warning,
  target: Member,
  actor: Member,
  totalWarnings: number,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('⚠️ Avertissement')
    .setColor(0xf39c12)
    .addFields(
      { name: 'Membre', value: `<@${target.discordId}>`, inline: true },
      { name: 'Total', value: `${totalWarnings} avertissement(s)`, inline: true },
      { name: 'Motif', value: truncate(warning.reason, 1024) },
      { name: 'Émis par', value: `<@${actor.discordId}>` },
    )
    .setTimestamp(warning.createdAt);
}

/** Fiche RH complète d'un membre : état courant, compteurs et derniers événements. */
export function buildHistoryEmbed(dossier: MemberDossier, requester: User): EmbedBuilder {
  const { member, history, warningCount, sanctionCount, promotionCount } = dossier;

  const embed = new EmbedBuilder()
    .setTitle(`📖 Dossier de ${member.displayName ?? member.username}`)
    .setColor(0x2c3e50)
    .addFields(
      { name: 'Grade', value: GRADE_LABELS[member.grade], inline: true },
      { name: 'Pôle', value: member.pole?.displayName ?? '—', inline: true },
      { name: 'Statut', value: member.status, inline: true },
      { name: 'Arrivée', value: formatDate(member.joinedAt), inline: true },
      { name: 'Promotions', value: `${promotionCount}`, inline: true },
      { name: 'Avertissements', value: `${warningCount}`, inline: true },
      { name: 'Sanctions', value: `${sanctionCount}`, inline: true },
      { name: `Derniers événements (${history.length})`, value: formatHistory(history) },
    )
    .setFooter({ text: `Consulté par ${requester.username}`, iconURL: requester.displayAvatarURL() })
    .setTimestamp();

  return embed;
}

function formatHistory(history: HistoryEntry[]): string {
  if (history.length === 0) return '_Aucun événement enregistré._';

  const lines = history.map((entry) => {
    const actor = entry.actor ? ` — par <@${entry.actor.discordId}>` : '';
    const transition =
      entry.previousValue && entry.newValue ? ` (${entry.previousValue} → ${entry.newValue})` : '';
    return `\`${formatDateTime(entry.createdAt)}\` **${entry.eventType}**${transition}${actor}`;
  });

  return truncate(lines.join('\n'), 1024);
}

/**
 * Tronque au format d'un champ d'embed Discord (limite dure à 1024 caractères,
 * 4096 pour une description) en signalant la coupure.
 */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
