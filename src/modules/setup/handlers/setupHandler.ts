import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import EmbedFactory from '@services/EmbedFactory';
import logger from '@core/Logger';
import { provisionRoles } from '../services/roleProvisioningService';
import { provisionPoleRoles } from '../services/poleRoleProvisioningService';
import { provisionCoreStructure, provisionPoles } from '../services/channelProvisioningService';
import { provisionPanels } from '../services/panelProvisioningService';
import { buildSetupConfirmEmbed, buildSetupReportEmbed } from '../embeds/setupReportEmbed';
import { SetupReport } from '../types';

const CONFIRM_TIMEOUT_MS = 60_000;
const CONFIRM_BUTTON_ID = 'setup:confirm';
const CANCEL_BUTTON_ID = 'setup:cancel';

/**
 * Point d'entrée de `/setup`.
 *
 * Le provisioning est précédé d'une confirmation explicite : la commande touche
 * à l'ensemble de la structure du serveur et ne doit pas partir sur un clic
 * accidentel. Le collecteur est restreint à l'auteur de la commande.
 */
export async function handleSetup(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      embeds: [EmbedFactory.errorEmbed('Hors serveur', 'Cette commande doit être lancée depuis le serveur.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;

  // Vérification préalable : sans ces droits, le provisioning échouerait salon
  // par salon et produirait un rapport illisible. Mieux vaut refuser d'emblée.
  const me = guild.members.me;
  if (!me?.permissions.has([PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels])) {
    await interaction.reply({
      embeds: [
        EmbedFactory.errorEmbed(
          'Permissions insuffisantes',
          'Le bot a besoin des permissions **Gérer les rôles** et **Gérer les salons** pour exécuter le setup.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CONFIRM_BUTTON_ID)
      .setLabel('Lancer la configuration')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(CANCEL_BUTTON_ID).setLabel('Annuler').setStyle(ButtonStyle.Secondary),
  );

  const message = await interaction.reply({
    embeds: [buildSetupConfirmEmbed()],
    components: [buttons],
    flags: MessageFlags.Ephemeral,
    withResponse: true,
  });

  let confirmation;
  try {
    confirmation = await message.resource!.message!.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: CONFIRM_TIMEOUT_MS,
    });
  } catch {
    await interaction.editReply({
      embeds: [EmbedFactory.warningEmbed('Expiré', 'Confirmation non reçue — aucune modification effectuée.')],
      components: [],
    });
    return;
  }

  if (confirmation.customId === CANCEL_BUTTON_ID) {
    await confirmation.update({
      embeds: [EmbedFactory.infoEmbed('Annulé', 'Aucune modification effectuée.')],
      components: [],
    });
    return;
  }

  // Le provisioning dépasse largement les 3 secondes autorisées par Discord.
  await confirmation.update({
    embeds: [EmbedFactory.infoEmbed('Configuration en cours…', 'Création des rôles, catégories et salons.')],
    components: [],
  });

  const report = await runProvisioning(guild);

  await interaction.editReply({
    embeds: [buildSetupReportEmbed(report, interaction.user)],
    components: [],
  });
}

/**
 * Exécute le provisioning complet.
 *
 * L'ordre est significatif : les rôles doivent exister avant les salons, car les
 * permission overwrites référencent leurs IDs.
 */
async function runProvisioning(guild: ChatInputCommandInteraction['guild']): Promise<SetupReport> {
  const startedAt = Date.now();

  logger.info(`Démarrage du setup sur ${guild!.name} (${guild!.id})`);

  const roles = await provisionRoles(guild!);

  // Les rôles de pôle doivent exister avant les salons : les overwrites de
  // cloisonnement référencent leurs IDs.
  const poleRoles = await provisionPoleRoles(guild!);

  // Le cache des rôles vient d'être modifié : on le rafraîchit pour que la
  // construction des overwrites voie bien les rôles fraîchement créés.
  await guild!.roles.fetch();

  const core = await provisionCoreStructure(guild!);
  const polesOutcome = await provisionPoles(guild!);

  // Les panneaux viennent en dernier : ils ont besoin des salons.
  const panels = await provisionPanels(guild!);

  const report: SetupReport = {
    roles: [...roles, ...poleRoles],
    categories: core.categories,
    channels: [...core.channels, ...polesOutcome.channels],
    poles: polesOutcome.poles,
    panels,
    durationMs: Date.now() - startedAt,
  };

  logger.info(`Setup terminé en ${(report.durationMs / 1000).toFixed(1)}s`);

  return report;
}
