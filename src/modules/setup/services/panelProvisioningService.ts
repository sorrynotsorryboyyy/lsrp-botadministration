import { Guild } from 'discord.js';
import { PoleName } from '@prisma/client';
import { POLES_CONFIG } from '@config/poles.config';
import { PANEL_DEFINITIONS } from '@modules/panels/registry';
import { ensurePanel } from '@modules/panels/services/panelMessageService';
import { ProvisionResult } from '../types';

/**
 * Publie les panneaux épinglés dans leurs salons.
 *
 * Appelé en dernier par `/setup` : les salons doivent exister avant qu'on puisse
 * y poster. Idempotent — un panneau déjà présent est édité, pas dupliqué.
 */
export async function provisionPanels(guild: Guild): Promise<ProvisionResult[]> {
  const results: ProvisionResult[] = [];

  for (const definition of PANEL_DEFINITIONS) {
    if (definition.perPole) {
      for (const pole of Object.values(PoleName)) {
        const label = `${POLES_CONFIG[pole].displayName} › panneau`;
        const ok = await ensurePanel(guild, definition, pole as PoleName);
        results.push({ label, action: ok ? 'created' : 'failed' });
      }
      continue;
    }

    const ok = await ensurePanel(guild, definition, null);
    results.push({ label: `Panneau ${definition.id}`, action: ok ? 'created' : 'failed' });
  }

  return results;
}
