import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  User,
} from 'discord.js';
import { AnnouncementPriority, PoleName } from '@prisma/client';
import { POLES_CONFIG } from '@config/poles.config';
import EmbedFactory from '@services/EmbedFactory';
import { AnnouncementWithRelations } from '../services/announcementService';
import { BroadcastReport } from '../services/broadcastService';

/** Valeur réservée du select menu désignant l'ensemble des pôles. */
export const ALL_POLES_VALUE = '__ALL__';

const PRIORITY_PREFIX: Record<AnnouncementPriority, string> = {
  [AnnouncementPriority.INFO]: '📢',
  [AnnouncementPriority.IMPORTANTE]: '⚠️',
  [AnnouncementPriority.URGENTE]: '🚨',
};

/**
 * Embed diffusé dans les salons des pôles.
 *
 * Volontairement identique quel que soit le pôle destinataire : une annonce doit
 * être reconnaissable d'un salon à l'autre.
 */
export function buildAnnouncementEmbed(announcement: AnnouncementWithRelations): EmbedBuilder {
  const poles = announcement.targets.map((t) => t.pole.displayName).join(', ');

  return new EmbedBuilder()
    .setTitle(`${PRIORITY_PREFIX[announcement.priority]} ${announcement.title}`)
    .setDescription(truncate(announcement.content, 4096))
    .setColor(EmbedFactory.getAnnouncementPriorityColor(announcement.priority))
    .addFields(
      {
        name: 'Priorité',
        value: EmbedFactory.getAnnouncementPriorityLabel(announcement.priority),
        inline: true,
      },
      { name: 'Pôles concernés', value: truncate(poles, 1024), inline: true },
    )
    .setFooter({ text: `Publié par ${announcement.author.username}` })
    .setTimestamp(announcement.createdAt);
}

/** Select menu de choix des pôles, avec l'option « Tous les pôles ». */
export function buildPoleSelectMenu(draftId: string): ActionRowBuilder<StringSelectMenuBuilder> {
  const poleOptions = Object.values(POLES_CONFIG).map((pole) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(pole.displayName)
      .setValue(pole.name)
      .setEmoji(pole.emoji)
      .setDescription(pole.description),
  );

  const options = [
    new StringSelectMenuOptionBuilder()
      .setLabel('Tous les pôles')
      .setValue(ALL_POLES_VALUE)
      .setEmoji('🌐')
      .setDescription("Diffuser à l'ensemble de l'organisation"),
    ...poleOptions,
  ];

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`annonceselect:poles:${draftId}`)
      .setPlaceholder('Choisir les pôles destinataires')
      .setMinValues(1)
      .setMaxValues(options.length)
      .addOptions(options),
  );
}

/** Rapport de diffusion renvoyé à l'auteur, en éphémère. */
export function buildBroadcastReportEmbed(
  announcement: AnnouncementWithRelations,
  report: BroadcastReport,
  author: User,
): EmbedBuilder {
  const complete = report.failedCount === 0;

  const embed = new EmbedBuilder()
    .setTitle(complete ? '✅ Annonce diffusée' : '⚠️ Diffusion partielle')
    .setColor(complete ? 0x27ae60 : 0xf39c12)
    .setDescription(`**${announcement.title}**`)
    .addFields({
      name: 'Résultat',
      value: `${report.deliveredCount} pôle(s) sur ${report.results.length}`,
    })
    .setFooter({ text: `Publié par ${author.username}`, iconURL: author.displayAvatarURL() })
    .setTimestamp();

  const failures = report.results.filter((r) => !r.delivered);

  if (failures.length > 0) {
    embed.addFields({
      name: 'Pôles non atteints',
      value: truncate(
        failures.map((f) => `• **${f.poleDisplayName}** — ${f.error ?? 'raison inconnue'}`).join('\n'),
        1024,
      ),
    });
  }

  return embed;
}

/** Aperçu présenté à l'auteur avant diffusion. */
export function buildPreviewEmbed(
  title: string,
  content: string,
  priority: AnnouncementPriority,
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${PRIORITY_PREFIX[priority]} ${title}`)
    .setDescription(truncate(content, 4096))
    .setColor(EmbedFactory.getAnnouncementPriorityColor(priority))
    .setFooter({ text: 'Aperçu — choisissez les pôles destinataires ci-dessous' });
}

/** Résout la sélection du menu en liste de pôles concrète. */
export function resolveSelectedPoles(values: string[]): PoleName[] {
  if (values.includes(ALL_POLES_VALUE)) {
    return Object.values(POLES_CONFIG).map((pole) => pole.name);
  }
  return values as PoleName[];
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
