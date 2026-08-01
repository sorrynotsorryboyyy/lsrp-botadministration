import { ChannelType } from 'discord.js';
import { Grade } from '@prisma/client';

export interface ChannelConfig {
  /**
   * Nom du salon tel qu'il sera créé sur Discord.
   *
   * IMPORTANT : toujours en kebab-case sans accent. Discord normalise lui-même
   * les noms de salons textuels (minuscules, espaces → tirets) mais conserve les
   * accents ; écrire le nom déjà normalisé garantit que la recherche
   * d'idempotence au second `/setup` retrouve bien le salon existant.
   */
  name: string;
  /** Clé stable utilisée dans `GuildConfig` — ne jamais la renommer après un déploiement. */
  key: string;
  type: ChannelType;
  minGradeView?: Grade;
  minGradeWrite?: Grade;
  topic?: string;
}

export interface CategoryConfig {
  name: string;
  /** Clé stable de la catégorie dans `GuildConfig`. */
  key: string;
  channels: ChannelConfig[];
}

export const GUILD_STRUCTURE: CategoryConfig[] = [
  {
    name: '📋 Direction',
    key: 'DIRECTION',
    channels: [
      {
        name: 'annonces-direction',
        key: 'DIRECTION_ANNONCES',
        type: ChannelType.GuildText,
        minGradeView: Grade.DIRECTEUR_POLE,
        minGradeWrite: Grade.DIRECTEUR_GENERAL,
        topic: 'Annonces réservées à la direction',
      },
      {
        name: 'dashboard',
        key: 'DIRECTION_DASHBOARD',
        type: ChannelType.GuildText,
        minGradeView: Grade.RESPONSABLE,
        minGradeWrite: Grade.FONDATEUR,
        topic: 'Tableau de bord administratif — publié par le bot',
      },
      {
        name: 'statistiques',
        key: 'DIRECTION_STATISTIQUES',
        type: ChannelType.GuildText,
        minGradeView: Grade.DIRECTEUR_POLE,
        minGradeWrite: Grade.FONDATEUR,
        topic: 'KPI et statistiques hebdomadaires — publié par le bot',
      },
      {
        name: 'depenses',
        key: 'DIRECTION_DEPENSES',
        type: ChannelType.GuildText,
        minGradeView: Grade.RESPONSABLE,
        minGradeWrite: Grade.COLLABORATEUR,
        topic: 'Soumission et validation des dépenses',
      },
      {
        name: 'decisions',
        key: 'DIRECTION_DECISIONS',
        type: ChannelType.GuildText,
        minGradeView: Grade.DIRECTEUR_POLE,
        minGradeWrite: Grade.DIRECTEUR_GENERAL,
        topic: 'Décisions structurantes',
      },
    ],
  },
  {
    name: '📢 Général',
    key: 'GENERAL',
    channels: [
      {
        name: 'annonces',
        key: 'GENERAL_ANNONCES',
        type: ChannelType.GuildText,
        minGradeWrite: Grade.CHEF_EQUIPE,
        topic: 'Annonces transverses à toute l\'équipe',
      },
      { name: 'discussion', key: 'GENERAL_DISCUSSION', type: ChannelType.GuildText },
      {
        name: 'reunions',
        key: 'GENERAL_REUNIONS',
        type: ChannelType.GuildText,
        minGradeView: Grade.CHEF_EQUIPE,
        minGradeWrite: Grade.RESPONSABLE,
        topic: 'Planification des réunions',
      },
      {
        name: 'comptes-rendus',
        key: 'GENERAL_COMPTES_RENDUS',
        type: ChannelType.GuildText,
        minGradeWrite: Grade.RESPONSABLE,
        topic: 'Comptes-rendus de réunion',
      },
      {
        name: 'objectifs',
        key: 'GENERAL_OBJECTIFS',
        type: ChannelType.GuildText,
        minGradeWrite: Grade.CHEF_EQUIPE,
        topic: 'Objectifs généraux et hebdomadaires',
      },
    ],
  },
  {
    name: '🧑‍💼 RH',
    key: 'RH',
    channels: [
      {
        name: 'recrutements',
        key: 'RH_RECRUTEMENTS',
        type: ChannelType.GuildText,
        minGradeView: Grade.CHEF_EQUIPE,
        topic: 'Suivi des recrutements externes',
      },
      {
        name: 'candidatures',
        key: 'RH_CANDIDATURES',
        type: ChannelType.GuildText,
        minGradeView: Grade.CHEF_EQUIPE,
        topic: 'Candidatures en attente de décision',
      },
      {
        name: 'promotions',
        key: 'RH_PROMOTIONS',
        type: ChannelType.GuildText,
        minGradeWrite: Grade.DIRECTEUR_POLE,
        topic: 'Annonces de promotion',
      },
      {
        name: 'sanctions',
        key: 'RH_SANCTIONS',
        type: ChannelType.GuildText,
        minGradeView: Grade.RESPONSABLE,
        minGradeWrite: Grade.RESPONSABLE,
        topic: 'Confidentiel — sanctions et avertissements internes',
      },
      {
        name: 'historique',
        key: 'RH_HISTORIQUE',
        type: ChannelType.GuildText,
        minGradeView: Grade.CHEF_EQUIPE,
        minGradeWrite: Grade.FONDATEUR,
        topic: 'Historique RH — publié par le bot',
      },
    ],
  },
  {
    name: '📚 Documents',
    key: 'DOCUMENTS',
    channels: [
      {
        name: 'procedures',
        key: 'DOCUMENTS_PROCEDURES',
        type: ChannelType.GuildText,
        minGradeWrite: Grade.RESPONSABLE,
      },
      {
        name: 'tutoriels',
        key: 'DOCUMENTS_TUTORIELS',
        type: ChannelType.GuildText,
        minGradeWrite: Grade.CHEF_EQUIPE,
      },
      {
        name: 'guides',
        key: 'DOCUMENTS_GUIDES',
        type: ChannelType.GuildText,
        minGradeWrite: Grade.CHEF_EQUIPE,
      },
      {
        name: 'cahiers-des-charges',
        key: 'DOCUMENTS_CAHIERS_DES_CHARGES',
        type: ChannelType.GuildText,
        minGradeView: Grade.CHEF_EQUIPE,
        minGradeWrite: Grade.RESPONSABLE,
      },
    ],
  },
  {
    name: '🗄️ Archives',
    key: 'ARCHIVES',
    channels: [
      {
        name: 'projets-termines',
        key: 'ARCHIVES_PROJETS',
        type: ChannelType.GuildText,
        minGradeWrite: Grade.FONDATEUR,
        topic: 'Archive automatique — projets clôturés',
      },
      {
        name: 'comptes-rendus',
        key: 'ARCHIVES_COMPTES_RENDUS',
        type: ChannelType.GuildText,
        minGradeWrite: Grade.FONDATEUR,
        topic: 'Archive automatique — anciens comptes-rendus',
      },
      {
        name: 'decisions',
        key: 'ARCHIVES_DECISIONS',
        type: ChannelType.GuildText,
        minGradeView: Grade.DIRECTEUR_POLE,
        minGradeWrite: Grade.FONDATEUR,
        topic: 'Archive automatique — anciennes décisions',
      },
      {
        name: 'anciennes-annonces',
        key: 'ARCHIVES_ANNONCES',
        type: ChannelType.GuildText,
        minGradeWrite: Grade.FONDATEUR,
        topic: 'Archive automatique — anciennes annonces',
      },
    ],
  },
];

/**
 * Structure de salons répliquée à l'identique dans chaque pôle.
 *
 * Les clés sont relatives au pôle : `GuildStructureService.setPoleChannelId`
 * les préfixe par `POLE_<NOM_DU_POLE>_`.
 */
export const POLE_CHANNELS: ChannelConfig[] = [
  {
    name: 'annonces',
    key: 'ANNONCES',
    type: ChannelType.GuildText,
    minGradeWrite: Grade.CHEF_EQUIPE,
    topic: 'Annonces du pôle',
  },
  { name: 'discussion', key: 'DISCUSSION', type: ChannelType.GuildText },
  { name: 'projets', key: 'PROJETS', type: ChannelType.GuildText, topic: 'Projets en cours du pôle' },
  { name: 'taches', key: 'TACHES', type: ChannelType.GuildText, topic: 'Tâches assignées du pôle' },
  {
    name: 'objectifs',
    key: 'OBJECTIFS',
    type: ChannelType.GuildText,
    minGradeWrite: Grade.CHEF_EQUIPE,
    topic: 'Objectifs du pôle',
  },
];
