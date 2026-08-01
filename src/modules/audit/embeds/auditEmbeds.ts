import { EmbedBuilder, User } from 'discord.js';
import { formatDateTime } from '@utils/dateFormatter';
import { AUDIT_ACTION_LABELS, AuditActionValue } from '../actions';
import { AuditLogWithActor } from '../services/auditService';

const FIELD_LIMIT = 1024;

export interface AuditPage {
  entries: AuditLogWithActor[];
  total: number;
  page: number;
  pageSize: number;
}

export function buildAuditEmbed(page: AuditPage, requester: User, filterLabel: string): EmbedBuilder {
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));

  const embed = new EmbedBuilder()
    .setTitle('📜 Journal d\'audit')
    .setColor(0x2c3e50)
    .setDescription(filterLabel)
    .addFields({
      name: `Entrées (${page.total} au total)`,
      value: formatEntries(page.entries),
    })
    .setFooter({
      text: `Page ${page.page} / ${totalPages} • consulté par ${requester.username}`,
      iconURL: requester.displayAvatarURL(),
    })
    .setTimestamp();

  return embed;
}

function formatEntries(entries: AuditLogWithActor[]): string {
  if (entries.length === 0) return '_Aucune entrée pour ces critères._';

  const lines = entries.map((entry) => {
    const label = AUDIT_ACTION_LABELS[entry.action as AuditActionValue] ?? entry.action;
    const actor = entry.actor ? `<@${entry.actor.discordId}>` : '_système_';
    const detail = formatMetadata(entry.metadata);

    return `\`${formatDateTime(entry.createdAt)}\` ${label}\n╰ ${actor}${detail}`;
  });

  return truncate(lines.join('\n'), FIELD_LIMIT);
}

/**
 * Rend le contexte JSON lisible.
 *
 * Les clés `target`, `from` et `to` sont traitées à part car ce sont les plus
 * fréquentes ; le reste est affiché en `clé: valeur`.
 */
function formatMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';

  const data = metadata as Record<string, unknown>;
  const parts: string[] = [];

  if (typeof data.target === 'string') parts.push(`→ ${data.target}`);
  if (data.from && data.to) parts.push(`${data.from} → ${data.to}`);

  for (const [key, value] of Object.entries(data)) {
    if (['target', 'from', 'to'].includes(key)) continue;
    if (value === null || value === undefined) continue;
    parts.push(`${key}: ${String(value)}`);
  }

  return parts.length > 0 ? ` — ${parts.join(' · ')}` : '';
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
