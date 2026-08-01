import cron, { ScheduledTask } from 'node-cron';
import { Client } from 'discord.js';
import ChannelResolver from '@services/ChannelResolver';
import { env } from '@config/env';
import logger from '@core/Logger';
import { detectAlerts, persistAlerts } from '@modules/alerts/services/alertService';
import { snapshotWeek } from '@modules/kpi/services/kpiService';
import { closeExpiredAbsences } from '@modules/absences/services/absenceService';
import {
  cancelPendingRefreshes,
  refreshAllPanels,
} from '@modules/panels/services/panelRefreshService';
import {
  buildAlertsEmbed,
  buildKpiEmbed,
} from '@modules/objectives/embeds/objectiveEmbeds';
import { getWeeklyComparison } from '@modules/kpi/services/kpiService';

/** Fuseau de référence : les horaires sont pensés pour une équipe francophone. */
const TIMEZONE = 'Europe/Paris';

const tasks: ScheduledTask[] = [];

/**
 * Enregistre les tâches planifiées.
 *
 * Chaque job est isolé dans un `try/catch` : l'échec de l'un ne doit pas
 * empêcher les suivants de s'exécuter, ni faire tomber le bot.
 */
export async function initializeJobs(client: Client): Promise<void> {
  // Tous les jours à 8 h : clôture des absences échues.
  tasks.push(
    cron.schedule(
      '0 8 * * *',
      () => void runSafely('clôture des absences échues', async () => {
        await closeExpiredAbsences();
      }),
      { timezone: TIMEZONE },
    ),
  );

  // Toutes les 6 heures : détection des anomalies.
  tasks.push(
    cron.schedule(
      '0 */6 * * *',
      () => void runSafely('détection des alertes', async () => {
        const detected = await detectAlerts();
        await persistAlerts(detected);

        const refreshGuild = client.guilds.cache.get(env.guildId);
        // Certains compteurs dérivent sans action utilisateur : une tâche
        // devient « en retard » par simple écoulement du temps. Sans ce
        // passage régulier, les panneaux afficheraient des chiffres périmés.
        if (refreshGuild) await refreshAllPanels(refreshGuild);

        // Les alertes critiques sont poussées dans le salon de direction ;
        // les autres restent consultables via `/alertes`.
        const critical = detected.filter((alert) => alert.severity === 'CRITIQUE');
        if (critical.length === 0) return;

        const guild = client.guilds.cache.get(env.guildId);
        if (!guild) return;

        const channel = await ChannelResolver.getChannel(guild, 'SYSTEME_JOURNAL');
        await channel?.send({
          embeds: [buildAlertsEmbed(critical, client.user!)],
        });
      }),
      { timezone: TIMEZONE },
    ),
  );

  // Chaque lundi à 9 h : instantané KPI de la semaine écoulée.
  tasks.push(
    cron.schedule(
      '0 9 * * 1',
      () => void runSafely('instantané KPI hebdomadaire', async () => {
        // La semaine écoulée, pas celle qui commence : on fige des chiffres
        // définitifs plutôt qu'une semaine encore en cours.
        const lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);

        await snapshotWeek(startOfWeek(lastWeek));

        const guild = client.guilds.cache.get(env.guildId);
        if (!guild) return;

        const channel = await ChannelResolver.getChannel(guild, 'DIRECTION_HUB');
        await channel?.send({
          embeds: [buildKpiEmbed(await getWeeklyComparison(), client.user!)],
        });
      }),
      { timezone: TIMEZONE },
    ),
  );

  logger.info(`✓ ${tasks.length} tâche(s) planifiée(s) enregistrée(s)`);
}

/** Arrête proprement les crons — appelé à l'extinction du bot. */
export function stopJobs(): void {
  for (const task of tasks) {
    task.stop();
  }
  tasks.length = 0;
  cancelPendingRefreshes();
}

async function runSafely(label: string, action: () => Promise<void>): Promise<void> {
  try {
    logger.info(`Job « ${label} » démarré.`);
    await action();
    logger.info(`Job « ${label} » terminé.`);
  } catch (error) {
    logger.error(`Job « ${label} » en échec :`, error);
  }
}

/** Lundi minuit de la semaine contenant la date donnée. */
function startOfWeek(reference: Date): Date {
  const date = new Date(reference);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}

export default initializeJobs;
