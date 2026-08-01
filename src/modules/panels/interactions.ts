import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  AbsenceType,
  AnnouncementPriority,
  ApplicationType,
  ObjectiveScope,
  PoleName,
  Priority,
} from '@prisma/client';
import EmbedFactory from '@services/EmbedFactory';
import ChannelResolver from '@services/ChannelResolver';
import { enforce, failGracefully, resolveActor } from '@services/InteractionContext';
import { ButtonHandler, ModalHandler } from '@apptypes/command.types';
import { parseDueDate, parseDateTime } from '@utils/dateFormatter';
import { createProject, getProject } from '@modules/projects/services/projectService';
import { buildProjectEmbed, buildProjectButtons } from '@modules/projects/embeds/projectEmbeds';
import { canCreateProject } from '@modules/projects/permissions';
import { createTask } from '@modules/tasks/services/taskService';
import { buildTaskEmbed, buildTaskButtons } from '@modules/tasks/embeds/taskEmbeds';
import { canCreateTask } from '@modules/tasks/permissions';
import { createObjective } from '@modules/objectives/services/objectiveService';
import { buildObjectiveEmbed } from '@modules/objectives/embeds/objectiveEmbeds';
import { createApplication } from '@modules/rh/services/applicationService';
import { buildApplicationEmbed, buildApplicationButtons } from '@modules/rh/embeds/rhEmbeds';
import { declareAbsence } from '@modules/absences/services/absenceService';
import { buildAbsenceEmbed } from '@modules/objectives/embeds/objectiveEmbeds';
import { createExpense } from '@modules/expenses/services/expenseService';
import { buildExpenseEmbed, buildExpenseButtons } from '@modules/expenses/embeds/expenseEmbeds';
import { createDecision } from '@modules/decisions/services/decisionService';
import { buildDecisionEmbed, buildDecisionButtons } from '@modules/meetings/embeds/meetingEmbeds';
import { createMeeting } from '@modules/meetings/services/meetingService';
import { buildMeetingEmbed, buildMeetingButtons } from '@modules/meetings/embeds/meetingEmbeds';
import { schedulePanelRefresh } from './services/panelRefreshService';
import { PanelId } from './registry';

/**
 * Boutons des panneaux : `panel:<panneau>:<action>[:<pole>]`.
 *
 * Discord ne permet pas de masquer un bouton par utilisateur sur un message
 * partagé : les boutons sont donc visibles de tous et le contrôle de permission
 * se fait à l'exécution, via les règles métier déjà écrites.
 */
export const panelButtons: ButtonHandler = {
  customIdPrefix: 'panel',
  async execute(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return;

    const [, panel, action, poleRaw] = interaction.customId.split(':');
    const pole = (poleRaw as PoleName) ?? null;

    try {
      // Les actions de saisie ouvrent un modal ; celles de consultation
      // répondent directement en éphémère.
      const modal = buildModalFor(panel, action, pole);

      if (modal) {
        await interaction.showModal(modal);
        return;
      }

      await handleReadAction(interaction, panel, action, pole);
    } catch (error) {
      await failGracefully(interaction, error, `panneau ${panel}/${action}`);
    }
  },
};

