import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import {
  AbsenceStatus,
  ApplicationStatus,
  ExpenseStatus,
  ObjectiveStatus,
  PoleName,
  ProjectStatus,
  TaskStatus,
} from '@prisma/client';
import prisma from '@database/prisma';
import { POLES_CONFIG } from '@config/poles.config';
import { formatDate } from '@utils/dateFormatter';
import { PanelContext, PanelDefinition, PanelRender, panelMarker } from './types';

/** Identifiants des panneaux — utilisés dans les clés et les `customId`. */
export const PanelId = {
  POLE: 'pole',
  DIRECTION: 'direction',
  RH: 'rh',
  GENERAL: 'general',
  DOCUMENTS: 'documents',
} as const;

const LIST_LIMIT = 5;

/** Panneau d'un pôle : projets, tâches, objectifs, annonces. */
const polePanel: PanelDefinition = {
  id: PanelId.POLE,
  channelKey: 'HUB',
  perPole: true,
  async render({ pole }: PanelContext): Promise<PanelRender> {
    const config = pole ? POLES_CONFIG[pole] : null;
    const record = pole ? await prisma.pole.findUnique({ where: { name: pole } }) : null;

    const [projects, tasks, objectives, recentProjects] = await Promise.all([
      prisma.project.count({
        where: { poleId: record?.id, status: { notIn: [ProjectStatus.ARCHIVE, ProjectStatus.TERMINE] } },
      }),
      prisma.task.count({
        where: { project: { poleId: record?.id }, status: { not: TaskStatus.TERMINE } },
      }),
      prisma.objective.count({ where: { poleId: record?.id, status: ObjectiveStatus.EN_COURS } }),
      prisma.project.findMany({
        where: { poleId: record?.id, status: { not: ProjectStatus.ARCHIVE } },
        orderBy: { updatedAt: 'desc' },
        take: LIST_LIMIT,
      }),
    ]);

    const overdue = await prisma.task.count({
      where: {
        project: { poleId: record?.id },
        status: { not: TaskStatus.TERMINE },
        dueDate: { lt: new Date() },
      },
    });

    const embed = new EmbedBuilder()
      .setTitle(`${config?.emoji ?? '📁'} Pôle ${config?.displayName ?? '—'}`)
      .setColor(parseColor(config?.color))
      .setDescription(config?.description ?? 'Panneau du pôle')
      .addFields(
        { name: 'Projets actifs', value: `**${projects}**`, inline: true },
        { name: 'Tâches ouvertes', value: `**${tasks}**`, inline: true },
        { name: 'Objectifs', value: `**${objectives}**`, inline: true },
      );

    if (overdue > 0) {
      embed.addFields({ name: '⏰ En retard', value: `**${overdue}** tâche(s) ont dépassé leur échéance` });
    }

    if (recentProjects.length > 0) {
      embed.addFields({
        name: 'Projets récents',
        value: recentProjects.map((p) => `• **${p.title}** — ${p.status}`).join('\n'),
      });
    }

    embed.setFooter({ text: panelMarker(PanelId.POLE, pole) }).setTimestamp();

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button(`panel:pole:project:${pole}`, 'Nouveau projet', '📁', ButtonStyle.Primary),
          button(`panel:pole:task:${pole}`, 'Nouvelle tâche', '📋', ButtonStyle.Primary),
          button(`panel:pole:objective:${pole}`, 'Nouvel objectif', '🎯', ButtonStyle.Secondary),
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button(`panel:pole:announce:${pole}`, 'Annonce', '📢', ButtonStyle.Secondary),
          button(`panel:pole:list:${pole}`, 'Voir les projets', '🔍', ButtonStyle.Secondary),
          button(`panel:pole:mytasks:${pole}`, 'Mes tâches', '🙋', ButtonStyle.Success),
        ),
      ],
    };
  },
};

