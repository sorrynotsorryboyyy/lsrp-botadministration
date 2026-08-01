import { Interaction, MessageFlags } from 'discord.js';
import EmbedFactory from '@services/EmbedFactory';
import logger from './Logger';

export class ErrorHandler {
  /**
   * Log l'erreur et tente d'en informer l'utilisateur.
   *
   * Accepte `Interaction` au sens large car le routeur peut recevoir des types
   * (autocomplete, context menu) qui ne savent pas répondre — on filtre ici
   * plutôt que d'imposer un cast à l'appelant.
   */
  static async handle(interaction: Interaction, error: unknown): Promise<void> {
    logger.error('Erreur lors du traitement d\'une interaction:', error);

    if (!interaction.isRepliable()) return;

    // Le message d'erreur brut peut exposer des détails internes (requête SQL,
    // chemin de fichier) : on n'expose qu'un texte générique côté utilisateur.
    const embed = EmbedFactory.errorEmbed(
      'Une erreur est survenue',
      'L\'action n\'a pas pu être menée à son terme. L\'équipe technique a été notifiée.',
    );

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply({ embeds: [embed] });
      } else {
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      }
    } catch (replyError) {
      logger.error('Impossible d\'envoyer le message d\'erreur:', replyError);
    }
  }
}

export default ErrorHandler;