/** Soumissions de modal : `panelmodal:<panneau>:<action>[:<pole>]`. */
export const panelModals: ModalHandler = {
  customIdPrefix: 'panelmodal',
  async execute(interaction: ModalSubmitInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return;

    const [, panel, action, poleRaw] = interaction.customId.split(':');
    const pole = (poleRaw as PoleName) ?? null;

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const field = (id: string): string => interaction.fields.getTextInputValue(id).trim();
      const optional = (id: string): string | undefined => {
        try {
          return field(id) || undefined;
        } catch {
          return undefined;
        }
      };

      switch (`${panel}:${action}`) {
        case 'pole:project': {
          if (!(await enforce(interaction, canCreateProject(context.actorGrade)))) return;

          const project = await createProject({
            title: field('title'),
            description: field('description'),
            manager: context.actor,
            priority: parsePriority(optional('priority')),
            pole: pole ?? undefined,
            dueDate: parseOptionalDate(optional('due')),
          });

          await postCard(interaction, pole, {
            embeds: [buildProjectEmbed(project)],
            components: buildProjectButtons(project),
          });

          await confirm(interaction, 'Projet créé', `**${project.title}** a été publié.`);
          break;
        }

        case 'pole:task': {
          if (!(await enforce(interaction, canCreateTask(context.actorGrade)))) return;

          // Une tâche créée depuis le panneau d'un pôle est rattachée au projet
          // le plus récemment mis à jour de ce pôle, s'il en existe un.
          const projectId = await findRecentProjectId(pole);

          const task = await createTask({
            title: field('title'),
            description: optional('description'),
            creator: context.actor,
            priority: parsePriority(optional('priority')),
            projectId,
            dueDate: parseOptionalDate(optional('due')),
          });

          await postCard(interaction, pole, {
            embeds: [buildTaskEmbed(task)],
            components: buildTaskButtons(task),
          });

          await confirm(interaction, 'Tâche créée', `**${task.title}** a été publiée.`);
          break;
        }

        case 'pole:objective':
        case 'general:objective': {
          const endDate = parseDueDate(field('due'));
          if (!endDate) throw new Error('Date invalide. Format attendu : `JJ/MM/AAAA`.');

          const objective = await createObjective({
            title: field('title'),
            description: optional('description'),
            scope: pole ? ObjectiveScope.POLE : ObjectiveScope.HEBDOMADAIRE,
            pole: pole ?? undefined,
            startDate: new Date(),
            endDate,
            actor: context.actor,
          });

          await postCard(interaction, pole, { embeds: [buildObjectiveEmbed(objective)] });
          await confirm(interaction, 'Objectif défini', `**${objective.title}** a été publié.`);
          break;
        }

        case 'pole:announce':
        case 'general:announce': {
          const { createAnnouncement } = await import(
            '@modules/announcements/services/announcementService'
          );
          const { broadcastAnnouncement } = await import(
            '@modules/announcements/services/broadcastService'
          );
          const { buildAnnouncementEmbed } = await import(
            '@modules/announcements/embeds/announcementEmbeds'
          );

          // Depuis un pôle, l'annonce cible ce pôle ; depuis le général, tous.
          const targets = pole ? [pole] : (Object.values(PoleName) as PoleName[]);

          const announcement = await createAnnouncement({
            title: field('title'),
            content: field('content'),
            priority: AnnouncementPriority.INFO,
            author: context.actor,
            poles: targets,
          });

          const report = await broadcastAnnouncement(
            interaction.guild,
            announcement,
            buildAnnouncementEmbed(announcement),
          );

          await confirm(
            interaction,
            'Annonce publiée',
            `Diffusée dans **${report.deliveredCount}** pôle(s) sur ${report.results.length}.`,
          );
          break;
        }

        case 'rh:apply': {
          const application = await createApplication({
            type: ApplicationType.CANDIDATURE_INTERNE,
            candidateDiscordId: interaction.user.id,
            candidatePseudo: interaction.user.username,
            candidateId: context.actor.id,
            motivation: field('motivation'),
            targetPole: parsePoleName(optional('pole')),
          });

          const channel = await ChannelResolver.getChannel(interaction.guild, 'RH_HUB');
          await channel?.send({
            embeds: [buildApplicationEmbed(application)],
            components: [buildApplicationButtons(application.id)],
          });

          await confirm(interaction, 'Candidature transmise', 'Vous serez notifié de la décision.');
          break;
        }

        case 'rh:absence': {
          const start = parseDueDate(field('start'));
          const end = parseDueDate(field('end'));
          if (!start || !end) throw new Error('Dates invalides. Format attendu : `JJ/MM/AAAA`.');

          const absence = await declareAbsence({
            member: context.actor,
            type: AbsenceType.CONGE,
            startDate: start,
            endDate: end,
            reason: optional('reason'),
          });

          const channel = await ChannelResolver.getChannel(interaction.guild, 'RH_HUB');
          await channel?.send({ embeds: [buildAbsenceEmbed(absence)] });

          await confirm(interaction, 'Absence déclarée', 'Votre demande attend validation.');
          break;
        }

        case 'direction:expense': {
          const amount = Number(field('amount').replace(',', '.'));
          if (!Number.isFinite(amount) || amount <= 0) {
            throw new Error('Montant invalide. Saisissez un nombre positif (ex. 149,90).');
          }

          const expense = await createExpense({
            title: field('title'),
            amount,
            description: optional('details'),
            submitter: context.actor,
          });

          const channel = await ChannelResolver.getChannel(interaction.guild, 'DIRECTION_HUB');
          await channel?.send({
            embeds: [buildExpenseEmbed(expense)],
            components: buildExpenseButtons(expense),
          });

          await confirm(interaction, 'Dépense soumise', `**${expense.title}** attend validation.`);
          break;
        }

        case 'direction:decision': {
          const decision = await createDecision({
            title: field('title'),
            description: field('description'),
            proposer: context.actor,
          });

          const channel = await ChannelResolver.getChannel(interaction.guild, 'DIRECTION_HUB');
          await channel?.send({
            embeds: [buildDecisionEmbed(decision)],
            components: buildDecisionButtons(decision),
          });

          await confirm(interaction, 'Décision proposée', `**${decision.title}** attend arbitrage.`);
          break;
        }

        case 'general:meeting': {
          const scheduledAt = parseDateTime(field('date'));
          if (!scheduledAt) {
            throw new Error('Date invalide. Format attendu : `JJ/MM/AAAA HH:MM`.');
          }

          const meeting = await createMeeting({
            title: field('title'),
            agenda: optional('agenda'),
            scheduledAt,
            organizer: context.actor,
          });

          const channel = await ChannelResolver.getChannel(interaction.guild, 'GENERAL_HUB');
          await channel?.send({
            embeds: [buildMeetingEmbed(meeting)],
            components: buildMeetingButtons(meeting),
          });

          await confirm(interaction, 'Réunion planifiée', `**${meeting.title}** a été publiée.`);
          break;
        }

        case 'documents:publish': {
          const { createDocument } = await import('@modules/documents/services/documentService');
          const { buildDocumentEmbed } = await import('@modules/objectives/embeds/objectiveEmbeds');
          const { DocumentCategory } = await import('@prisma/client');

          const document = await createDocument({
            title: field('title'),
            category: DocumentCategory.PROCEDURE,
            content: field('content'),
            author: context.actor,
          });

          const channel = await ChannelResolver.getChannel(interaction.guild, 'DOCUMENTS_HUB');
          await channel?.send({ embeds: [buildDocumentEmbed(document)] });

          await confirm(interaction, 'Document publié', `**${document.title}** est consultable.`);
          break;
        }

        default:
          throw new Error(`Action de panneau inconnue : ${panel}/${action}`);
      }

      schedulePanelRefresh(interaction.guild, panel, pole);
    } catch (error) {
      await failGracefully(interaction, error, `panneau ${panel}/${action}`);
    }
  },
};

