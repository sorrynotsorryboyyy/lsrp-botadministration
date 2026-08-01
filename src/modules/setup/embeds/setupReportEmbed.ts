import { EmbedBuilder, User } from 'discord.js';
import { SetupReport, ProvisionResult, countByAction, hasFailures } from '../types';

/** Nombre maximum d'erreurs détaillées affichées avant troncature. */
const MAX_ERRORS_SHOWN = 5;

/**
 * Construit le rapport d'exécution de `/setup`.
 *
 * Vert si tout est passé, orange si des éléments ont échoué — jamais rouge :
 * un `/setup` partiel reste un succès partiel, la couleur doit refléter
 * « à vérifier » plutôt que « tout est cassé ».
 */
export function buildSetupReportEmbed(report: SetupReport, author: User): EmbedBuilder {
  const failed = hasFailures(report);

  const embed = new EmbedBuilder()
    .setTitle(failed ? '⚠️ Setup terminé avec des erreurs' : '✅ Setup terminé')
    .setColor(failed ? '#f39c12' : '#27ae60')
    .setDescription(
      failed
        ? 'La structure a été provisionnée mais certains éléments ont échoué. Vérifiez les permissions du bot puis relancez `/setup`.'
        : 'La structure du serveur est en place. La commande peut être relancée à tout moment sans risque de doublon.',
    )
    .addFields(
      { name: 'Rôles', value: summarize(report.roles), inline: true },
      { name: 'Catégories', value: summarize(report.categories), inline: true },
      { name: 'Pôles', value: summarize(report.poles), inline: true },
      { name: 'Salons', value: summarize(report.channels), inline: false },
    )
    .setFooter({
      text: `Exécuté par ${author.username} • ${(report.durationMs / 1000).toFixed(1)}s`,
      iconURL: author.displayAvatarURL(),
    })
    .setTimestamp();

  if (failed) {
    embed.addFields({ name: 'Détail des erreurs', value: formatErrors(report) });
  }

  return embed;
}

/** Résume une liste de résultats sous forme `3 créés · 2 mis à jour · 1 échec`. */
function summarize(results: ProvisionResult[]): string {
  if (results.length === 0) return '—';

  const parts: string[] = [];
  const created = countByAction(results, 'created');
  const updated = countByAction(results, 'updated');
  const skipped = countByAction(results, 'skipped');
  const failed = countByAction(results, 'failed');

  if (created > 0) parts.push(`✅ ${created} créé${created > 1 ? 's' : ''}`);
  if (updated > 0) parts.push(`🔄 ${updated} mis à jour`);
  if (skipped > 0) parts.push(`⏭️ ${skipped} existant${skipped > 1 ? 's' : ''}`);
  if (failed > 0) parts.push(`❌ ${failed} échec${failed > 1 ? 's' : ''}`);

  return parts.join('\n');
}

function formatErrors(report: SetupReport): string {
  const errors = [...report.roles, ...report.categories, ...report.poles, ...report.channels].filter(
    (r) => r.action === 'failed',
  );

  const shown = errors
    .slice(0, MAX_ERRORS_SHOWN)
    .map((r) => `• **${r.label}** — ${r.error ?? 'raison inconnue'}`)
    .join('\n');

  const remaining = errors.length - MAX_ERRORS_SHOWN;

  return remaining > 0 ? `${shown}\n_…et ${remaining} autre(s)._` : shown;
}

/** Embed de confirmation affiché avant d'exécuter le provisioning. */
export function buildSetupConfirmEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('⚙️ Configuration du serveur')
    .setColor('#3498db')
    .setDescription(
      'Cette commande va créer, si nécessaire :\n' +
        '• **9 rôles** hiérarchiques (Fondateur → Recrue)\n' +
        '• **5 catégories** fixes : Direction, Général, RH, Documents, Archives\n' +
        '• **8 catégories de pôle**, avec 5 salons chacune\n\n' +
        'Les éléments déjà présents sont réutilisés et leurs permissions réappliquées — ' +
        'rien n\'est supprimé et l\'opération peut être relancée sans risque.',
    )
    .setFooter({ text: 'Cette confirmation expire au bout de 60 secondes.' });
}
