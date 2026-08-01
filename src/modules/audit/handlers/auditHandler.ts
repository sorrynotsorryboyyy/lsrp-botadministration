import { ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import MemberService from '@services/MemberService';
import { failGracefully, replyError } from '@services/InteractionContext';
import { AuditActionValue, AuditEntity, AuditEntityValue } from '../actions';
import { countAudit, queryAudit } from '../services/auditService';
import { buildAuditEmbed } from '../embeds/auditEmbeds';

const PAGE_SIZE = 10;

export async function handleAudit(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    await replyError(interaction, 'Cette commande doit être utilisée depuis le serveur.');
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const user = interaction.options.getUser('membre');
    const action = interaction.options.getString('action') as AuditActionValue | null;
    const entityType = interaction.options.getString('type') as AuditEntityValue | null;
    const page = interaction.options.getInteger('page') ?? 1;

    // Le filtre porte sur l'auteur de l'action, pas sur la personne visée :
    // l'entrée référence un `Member`, dont l'ID diffère du Discord ID.
    let actorId: string | undefined;
    if (user) {
      const member = await MemberService.getMemberByDiscordId(user.id);

      if (!member) {
        await interaction.editReply({
          embeds: [
            buildAuditEmbed(
              { entries: [], total: 0, page: 1, pageSize: PAGE_SIZE },
              interaction.user,
              `Aucun dossier connu pour **${user.username}**.`,
            ),
          ],
        });
        return;
      }

      actorId = member.id;
    }

    const query = { actorId, action: action ?? undefined, entityType: entityType ?? undefined };

    const [entries, total] = await Promise.all([
      queryAudit({ ...query, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
      countAudit(query),
    ]);

    await interaction.editReply({
      embeds: [
        buildAuditEmbed(
          { entries, total, page, pageSize: PAGE_SIZE },
          interaction.user,
          describeFilters(user?.username, action, entityType),
        ),
      ],
    });
  } catch (error) {
    await failGracefully(interaction, error, "consultation du journal d'audit");
  }
}

function describeFilters(
  username?: string,
  action?: AuditActionValue | null,
  entityType?: AuditEntityValue | null,
): string {
  const filters: string[] = [];

  if (username) filters.push(`auteur : **${username}**`);
  if (action) filters.push(`action : \`${action}\``);
  if (entityType) filters.push(`type : \`${entityType}\``);

  return filters.length > 0 ? `Filtres — ${filters.join(' · ')}` : 'Toutes les actions enregistrées.';
}

/** Choix proposés pour l'option `type`. */
export const ENTITY_CHOICES = Object.entries(AuditEntity).map(([, value]) => ({
  name: value,
  value,
}));