/** Construit le modal correspondant à une action de saisie, ou `null`. */
function buildModalFor(panel: string, action: string, pole: PoleName | null): ModalBuilder | null {
  const id = `panelmodal:${panel}:${action}${pole ? `:${pole}` : ''}`;

  switch (`${panel}:${action}`) {
    case 'pole:project':
      return modal(id, 'Nouveau projet', [
        input('title', 'Titre', TextInputStyle.Short, true, 100),
        input('description', 'Description', TextInputStyle.Paragraph, true, 2000),
        input('priority', 'Priorité (BASSE/NORMALE/HAUTE/CRITIQUE)', TextInputStyle.Short, false, 20),
        input('due', 'Échéance (JJ/MM/AAAA)', TextInputStyle.Short, false, 10),
      ]);

    case 'pole:task':
      return modal(id, 'Nouvelle tâche', [
        input('title', 'Titre', TextInputStyle.Short, true, 100),
        input('description', 'Description', TextInputStyle.Paragraph, false, 2000),
        input('priority', 'Priorité (BASSE/NORMALE/HAUTE/CRITIQUE)', TextInputStyle.Short, false, 20),
        input('due', 'Échéance (JJ/MM/AAAA)', TextInputStyle.Short, false, 10),
      ]);

    case 'pole:objective':
    case 'general:objective':
      return modal(id, 'Nouvel objectif', [
        input('title', 'Intitulé', TextInputStyle.Short, true, 150),
        input('description', 'Description', TextInputStyle.Paragraph, false, 2000),
        input('due', 'Échéance (JJ/MM/AAAA)', TextInputStyle.Short, true, 10),
      ]);

    case 'pole:announce':
    case 'general:announce':
      return modal(id, 'Publier une annonce', [
        input('title', 'Titre', TextInputStyle.Short, true, 200),
        input('content', 'Contenu', TextInputStyle.Paragraph, true, 3000),
      ]);

    case 'rh:apply':
      return modal(id, 'Candidature interne', [
        input('pole', 'Pôle visé (WEB, TECHNIQUE, MARKETING…)', TextInputStyle.Short, true, 30),
        input('motivation', 'Motivation', TextInputStyle.Paragraph, true, 1000),
      ]);

    case 'rh:absence':
      return modal(id, 'Déclarer une absence', [
        input('start', 'Début (JJ/MM/AAAA)', TextInputStyle.Short, true, 10),
        input('end', 'Fin (JJ/MM/AAAA)', TextInputStyle.Short, true, 10),
        input('reason', 'Motif', TextInputStyle.Paragraph, false, 500),
      ]);

    case 'direction:expense':
      return modal(id, 'Soumettre une dépense', [
        input('title', 'Objet de la dépense', TextInputStyle.Short, true, 150),
        input('amount', 'Montant en euros (ex. 149,90)', TextInputStyle.Short, true, 12),
        input('details', 'Précisions', TextInputStyle.Paragraph, false, 2000),
      ]);

    case 'direction:decision':
      return modal(id, 'Proposer une décision', [
        input('title', 'Intitulé', TextInputStyle.Short, true, 150),
        input('description', 'Détail et justification', TextInputStyle.Paragraph, true, 2000),
      ]);

    case 'general:meeting':
      return modal(id, 'Planifier une réunion', [
        input('title', 'Objet', TextInputStyle.Short, true, 150),
        input('date', 'Date et heure (JJ/MM/AAAA HH:MM)', TextInputStyle.Short, true, 20),
        input('agenda', 'Ordre du jour', TextInputStyle.Paragraph, false, 2000),
      ]);

    case 'documents:publish':
      return modal(id, 'Publier un document', [
        input('title', 'Titre', TextInputStyle.Short, true, 150),
        input('content', 'Contenu', TextInputStyle.Paragraph, true, 3000),
      ]);

    default:
      return null;
  }
}

