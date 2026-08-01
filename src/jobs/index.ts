import logger from '@core/Logger';

export async function initializeJobs(): Promise<void> {
  logger.info('Jobs initialized (no active jobs for now)');

  // TODO: Ajouter les crons ici
  // - KPI hebdomadaires
  // - Alertes automatiques
  // - Rappels de réunions
  // - Nettoyage d'archives
}

export default initializeJobs;
