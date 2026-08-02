import { AnySelectMenuInteraction, MessageFlags } from 'discord.js';
import EmbedFactory from '@services/EmbedFactory';
import { failGracefully, resolveActor } from '@services/InteractionContext';
import { SelectMenuHandler } from '@apptypes/command.types';
import { canAnnounce } from './permissions';
import { consumeDraft } from './draftStore';
import { createAnnouncement } from './services/announcementService';
import { broadcastAnnouncement } from './services/broadcastService';
import {
  buildAnnouncementEmbed,
  buildBroadcastReportEmbed,
  resolveSelectedPoles,
} from './embeds/announcementEmbeds';
import { getActorPoleName } from './handlers/announcementHandler';

/**
 * Deuxième étape de `/annonce creer` : les pôles sont choisis, on publie.
 *
 * `customId` : `annonceselect:poles:<draftId>`.
 */
export const announcementPoleSelect: SelectMenuHandler = {
  customIdPrefix: 'annonceselect',
  async execute(interaction: AnySelectMenuInteraction): Promise<void> {
    const [, , draftId] = interaction.customId.split(':');
    if (!draftId || !interaction.inCachedGuild()) return;

    const context = await resolveActor(interaction, interaction.member);
    if (!context) return;

    await interaction.deferUpdate();

    try {
      const draft = consumeDraft(draftId);

      // Brouillon absent : soit expiré (10 min), soit déjà consommé par un
      // premier clic. Dans les deux cas, republier serait un doublon.
      if (!draft) {
        await interaction.editReply({
          embeds: [
            EmbedFactory.warningEmbed(
              'Brouillon expiré',
              'Cette annonce a déjà été publiée ou son brouillon a expiré. Relancez `/annonce creer`.',
            ),
          ],
          components: [],
        });
        return;
      }

      // Garde-fou : le brouillon appartient à celui qui l'a rédigé. La réponse
      // étant éphémère, le cas est improbable — mais l'identifiant est devinable.
      if (draft.authorDiscordId !== interaction.user.id) {
        await interaction.editReply({
          embeds: [
            EmbedFactory.errorEmbed('Action refusée', "Ce brouillon n'est pas le vôtre."),
          ],
          components: [],
        });
        return;
      }

      const poles = resolveSelectedPoles(interaction.values);
      const actorPole = await getActorPoleName(context.actor.id);

      const check = canAnnounce({ grade: context.actorGrade, pole: actorPole }, poles);

      if (!check.allowed) {
        await interaction.editReply({
          embeds: [EmbedFactory.errorEmbed('Permission refusée', check.reason!)],
          components: [],
        });
        return;
      }

      const announcement = await createAnnouncement({
        title: draft.title,
        content: draft.content,
        priority: draft.priority,
        author: context.actor,
        poles,
      });

      const embed = buildAnnouncementEmbed(announcement);
      const report = await broadcastAnnouncement(interaction.guild, announcement, embed);

      await interaction.editReply({
        embeds: [buildBroadcastReportEmbed(announcement, report, interaction.user)],
        components: [],
      });
    } catch (error) {
      await failGracefully(interaction, error, "diffusion d'annonce");
    }
  },
};