/** Panneau de direction : pilotage, dépenses, décisions. */
const directionPanel: PanelDefinition = {
  id: PanelId.DIRECTION,
  channelKey: 'DIRECTION_HUB',
  perPole: false,
  async render(): Promise<PanelRender> {
    const [pendingExpenses, pendingDecisions, activeProjects, openTasks] = await Promise.all([
      prisma.expense.count({
        where: { status: { in: [ExpenseStatus.SOUMISE, ExpenseStatus.VALIDEE_RESPONSABLE] } },
      }),
      prisma.decision.count({ where: { status: 'PROPOSEE' } }),
      prisma.project.count({ where: { status: { not: ProjectStatus.ARCHIVE } } }),
      prisma.task.count({ where: { status: { not: TaskStatus.TERMINE } } }),
    ]);

    const embed = new EmbedBuilder()
      .setTitle('📋 Direction')
      .setColor(pendingExpenses + pendingDecisions > 0 ? 0xf39c12 : 0x3f51b5)
      .setDescription('Pilotage de l\'organisation')
      .addFields(
        { name: 'Projets actifs', value: `**${activeProjects}**`, inline: true },
        { name: 'Tâches ouvertes', value: `**${openTasks}**`, inline: true },
        { name: '💶 Dépenses à valider', value: `**${pendingExpenses}**`, inline: true },
        { name: '💡 Décisions à arbitrer', value: `**${pendingDecisions}**`, inline: true },
      )
      .setFooter({ text: panelMarker(PanelId.DIRECTION, null) })
      .setTimestamp();

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button('panel:direction:dashboard', 'Tableau de bord', '📊', ButtonStyle.Primary),
          button('panel:direction:kpi', 'Indicateurs', '📈', ButtonStyle.Secondary),
          button('panel:direction:alerts', 'Alertes', '🚨', ButtonStyle.Secondary),
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button('panel:direction:expense', 'Soumettre une dépense', '💶', ButtonStyle.Success),
          button('panel:direction:decision', 'Proposer une décision', '💡', ButtonStyle.Success),
        ),
      ],
    };
  },
};

/** Panneau RH : candidatures, absences, dossiers. */
const rhPanel: PanelDefinition = {
  id: PanelId.RH,
  channelKey: 'RH_HUB',
  perPole: false,
  async render(): Promise<PanelRender> {
    const [pendingApplications, currentAbsences, pendingAbsences, memberCount] = await Promise.all([
      prisma.recruitmentApplication.count({ where: { status: ApplicationStatus.EN_ATTENTE } }),
      prisma.absence.count({
        where: {
          status: AbsenceStatus.VALIDEE,
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
      }),
      prisma.absence.count({ where: { status: AbsenceStatus.DEMANDEE } }),
      prisma.member.count({ where: { status: { not: 'PARTI' } } }),
    ]);

    const embed = new EmbedBuilder()
      .setTitle('🧑‍💼 Ressources humaines')
      .setColor(pendingApplications + pendingAbsences > 0 ? 0xf39c12 : 0x16a085)
      .addFields(
        { name: 'Effectif', value: `**${memberCount}** membre(s)`, inline: true },
        { name: '📋 Candidatures', value: `**${pendingApplications}** en attente`, inline: true },
        { name: '🌴 Absents', value: `**${currentAbsences}** aujourd'hui`, inline: true },
      );

    if (pendingAbsences > 0) {
      embed.addFields({ name: '⏳ À traiter', value: `**${pendingAbsences}** demande(s) d'absence` });
    }

    embed.setFooter({ text: panelMarker(PanelId.RH, null) }).setTimestamp();

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button('panel:rh:apply', 'Candidater', '📋', ButtonStyle.Primary),
          button('panel:rh:absence', 'Déclarer une absence', '🌴', ButtonStyle.Primary),
          button('panel:rh:mydossier', 'Mon dossier', '📖', ButtonStyle.Secondary),
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button('panel:rh:applications', 'Candidatures', '🔍', ButtonStyle.Secondary),
          button('panel:rh:absences', 'Absences en cours', '📅', ButtonStyle.Secondary),
        ),
      ],
    };
  },
};

