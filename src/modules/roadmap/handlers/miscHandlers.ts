import { AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import {
  AbsenceType,
  DocumentCategory,
  PoleName,
  RoadmapStatus,
} from '@prisma/client';
import ChannelResolver from '@services/ChannelResolver';
import EmbedFactory from '@services/EmbedFactory';
import {
  failGracefully,
  replyError,
  resolveCommandActor,
  resolveMemberTarget,
} from '@services/InteractionContext';
import { parseDueDate } from '@utils/dateFormatter';
import {
  createRoadmapItem,
  getRoadmap,
  searchRoadmapItems,
  updateRoadmapStatus,
} from '../services/roadmapService';
import {
  CATEGORY_CHANNEL_KEYS,
  createDocument,
  getDocument,
  listDocuments,
  searchDocuments,
} from '@modules/documents/services/documentService';
import {
  declareAbsence,
  getCurrentAbsences,
  getPendingAbsences,
  reviewAbsence,
} from '@modules/absences/services/absenceService';
import { getWeeklyComparison, snapshotWeek } from '@modules/kpi/services/kpiService';
import { detectAlerts, getActiveAlerts, persistAlerts } from '@modules/alerts/services/alertService';
import {
  buildAbsenceEmbed,
  buildAbsenceListEmbed,
  buildAlertsEmbed,
  buildDocumentEmbed,
  buildDocumentListEmbed,
  buildKpiEmbed,
  buildRoadmapEmbed,
} from '@modules/objectives/embeds/objectiveEmbeds';

// ============================================================
// ROADMAP
// ============================================================

export async function handleRoadmap(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'voir') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const status = (interaction.options.getString('statut') as RoadmapStatus) ?? undefined;
      await interaction.editReply({
        embeds: [buildRoadmapEmbed(await getRoadmap(status), interaction.user)],
      });
    } catch (error) {
      await failGracefully(interaction, error, 'consultation de la roadmap');
    }
    return;
  }

  const context = await resolveCommandActor(interaction);
  if (!context) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (sub === 'ajouter') {
      const rawDate = interaction.options.getString('echeance');
      const targetDate = rawDate ? parseDueDate(rawDate) : null;

      if (rawDate && !targetDate) {
        throw new Error('Date invalide. Format attendu : `JJ/MM/AAAA`.');
      }

      const item = await createRoadmapItem({
        title: interaction.options.getString('titre', true),
        description: interaction.options.getString('description') ?? undefined,
        pole: (interaction.options.getString('pole') as PoleName) ?? undefined,
        targetDate: targetDate ?? undefined,
        actor: context.actor,
      });

      await interaction.editReply({
        embeds: [EmbedFactory.successEmbed('Roadmap mise à jour', `**${item.title}** a été ajouté.`)],
      });
      return;
    }

    if (sub === 'statut') {
      const item = await updateRoadmapStatus(
        interaction.options.getString('element', true),
        interaction.options.getString('nouveau-statut', true) as RoadmapStatus,
        context.actor,
      );

      await interaction.editReply({
        embeds: [
          EmbedFactory.successEmbed('Statut mis à jour', `**${item.title}** → **${item.status}**.`),
        ],
      });
      return;
    }

    await replyError(interaction, 'Sous-commande inconnue.');
  } catch (error) {
    await failGracefully(interaction, error, 'mise à jour de la roadmap');
  }
}

export async function handleRoadmapAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const items = await searchRoadmapItems(interaction.options.getFocused());
  await interaction.respond(
    items.map((item) => ({ name: truncateChoice(item.title), value: item.id })),
  );
}

// ============================================================
// DOCUMENTS
// ============================================================

export async function handleDocument(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  const sub = interaction.options.getSubcommand();

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (sub === 'publier') {
      const context = await resolveCommandActor(interaction);
      if (!context) return;

      const file = interaction.options.getAttachment('fichier');
      const category = interaction.options.getString('categorie', true) as DocumentCategory;

      const document = await createDocument({
        title: interaction.options.getString('titre', true),
        category,
        content: interaction.options.getString('contenu') ?? undefined,
        fileUrl: file?.url,
        author: context.actor,
      });

      const channel = await ChannelResolver.getChannel(
        interaction.guild,
        CATEGORY_CHANNEL_KEYS[category],
      );
      await channel?.send({ embeds: [buildDocumentEmbed(document)] });

      await interaction.editReply({
        embeds: [
          EmbedFactory.successEmbed(
            'Document publié',
            channel
              ? `**${document.title}** a été publié dans ${channel}.`
              : `**${document.title}** est enregistré, mais le salon de la catégorie est introuvable.`,
          ),
        ],
      });
      return;
    }

    if (sub === 'lire') {
      const document = await getDocument(interaction.options.getString('document', true));
      if (!document) throw new Error('Document introuvable.');

      await interaction.editReply({ embeds: [buildDocumentEmbed(document)] });
      return;
    }

    if (sub === 'liste') {
      const category = (interaction.options.getString('categorie') as DocumentCategory) ?? undefined;
      await interaction.editReply({
        embeds: [buildDocumentListEmbed(await listDocuments(category), interaction.user)],
      });
      return;
    }

    await replyError(interaction, 'Sous-commande inconnue.');
  } catch (error) {
    await failGracefully(interaction, error, 'gestion documentaire');
  }
}