/** Actions de consultation : réponse éphémère, sans saisie. */
async function handleReadAction(
  interaction: ButtonInteraction<'cached'>,
  panel: string,
  action: string,
  pole: PoleName | null,
): Promise<void> {
  const context = await resolveActor(interaction, interaction.member);
  if (!context) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  switch (`${panel}:${action}`) {
    case 'direction:dashboard': {
      const { getDashboardData } = await import('@modules/dashboard/services/dashboardService');
      const { buildDashboardEmbed } = await import('@modules/dashboard/embeds/dashboardEmbeds');

      await interaction.editReply({
        embeds: [buildDashboardEmbed(await getDashboardData(), interaction.user)],
      });
      return;
    }

    case 'direction:kpi': {
      const { getWeeklyComparison } = await import('@modules/kpi/services/kpiService');
      const { buildKpiEmbed } = await import('@modules/objectives/embeds/objectiveEmbeds');

      await interaction.editReply({
        embeds: [buildKpiEmbed(await getWeeklyComparison(), interaction.user)],
      });
      return;
    }

    case 'direction:alerts': {
      const { detectAlerts } = await import('@modules/alerts/services/alertService');
      const { buildAlertsEmbed } = await import('@modules/objectives/embeds/objectiveEmbeds');

      await interaction.editReply({
        embeds: [buildAlertsEmbed(await detectAlerts(), interaction.user)],
      });
      return;
    }

    case 'pole:list': {
      const { searchProjects } = await import('@modules/projects/services/projectService');
      const projects = await searchProjects('');

      await interaction.editReply({
        embeds: [
          EmbedFactory.infoEmbed(
            'Projets',
            projects.length > 0
              ? projects.map((p) => `• **${p.title}** — ${p.status}`).join('\n')
              : '_Aucun projet actif._',
          ),
        ],
      });
      return;
    }

    case 'pole:mytasks': {
      const { getMemberTasks } = await import('@modules/tasks/services/taskService');
      const tasks = await getMemberTasks(context.actor.id);

      await interaction.editReply({
        embeds: [
          EmbedFactory.infoEmbed(
            'Mes tâches',
            tasks.length > 0
              ? tasks.map((t) => `• **${t.title}** — ${t.status}`).join('\n')
              : '_Aucune tâche assignée._',
          ),
        ],
      });
      return;
    }

    case 'rh:mydossier': {
      const { getMemberDossier } = await import('@modules/rh/services/memberHistoryService');
      const { buildHistoryEmbed } = await import('@modules/rh/embeds/rhEmbeds');

      const dossier = await getMemberDossier(context.actor.id);

      await interaction.editReply({
        embeds: dossier
          ? [buildHistoryEmbed(dossier, interaction.user)]
          : [EmbedFactory.infoEmbed('Aucun dossier', 'Votre dossier RH est vide.')],
      });
      return;
    }

    case 'rh:applications': {
      const { default: prisma } = await import('@database/prisma');
      const applications = await prisma.recruitmentApplication.findMany({
        where: { status: 'EN_ATTENTE' },
        take: 10,
      });

      await interaction.editReply({
        embeds: [
          EmbedFactory.infoEmbed(
            'Candidatures en attente',
            applications.length > 0
              ? applications.map((a) => `• **${a.candidatePseudo}**`).join('\n')
              : '_Aucune candidature en attente._',
          ),
        ],
      });
      return;
    }

    case 'rh:absences': {
      const { getCurrentAbsences } = await import('@modules/absences/services/absenceService');
      const { buildAbsenceListEmbed } = await import('@modules/objectives/embeds/objectiveEmbeds');

      await interaction.editReply({
        embeds: [buildAbsenceListEmbed(await getCurrentAbsences(), interaction.user)],
      });
      return;
    }

    case 'general:meetings': {
      const { getUpcomingMeetings } = await import('@modules/meetings/services/meetingService');
      const meetings = await getUpcomingMeetings(5);

      await interaction.editReply({
        embeds:
          meetings.length > 0
            ? meetings.map(buildMeetingEmbed)
            : [EmbedFactory.infoEmbed('Aucune réunion', 'Aucune réunion planifiée.')],
      });
      return;
    }

    case 'general:roadmap': {
      const { getRoadmap } = await import('@modules/roadmap/services/roadmapService');
      const { buildRoadmapEmbed } = await import('@modules/objectives/embeds/objectiveEmbeds');

      await interaction.editReply({
        embeds: [buildRoadmapEmbed(await getRoadmap(), interaction.user)],
      });
      return;
    }

    case 'documents:browse': {
      const { listDocuments } = await import('@modules/documents/services/documentService');
      const { buildDocumentListEmbed } = await import('@modules/objectives/embeds/objectiveEmbeds');

      await interaction.editReply({
        embeds: [buildDocumentListEmbed(await listDocuments(), interaction.user)],
      });
      return;
    }

    default:
      await interaction.editReply({
        embeds: [EmbedFactory.errorEmbed('Action inconnue', `Aucune action « ${action} ».`)],
      });
  }
}

