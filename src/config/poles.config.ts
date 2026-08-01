import { PoleName } from '@prisma/client';

export interface PoleConfig {
  name: PoleName;
  displayName: string;
  emoji: string;
  color: string;
  description: string;
}

export const POLES_CONFIG: Record<PoleName, PoleConfig> = {
  [PoleName.GENERAL]: {
    name: PoleName.GENERAL,
    displayName: 'Général',
    emoji: '📢',
    color: '#2c3e50',
    description: 'Communications générales et transversales',
  },
  [PoleName.GARRYS_MOD]: {
    name: PoleName.GARRYS_MOD,
    displayName: "Garry's Mod",
    emoji: '🎮',
    color: '#e74c3c',
    description: 'Pôle Garry\'s Mod',
  },
  [PoleName.WEB]: {
    name: PoleName.WEB,
    displayName: 'Web',
    emoji: '🌐',
    color: '#3498db',
    description: 'Développement et maintenance web',
  },
  [PoleName.TECHNIQUE]: {
    name: PoleName.TECHNIQUE,
    displayName: 'Technique',
    emoji: '⚙️',
    color: '#9b59b6',
    description: 'Infrastructure et support technique',
  },
  [PoleName.COMMUNAUTAIRE]: {
    name: PoleName.COMMUNAUTAIRE,
    displayName: 'Communautaire',
    emoji: '👥',
    color: '#16a085',
    description: 'Gestion de la communauté',
  },
  [PoleName.MARKETING]: {
    name: PoleName.MARKETING,
    displayName: 'Marketing',
    emoji: '📊',
    color: '#f39c12',
    description: 'Stratégie et promotion',
  },
  [PoleName.PARTENARIATS]: {
    name: PoleName.PARTENARIATS,
    displayName: 'Partenariats',
    emoji: '🤝',
    color: '#e67e22',
    description: 'Gestion des partenariats',
  },
  [PoleName.ANIMATION]: {
    name: PoleName.ANIMATION,
    displayName: 'Animation',
    emoji: '🎭',
    color: '#c0392b',
    description: 'Animation et événements',
  },
};