/** Panneau général : annonces, réunions, objectifs transverses. */
const generalPanel: PanelDefinition = {
  id: PanelId.GENERAL,
  channelKey: 'GENERAL_HUB',
  perPole: false,
  async render(): Promise<PanelRender> {
    const [upcomingMeetings, announcements, objectives] = await Promise.all([
      prisma.meeting.findMany({
        where: { status: 'PLANIFIEE', scheduledAt: { gte: new Date() } },
        orderBy: { scheduledAt: 'asc' },
        take: 3,
      }),
      prisma.announcement.count({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.objective.count({ where: { status: ObjectiveStatus.EN_COURS, poleId: null } }),
    ]);

    const embed = new EmbedBuilder()
      .setTitle('📢 Général')
      .setColor(0x2c3e50)
      .setDescription("Communications et coordination de l'équipe")
      .addFields(
        { name: 'Annonces (7 j)', value: `**${announcements}**`, inline: true },
        { name: 'Objectifs généraux', value: `**${objectives}**`, inline: true },
        { name: 'Réunions à venir', value: `**${upcomingMeetings.length}**`, inline: true },
      );

    if (upcomingMeetings.length > 0) {
      embed.addFields({
        name: 'Prochaines réunions',
        value: upcomingMeetings
          .map((m) => `• **${m.title}** — ${formatDate(m.scheduledAt)}`)
          .join('\n'),
      });
    }

    embed.setFooter({ text: panelMarker(PanelId.GENERAL, null) }).setTimestamp();

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button('panel:general:announce', 'Publier une annonce', '📢', ButtonStyle.Primary),
          button('panel:general:meeting', 'Planifier une réunion', '📅', ButtonStyle.Primary),
          button('panel:general:objective', 'Objectif général', '🎯', ButtonStyle.Secondary),
        ),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button('panel:general:meetings', 'Voir les réunions', '🔍', ButtonStyle.Secondary),
          button('panel:general:roadmap', 'Roadmap', '🗺️', ButtonStyle.Secondary),
        ),
      ],
    };
  },
};

/** Panneau documentaire. */
const documentsPanel: PanelDefinition = {
  id: PanelId.DOCUMENTS,
  channelKey: 'DOCUMENTS_HUB',
  perPole: false,
  async render(): Promise<PanelRender> {
    const documents = await prisma.document.groupBy({
      by: ['category'],
      _count: { _all: true },
    });

    const total = documents.reduce((sum, row) => sum + row._count._all, 0);

    const embed = new EmbedBuilder()
      .setTitle('📚 Bibliothèque documentaire')
      .setColor(0x34495e)
      .setDescription('Procédures, guides, tutoriels et cahiers des charges')
      .addFields({
        name: `Documents (${total})`,
        value:
          documents.length > 0
            ? documents.map((d) => `• ${d.category} — **${d._count._all}**`).join('\n')
            : '_Aucun document publié._',
      })
      .setFooter({ text: panelMarker(PanelId.DOCUMENTS, null) })
      .setTimestamp();

    return {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          button('panel:documents:publish', 'Publier', '📝', ButtonStyle.Primary),
          button('panel:documents:browse', 'Consulter', '🔍', ButtonStyle.Secondary),
        ),
      ],
    };
  },
};

export const PANEL_DEFINITIONS: PanelDefinition[] = [
  polePanel,
  directionPanel,
  rhPanel,
  generalPanel,
  documentsPanel,
];

export function getPanelDefinition(id: string): PanelDefinition | undefined {
  return PANEL_DEFINITIONS.find((definition) => definition.id === id);
}

function button(
  customId: string,
  label: string,
  emoji: string,
  style: ButtonStyle,
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(style);
}

/** Convertit une couleur hexadécimale de config en entier Discord. */
function parseColor(hex?: string): number {
  if (!hex) return 0x2c3e50;
  return Number.parseInt(hex.replace('#', ''), 16) || 0x2c3e50;
}
