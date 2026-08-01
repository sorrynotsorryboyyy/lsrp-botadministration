import { ChannelType } from 'discord.js';
import { Grade } from '@prisma/client';

export interface ChannelConfig {
  /**
   * Nom du salon tel qu'il sera créé sur Discord.
   *
   * Toujours en kebab-case sans accent : Discord normalise lui-même les noms de
   * salons textuels mais conserve les accents ; écrire le nom déjà normalisé
   * garantit que la recherche d'idempotence au second `/setup` retrouve bien le
   * salon existant.
   *
   * Pour les salons de pôle, ce nom est un suffixe préfixé par le slug du pôle
   * (voir `provisionPoles`).
   */
  name: string;
  /** Clé stable utilisée dans `GuildConfig` — ne jamais la renommer après un déploiement. */
  key: string;
  type: ChannelType;
  minGradeView?: Grade;
  minGradeWrite?: Grade;
  /**
   * Salon « hub » : seul le bot y écrit.
   *
   * Impossible à exprimer avec `minGradeWrite`, qui autoriserait toujours le
   * grade le plus élevé. Voir `buildChannelOverwrites` pour la limite liée à la
   * permission Administrator.
   */
  botOnlyWrite?: boolean;
  topic?: string;
}

export interface CategoryConfig {
  name: string;
  /** Clé stable de la catégorie dans `GuildConfig`. */
  key: string;
  channels: ChannelConfig[];
}

/**
 * Structure fixe du serveur — 5 catégories, 8 salons.
 *
 * Chaque domaine tient en un salon « hub » verrouillé, portant un panneau
 * interactif, éventuellement doublé d'un salon de discussion ouvert. Les salons
 * thématiques d'antan (annonces, projets, tâches, objectifs…) sont remplacés par
 * les boutons du panneau et les fiches qu'il publie.
 */
export const GUILD_STRUCTURE: CategoryConfig[] = [
  {
    name: '📋 Direction',
    key: 'DIRECTION',
    channels: [
      {
        name: 'direction',
        key: 'DIRECTION_HUB',
        type: ChannelType.GuildText,
        minGradeView: Grade.RESPONSABLE,
        botOnlyWrite: true,
        topic: 'Pilotage : tableau de bord, dépenses, décisions',
      },
      {
        name: 'direction-discussion',
        key: 'DIRECTION_DISCUSSION',
        type: ChannelType.GuildText,
        minGradeView: Grade.RESPONSABLE,
        minGradeWrite: Grade.RESPONSABLE,
        topic: 'Échanges de la direction',
      },
    ],
  },
  {
    name: '📢 Général',
    key: 'GENERAL',
    channels: [
      {
        name: 'general',
        key: 'GENERAL_HUB',
        type: ChannelType.GuildText,
        botOnlyWrite: true,
        topic: 'Annonces, réunions et objectifs généraux',
      },
      {
        name: 'general-discussion',
        key: 'GENERAL_DISCUSSION',
        type: ChannelType.GuildText,
        topic: "Discussion ouverte à toute l'équipe",
      },
    ],
  },
  {
    name: '🧑‍💼 RH',
    key: 'RH',
    channels: [
      {
        name: 'rh',
        key: 'RH_HUB',
        type: ChannelType.GuildText,
        minGradeView: Grade.CHEF_EQUIPE,
        botOnlyWrite: true,
        topic: 'Candidatures, promotions et absences',
      },
      {
        // Salon distinct et non fusionné avec le hub : les sanctions sont
        // visibles à partir de Responsable, les candidatures dès Chef d'équipe.
        name: 'rh-confidentiel',
        key: 'RH_CONFIDENTIEL',
        type: ChannelType.GuildText,
        minGradeView: Grade.RESPONSABLE,
        minGradeWrite: Grade.RESPONSABLE,
        topic: 'Confidentiel — sanctions et avertissements',
      },
    ],
  },
  {
    name: '📚 Documents',
    key: 'DOCUMENTS',
    channels: [
      {
        name: 'documents',
        key: 'DOCUMENTS_HUB',
        type: ChannelType.GuildText,
        botOnlyWrite: true,
        topic: 'Procédures, guides, tutoriels et cahiers des charges',
      },
    ],
  },
  {
    name: '⚙️ Système',
    key: 'SYSTEME',
    channels: [
      {
        name: 'journal',
        key: 'SYSTEME_JOURNAL',
        type: ChannelType.GuildText,
        minGradeView: Grade.DIRECTEUR_POLE,
        botOnlyWrite: true,
        topic: "Journal d'audit et alertes automatiques",
      },
    ],
  },
];

/**
 * Salons répliqués dans chaque pôle — 2 par pôle.
 *
 * Les noms sont préfixés par le slug du pôle à la création (`web` → `#web`,
 * `#web-discussion`), afin que les mentions restent sans ambiguïté d'un pôle à
 * l'autre. Les clés sont relatives : `GuildStructureService.poleChannelKey` les
 * préfixe par `POLE_<NOM>_`.
 */
export const POLE_CHANNELS: ChannelConfig[] = [
  {
    // Nom vide : le salon prend le slug du pôle tel quel (`#web`).
    name: '',
    key: 'HUB',
    type: ChannelType.GuildText,
    botOnlyWrite: true,
    topic: 'Panneau du pôle — projets, tâches, objectifs, annonces',
  },
  {
    name: 'discussion',
    key: 'DISCUSSION',
    type: ChannelType.GuildText,
    topic: 'Échanges du pôle',
  },
];

/** Compose le nom réel d'un salon de pôle à partir du slug et du modèle. */
export function buildPoleChannelName(slug: string, config: ChannelConfig): string {
  return config.name ? `${slug}-${config.name}` : slug;
}
