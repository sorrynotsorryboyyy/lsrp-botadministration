import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { failGracefully, replyError } from '@services/InteractionContext';
import { getDashboardData, getPoleBreakdown } from '../services/dashboardService';
import { buildDashboardEmbed, buildPoleBreakdownEmbed } from '../embeds/dashboardEmbeds';

export async function handleDashboard(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  // Réponse publique si l'utilisateur le demande : le tableau de bord a vocation
  // à être partagé dans `#dashboard`, mais reste discret par défaut.
  const isPublic = interaction.options.getBoolean('public') ?? false;

  await interaction.deferReply(isPublic ? {} : { flags: MessageFlags.Ephemeral });

  try {
    const withPoles = interaction.options.getBoolean('poles') ?? false;

    const data = await getDashboardData();
    const embeds = [buildDashboardEmbed(data, interaction.user)];

    if (withPoles) {
      embeds.push(buildPoleBreakdownEmbed(await getPoleBreakdown(), interaction.user));
    }

    await interaction.editReply({ embeds });
  } catch (error) {
    await failGracefully(interaction, error, 'génération du tableau de bord');
  }
}
