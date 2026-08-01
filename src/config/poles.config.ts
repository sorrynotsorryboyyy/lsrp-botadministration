import { PoleName } from '@prisma/client';

export interface PoleConfig {
  name: PoleName;
  displayName: string;
  /**
   * Identifiant court en kebab-case, utilisé pour composer les noms de salons
   * (`web` → `#web`, `#web-discussion`). Préfixer par le pôle rend les mentions
   * sans ambiguïté : `#discussion` seul serait indistinguable d'un pôle à l'autre.
   */
  slug: string;
  emoji: string;
  color: string;
  description: string;
}

export const POLES_CONFIG: Record<PoleName, PoleConfig> = {
  [PoleName.GENERAL]: {
    name: PoleName.GENERAL,
    displayName: 'Général',
    slug: 'general',
    emoji: '📢',
    color: '#2c3e50',
    description: 'Communications générales et transversales',
  },
  [PoleName.GARRYS_MOD]: {
    name: PoleName.GARRYS_MOD,
    displayName: "Garry's Mod",
    slug: 'garrys-mod',
    emoji: '🎮',
    color: '#e74c3c',
    description: 'Pôle Garry\'s Mod',
  },
  [PoleName.WEB]: {
    name: PoleName.WEB,
    displayName: 'Web',
    slug: 'web',
    emoji: '🌐',
    color: '#3498db',
    description: 'Développement et maintenance web',
  },
  [PoleName.TECHNIQUE]: {
    name: PoleName.TECHNIQUE,
    displayName: 'Technique',
    slug: 'technique',
    emoji: '⚙️',
    color: '#9b59b6',
    description: 'Infrastructure et support technique',
  },
  [PoleName.COMMUNAUTAIRE]: {
    name: PoleName.COMMUNAUTAIRE,
    displayName: 'Communautaire',
    slug: 'communautaire',
    emoji: '👥',
    color: '#16a085',
    description: 'Gestion de la communauté',
  },
  [PoleName.MARKETING]: {
    name: PoleName.MARKETING,
    displayName: 'Marketing',
    slug: 'marketing',
    emoji: '📊',
    color: '#f39c12',
    description: 'Stratégie et promotion',
  },
  [PoleName.PARTENARIATS]: {
    name: PoleName.PARTENARIATS,
    displayName: 'Partenariats',
    slug: 'partenariats',
    emoji: '🤝',
    color: '#e67e22',
    description: 'Gestion des partenariats',
  },
  [PoleName.ANIMATION]: {
    name: PoleName.ANIMATION,
    displayName: 'Animation',
    slug: 'animation',
    emoji: '🎭',
    color: '#c0392b',
    description: 'Animation et événements',
  },
};
