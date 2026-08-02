import {
  ActionRowBuilder,
  AnySelectMenuInteraction,
  ButtonInteraction,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { Grade, PoleName } from '@prisma/client';
import { isGradeHigherOrEqual } from '@apptypes/grade.types';
import EmbedFactory from '@services/EmbedFactory';
import {
  failGracefully,
  resolveActor,
  resolveMemberTarget,
} from '@services/InteractionContext';
import { ButtonHandler, SelectMenuHandler } from '@apptypes/command.types';
import { POLES_CONFIG } from '@config/poles.config';
import { POLE_RANK_LABELS, POLE_RANK_ORDER, PoleRank } from '@config/poleRoles.config';
import { schedulePanelRefresh } from '@modules/panels/services/panelRefreshService';
import { PanelId } from '@modules/panels/registry';
import { assignToPole, poleLabel } from './services/assignmentService';

/** Grade business minimum pour affecter quelqu'un à un pôle. */
export const MIN_GRADE_ASSIGN = Grade.CHEF_EQUIPE;

/**
 * Bouton « Attribuer un pôle » du salon d'attente.
 *
 * Ouvre un sélecteur de membre ; la suite du flux passe par deux select menus
 * successifs (pôle puis rang), l'identité du membre voyageant dans le `customId`.
 */
export const assignmentButtons: ButtonHandler = {
  customIdPrefix: 'affect',
  async execute(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return;

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    if (!isGradeHigherOrEqual(context.actorGrade, MIN_GRADE_ASSIGN)) {
      await interaction.reply({
        embeds: [
          EmbedFactory.errorEmbed(
            'Permission refusée',
            "Seuls les Chefs d'équipe et au-dessus peuvent affecter un membre à un pôle.",
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        EmbedFactory.infoEmbed(
          'Affectation à un pôle',
          'Sélectionnez le membre à affecter.',
        ),
      ],
      components: [
        new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId('affectuser:pick')
            .setPlaceholder('Choisir un membre')
            .setMaxValues(1),
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

/** Sélection du membre : `affectuser:pick`. */
export const assignmentUserSelect: SelectMenuHandler = {
  customIdPrefix: 'affectuser',
  async execute(interaction: AnySelectMenuInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return;

    const userId = interaction.values[0];

    await interaction.update({
      embeds: [
        EmbedFactory.infoEmbed('Affectation à un pôle', `Membre : <@${userId}>\nChoisissez le pôle.`),
      ],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`affectpole:pick:${userId}`)
            .setPlaceholder('Choisir le pôle')
            .addOptions(
              Object.values(POLES_CONFIG).map((pole) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(pole.displayName)
                  .setValue(pole.name)
                  .setEmoji(pole.emoji)
                  .setDescription(pole.description.slice(0, 100)),
              ),
            ),
        ),
      ],
    });
  },
};

/** Sélection du pôle : `affectpole:pick:<userId>`. */
export const assignmentPoleSelect: SelectMenuHandler = {
  customIdPrefix: 'affectpole',
  async execute(interaction: AnySelectMenuInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return;

    const [, , userId] = interaction.customId.split(':');
    const pole = interaction.values[0] as PoleName;

    await interaction.update({
      embeds: [
        EmbedFactory.infoEmbed(
          'Affectation à un pôle',
          `Membre : <@${userId}>\nPôle : **${poleLabel(pole)}**\nChoisissez le rang.`,
        ),
      ],
      components: [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`affectrank:pick:${userId}:${pole}`)
            .setPlaceholder('Choisir le rang')
            .addOptions(
              POLE_RANK_ORDER.map((rank) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(POLE_RANK_LABELS[rank])
                  .setValue(rank)
                  .setDescription(describeRank(rank)),
              ),
            ),
        ),
      ],
    });
  },
};

/** Sélection du rang et exécution : `affectrank:pick:<userId>:<pole>`. */
export const assignmentRankSelect: SelectMenuHandler = {
  customIdPrefix: 'affectrank',
  async execute(interaction: AnySelectMenuInteraction): Promise<void> {
    if (!interaction.inCachedGuild()) return;

    const [, , userId, poleRaw] = interaction.customId.split(':');
    const pole = poleRaw as PoleName;
    const rank = interaction.values[0] as PoleRank;

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    await interaction.deferUpdate();

    try {
      const guildMember = await interaction.guild.members.fetch(userId);
      const target = await resolveMemberTarget(interaction, guildMember);
      if (!target) return;

      // Un Chef d'équipe ne peut pas nommer un Directeur de pôle : on ne délègue
      // pas une autorité supérieure à la sienne.
      if (
        rank === PoleRank.DIRECTEUR &&
        !isGradeHigherOrEqual(context.actorGrade, Grade.DIRECTEUR_POLE)
      ) {
        await interaction.editReply({
          embeds: [
            EmbedFactory.errorEmbed(
              'Permission refusée',
              'Seuls les Directeurs de Pôle et au-dessus peuvent nommer un Directeur de pôle.',
            ),
          ],
          components: [],
        });
        return;
      }

      const result = await assignToPole({
        target,
        targetMember: guildMember,
        pole,
        rank,
        actor: context.actor,
      });

      await interaction.editReply({
        embeds: [
          EmbedFactory.successEmbed(
            'Membre affecté',
            `<@${userId}> rejoint **${poleLabel(pole)}** comme **${POLE_RANK_LABELS[rank]}**.` +
              (result.rolesSynced
                ? ''
                : "\n\n⚠️ Les rôles Discord n'ont pas pu être appliqués — vérifiez la position du rôle du bot."),
          ),
        ],
        components: [],
      });

      schedulePanelRefresh(interaction.guild, PanelId.ATTENTE, null);
      schedulePanelRefresh(interaction.guild, PanelId.POLE, pole);
    } catch (error) {
      await failGracefully(interaction, error, 'affectation à un pôle');
    }
  },
};

function describeRank(rank: PoleRank): string {
  const descriptions: Record<PoleRank, string> = {
    [PoleRank.DIRECTEUR]: 'Dirige le pôle',
    [PoleRank.RESPONSABLE]: 'Encadre une équipe du pôle',
    [PoleRank.CHEF_EQUIPE]: 'Anime une équipe restreinte',
    [PoleRank.MEMBRE]: 'Membre opérationnel du pôle',
  };

  return descriptions[rank];
}
