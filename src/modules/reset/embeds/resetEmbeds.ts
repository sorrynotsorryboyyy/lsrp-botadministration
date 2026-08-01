import { EmbedBuilder, User } from 'discord.js';
import { countByAction, countInventory, ResetInventory, ResetReport } from '../types';

const MAX_ERRORS_SHOWN = 5;
const FIELD_LIMIT = 1024;

/**
 * Embed d'avertissement, affiché avant toute suppression.
 *
 * Annonce des chiffres exacts issus de l'inventaire : l'utilisateur doit savoir
 * précisément ce qu'il détruit avant de confirmer.
 */
export function buildResetWarningEmbed(inventory: ResetInventory, guildName: string): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🛑 Réinitialisation de la structure')
    .setColor(0xe74c3c)
    .setDescription(
      `Cette action va **supprimer définitivement** la structure du serveur **${guildName}**.\n` +
        'Elle est irréversible.',
    )
    .addFields(
      {
        name: 'Sera supprimé',
        value: [
          `🗂️ **${inventory.categories.length}** catégorie(s)`,
          `💬 **${inventory.channels.length}** salon(s) — *avec tout leur contenu*`,
          `🎭 **${inventory.roles.length}** rôle(s)`,
          `🔑 **${inventory.configKeyCount}** entrée(s) de configuration`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Sera conservé',
        value: [
          '✅ Membres et grades en base',
          '✅ Projets, tâches, objectifs',
          '✅ Historique RH et sanctions',
          "✅ Journal d'audit",
        ].join('\n'),
        inline: true,
      },
    );

  if (inventory.protectedRoles.length > 0) {
    embed.addFields({
      name: '⚠️ Rôles non supprimables',
      value: truncate(
        inventory.protectedRoles.map((r) => `• **${r.label}** — ${r.reason}`).join('\n'),
        FIELD_LIMIT,
      ),
    });
  }

  if (countInventory(inventory) === 0) {
    embed.addFields({
      name: 'Rien à supprimer',
      value: "Aucun élément créé par le bot n'a été trouvé sur ce serveur.",
    });
  }

  embed.setFooter({ text: 'Cette confirmation expire au bout de 60 secondes.' });

  return embed;
}

export function buildResetCancelledEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Réinitialisation annulée')
    .setColor(0x95a5a6)
    .setDescription('Aucune modification effectuée.');
}

export function buildResetReportEmbed(report: ResetReport, author: User): EmbedBuilder {
  const deleted = countByAction(report.outcomes, 'deleted');
  const alreadyGone = countByAction(report.outcomes, 'already_gone');
  const failed = countByAction(report.outcomes, 'failed');

  const embed = new EmbedBuilder()
    .setTitle(failed > 0 ? '⚠️ Réinitialisation partielle' : '✅ Réinitialisation terminée')
    .setColor(failed > 0 ? 0xf39c12 : 0x27ae60)
    .setDescription(
      failed > 0
        ? 'La structure a été supprimée, mais certains éléments ont résisté. Vérifiez les permissions du bot.'
        : 'La structure a été supprimée. Lancez `/setup` pour la recréer.',
    )
    .addFields({
      name: 'Résultat',
      value: [
        `🗑️ **${deleted}** supprimé(s)`,
        alreadyGone > 0 ? `⏭️ **${alreadyGone}** déjà absent(s)` : null,
        failed > 0 ? `❌ **${failed}** en échec` : null,
        `🔑 **${report.purgedKeys}** clé(s) de configuration purgée(s)`,
      ]
        .filter(Boolean)
        .join('\n'),
    })
    .setFooter({
      text: `Exécuté par ${author.username} • ${(report.durationMs / 1000).toFixed(1)}s`,
      iconURL: author.displayAvatarURL(),
    })
    .setTimestamp();

  if (failed > 0) {
    const errors = report.outcomes.filter((o) => o.action === 'failed');
    const shown = errors
      .slice(0, MAX_ERRORS_SHOWN)
      .map((o) => `• **${o.label}** — ${o.error ?? 'raison inconnue'}`)
      .join('\n');
    const remaining = errors.length - MAX_ERRORS_SHOWN;

    embed.addFields({
      name: 'Détail des échecs',
      value: truncate(remaining > 0 ? `${shown}\n_…et ${remaining} autre(s)._` : shown, FIELD_LIMIT),
    });
  }

  return embed;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
