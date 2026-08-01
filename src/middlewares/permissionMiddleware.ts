import { ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { Grade } from '@prisma/client';
import PermissionService from '@services/PermissionService';
import GuildStructureService from '@services/GuildStructureService';
import EmbedFactory from '@services/EmbedFactory';
import logger from '@core/Logger';

/**
 * Vérifie que l'auteur de la commande atteint le grade minimum requis.
 *
 * Applique la règle de cascade hiérarchique : un grade N peut exécuter tout ce
 * qui est ouvert aux grades inférieurs. Les exceptions métier plus fines
 * (« être le responsable du projet », « agir sur son propre pôle ») restent à la
 * charge des handlers de module, qui seuls connaissent l'entité visée.
 *
 * @returns `true` si l'exécution peut continuer, `false` si l'utilisateur a déjà
 *          reçu une réponse de refus.
 */
export async function permissionMiddleware(
  interaction: ChatInputCommandInteraction,
  minGrade?: Grade,
): Promise<boolean> {
  if (!minGrade) return true;

  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      embeds: [EmbedFactory.errorEmbed('Hors serveur', 'Cette commande ne fonctionne que sur le serveur.')],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  // Amorçage : tant que `/setup` n'a jamais tourné, aucun rôle de la hiérarchie
  // n'existe et personne ne peut donc atteindre le grade requis. On autorise
  // alors les administrateurs du serveur, le temps de provisionner la structure.
  // Dès que le registre est peuplé, seule la hiérarchie fait foi.
  if (!(await GuildStructureService.isProvisioned())) {
    if (interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      logger.warn(
        `Amorçage : ${interaction.user.tag} exécute /${interaction.commandName} ` +
          'via ses permissions administrateur (aucun rôle hiérarchique provisionné).',
      );
      return true;
    }

    await interaction.reply({
      embeds: [
        EmbedFactory.errorEmbed(
          'Serveur non configuré',
          'La hiérarchie n\'a pas encore été créée. Un administrateur doit exécuter `/setup`.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  const canExecute = await PermissionService.canExecuteCommand(interaction.member, minGrade);

  if (!canExecute) {
    logger.warn(
      `Permission refusée pour ${interaction.user.tag} (${interaction.user.id}) ` +
        `sur /${interaction.commandName} — grade requis: ${minGrade}`,
    );
    await interaction.reply({
      embeds: [
        EmbedFactory.errorEmbed(
          'Permission refusée',
          `Vous n'avez pas les permissions nécessaires pour cette commande.\nGrade minimum requis : **${minGrade}**`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  return true;
}

export default permissionMiddleware;
