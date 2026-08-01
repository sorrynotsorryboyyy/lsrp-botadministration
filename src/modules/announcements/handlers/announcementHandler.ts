import { randomUUID } from 'crypto';
import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { AnnouncementPriority } from '@prisma/client';
import { enforce, failGracefully, replyError, resolveCommandActor } from '@services/InteractionContext';
import prisma from '@database/prisma';
import { canAnnounce, MIN_GRADE_ANNOUNCE } from '../permissions';
import { buildPoleSelectMenu, buildPreviewEmbed } from '../embeds/announcementEmbeds';
import { saveDraft } from '../draftStore';
import { isGradeHigherOrEqual } from '@apptypes/grade.types';

export async function handleAnnouncement(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  if (interaction.options.getSubcommand() !== 'creer') {
    await replyError(interaction, 'Sous-commande inconnue.');
    return;
  }

  const context = await resolveCommandActor(interaction);
  if (!context) return;

  // Contrôle de grade en amont : inutile de faire saisir une annonce complète à
  // quelqu'un qui ne pourra la publier nulle part. Le contrôle par pôle, lui,
  // dépend de la sélection et intervient à l'étape suivante.
  if (!isGradeHigherOrEqual(context.actorGrade, MIN_GRADE_ANNOUNCE)) {
    await enforce(interaction, canAnnounce({ grade: context.actorGrade, pole: null }, []));
    return;
  }

  const title = interaction.options.getString('titre', true);
  const content = interaction.options.getString('contenu', true);
  const priority = interaction.options.getString('priorite', true) as AnnouncementPriority;

  try {
    const draftId = randomUUID();

    saveDraft(draftId, {
      title,
      content,
      priority,
      authorDiscordId: interaction.user.id,
    });

    await interaction.reply({
      embeds: [buildPreviewEmbed(title, content, priority)],
      components: [buildPoleSelectMenu(draftId)],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    await failGracefully(interaction, error, "préparation d'annonce");
  }
}

/** Pôle d'appartenance de l'auteur, nécessaire au contrôle de diffusion. */
export async function getActorPoleName(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { pole: true },
  });

  return member?.pole?.name ?? null;
}
