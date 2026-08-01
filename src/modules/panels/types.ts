import { ActionRowBuilder, ButtonBuilder, EmbedBuilder, Guild } from 'discord.js';
import { PoleName } from '@prisma/client';

/** Rendu complet d'un panneau, prêt à être envoyé ou édité. */
export interface PanelRender {
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}

export interface PanelContext {
  guild: Guild;
  /** Renseigné pour les panneaux de pôle, `null` pour les panneaux fixes. */
  pole: PoleName | null;
}

export interface PanelDefinition {
  /** Identifiant stable, utilisé dans la clé `GuildConfig` et le marqueur de footer. */
  id: string;
  /** Clé du salon cible : clé fixe (`RH_HUB`) ou clé de pôle (`HUB`). */
  channelKey: string;
  /** Vrai si le panneau est répliqué dans chaque pôle. */
  perPole: boolean;
  /** Construit le contenu à afficher, à partir de l'état courant en base. */
  render: (context: PanelContext) => Promise<PanelRender>;
}

/**
 * Marqueur inscrit dans le footer de l'embed principal.
 *
 * Permet de retrouver un panneau parmi les messages épinglés si le registre a
 * été vidé alors que le message existe encore — évite d'en créer un doublon.
 */
export function panelMarker(panelId: string, pole: PoleName | null): string {
  return pole ? `panel:${panelId}:${pole}` : `panel:${panelId}`;
}