/** Publie la fiche créée dans le salon du panneau. */
async function postCard(
  interaction: ModalSubmitInteraction<'cached'>,
  pole: PoleName | null,
  payload: { embeds: unknown[]; components?: unknown[] },
): Promise<void> {
  const channel = pole
    ? await ChannelResolver.getPoleChannel(interaction.guild, pole, 'HUB')
    : await ChannelResolver.getChannel(interaction.guild, 'GENERAL_HUB');

  await channel?.send(payload as Parameters<NonNullable<typeof channel>['send']>[0]);
}

async function confirm(
  interaction: ModalSubmitInteraction,
  title: string,
  description: string,
): Promise<void> {
  await interaction.editReply({ embeds: [EmbedFactory.successEmbed(title, description)] });
}

/** Le projet le plus récemment actif du pôle, pour y rattacher une tâche. */
async function findRecentProjectId(pole: PoleName | null): Promise<string | undefined> {
  if (!pole) return undefined;

  const { default: prisma } = await import('@database/prisma');
  const record = await prisma.pole.findUnique({ where: { name: pole } });
  if (!record) return undefined;

  const project = await prisma.project.findFirst({
    where: { poleId: record.id, status: { notIn: ['ARCHIVE', 'TERMINE'] } },
    orderBy: { updatedAt: 'desc' },
  });

  return project?.id;
}

/** Priorité saisie librement : tolère la casse et retombe sur NORMALE. */
function parsePriority(raw?: string): Priority {
  const value = raw?.toUpperCase();
  return value && value in Priority ? (value as Priority) : Priority.NORMALE;
}

function parsePoleName(raw?: string): PoleName | undefined {
  const value = raw?.toUpperCase().replace(/[\s-]/g, '_');
  return value && value in PoleName ? (value as PoleName) : undefined;
}

function parseOptionalDate(raw?: string): Date | undefined {
  if (!raw) return undefined;

  const parsed = parseDueDate(raw);
  if (!parsed) throw new Error('Date invalide. Format attendu : `JJ/MM/AAAA`.');

  return parsed;
}

function modal(id: string, title: string, inputs: TextInputBuilder[]): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle(title)
    .addComponents(
      ...inputs.map((field) =>
        new ActionRowBuilder<TextInputBuilder>().addComponents(field),
      ),
    );
}

function input(
  id: string,
  label: string,
  style: TextInputStyle,
  required: boolean,
  maxLength: number,
): TextInputBuilder {
  return new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(maxLength);
}