export async function handleDocumentAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<void> {
  const documents = await searchDocuments(interaction.options.getFocused());
  await interaction.respond(
    documents.map((doc) => ({ name: truncateChoice(doc.title), value: doc.id })),
  );
}

// ============================================================
// ABSENCES
// ============================================================

export async function handleAbsence(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === 'liste') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await interaction.editReply({
        embeds: [buildAbsenceListEmbed(await getCurrentAbsences(), interaction.user)],
      });
    } catch (error) {
      await failGracefully(interaction, error, 'liste des absences');
    }
    return;
  }

  const context = await resolveCommandActor(interaction);
  if (!context) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (sub === 'declarer') {
      const start = parseDueDate(interaction.options.getString('debut', true));
      const end = parseDueDate(interaction.options.getString('fin', true));

      if (!start || !end) {
        throw new Error('Dates invalides. Format attendu : `JJ/MM/AAAA`.');
      }

      const absence = await declareAbsence({
        member: context.actor,
        type: interaction.options.getString('type', true) as AbsenceType,
        startDate: start,
        endDate: end,
        reason: interaction.options.getString('raison') ?? undefined,
      });

      const channel = await ChannelResolver.getChannel(interaction.guild, 'RH_HUB');
      await channel?.send({ embeds: [buildAbsenceEmbed(absence)] });

      await interaction.editReply({
        embeds: [
          EmbedFactory.successEmbed(
            'Absence déclarée',
            'Votre absence a été enregistrée et attend validation.',
          ),
        ],
      });
      return;
    }

    if (sub === 'valider' || sub === 'refuser') {
      const guildMember = interaction.options.getMember('membre');
      if (!guildMember || !('user' in guildMember)) {
        throw new Error('Membre introuvable.');
      }

      const target = await resolveMemberTarget(interaction, guildMember);
      if (!target) return;

      // On traite la plus ancienne demande en attente du membre visé.
      const pending = (await getPendingAbsences()).find((a) => a.memberId === target.id);
      if (!pending) {
        throw new Error(`Aucune absence en attente pour **${target.username}**.`);
      }

      const absence = await reviewAbsence(pending.id, sub === 'valider', context.actor);

      await interaction.editReply({
        embeds: [
          EmbedFactory.successEmbed(
            sub === 'valider' ? 'Absence validée' : 'Absence refusée',
            `L'absence de **${absence.member.username}** a été traitée.`,
          ),
        ],
      });
      return;
    }

    await replyError(interaction, 'Sous-commande inconnue.');
  } catch (error) {
    await failGracefully(interaction, error, 'gestion des absences');
  }
}

// ============================================================
// KPI ET ALERTES
// ============================================================

export async function handleKpi(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    // L'enregistrement est explicite : consulter les KPI ne doit pas écraser
    // l'instantané de la semaine sans que l'utilisateur l'ait demandé.
    if (interaction.options.getBoolean('enregistrer')) {
      await snapshotWeek();
    }

    await interaction.editReply({
      embeds: [buildKpiEmbed(await getWeeklyComparison(), interaction.user)],
    });
  } catch (error) {
    await failGracefully(interaction, error, 'calcul des indicateurs');
  }
}

export async function handleAlerts(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (interaction.options.getBoolean('analyser')) {
      const detected = await detectAlerts();
      await persistAlerts(detected);

      await interaction.editReply({ embeds: [buildAlertsEmbed(detected, interaction.user)] });
      return;
    }

    const active = await getActiveAlerts();
    await interaction.editReply({ embeds: [buildAlertsEmbed(active, interaction.user)] });
  } catch (error) {
    await failGracefully(interaction, error, 'analyse des alertes');
  }
}

function truncateChoice(text: string): string {
  return text.length <= 100 ? text : `${text.slice(0, 97)}...`;
}
