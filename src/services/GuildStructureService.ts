import { Grade, PoleName } from '@prisma/client';
import prisma from '@database/prisma';
import logger from '@core/Logger';

/**
 * Registre technique des IDs Discord provisionnés par `/setup`.
 *
 * Toutes les clés de `GuildConfig` sont produites ici : c'est ce qui garantit
 * que le module qui écrit un ID et celui qui le relit s'accordent. Ne jamais
 * composer une clé à la main ailleurs dans le code.
 */
export class GuildStructureService {
  // --- Composition des clés (source de vérité unique) ---

  static roleKey(grade: Grade): string {
    return `ROLE_${grade}`;
  }

  static categoryKey(categoryKey: string): string {
    return `CATEGORY_${categoryKey}`;
  }

  static channelKey(channelKey: string): string {
    return `CHANNEL_${channelKey}`;
  }

  static poleCategoryKey(pole: PoleName): string {
    return `POLE_${pole}_CATEGORY`;
  }

  static poleChannelKey(pole: PoleName, channelKey: string): string {
    return `POLE_${pole}_${channelKey.toUpperCase()}`;
  }

  /**
   * Clé du message épinglé d'un panneau.
   *
   * Stocké ici plutôt que dans une table dédiée : c'est un identifiant Discord
   * volatil, de même nature et de même cycle de vie que les IDs de salons — et
   * l'y placer garantit qu'un `/reset` le purge sans oubli.
   */
  static panelMessageKey(panelId: string, pole: PoleName | null): string {
    return pole ? `PANEL_${panelId}_${pole}_MESSAGE` : `PANEL_${panelId}_MESSAGE`;
  }

  // --- Accès générique ---

  /** Écrit (ou met à jour) une entrée du registre. */
  static async set(key: string, value: string): Promise<void> {
    try {
      await prisma.guildConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    } catch (error) {
      logger.error(`Échec de l'écriture de la clé de configuration ${key}:`, error);
      throw error;
    }
  }

  /** Lit une entrée du registre. Renvoie `null` si absente ou en cas d'erreur. */
  static async get(key: string): Promise<string | null> {
    try {
      const config = await prisma.guildConfig.findUnique({ where: { key } });
      return config?.value ?? null;
    } catch (error) {
      logger.error(`Échec de la lecture de la clé de configuration ${key}:`, error);
      return null;
    }
  }

  // --- Accès typés ---

  static async setRoleId(grade: Grade, roleId: string): Promise<void> {
    await this.set(this.roleKey(grade), roleId);
  }

  static async getRoleId(grade: Grade): Promise<string | null> {
    return this.get(this.roleKey(grade));
  }

  static async setChannelId(key: string, channelId: string): Promise<void> {
    await this.set(key, channelId);
  }

  static async getChannelId(key: string): Promise<string | null> {
    return this.get(key);
  }

  static async setPoleCategoryId(pole: PoleName, categoryId: string): Promise<void> {
    await this.set(this.poleCategoryKey(pole), categoryId);
  }

  static async getPoleCategoryId(pole: PoleName): Promise<string | null> {
    return this.get(this.poleCategoryKey(pole));
  }

  static async setPoleChannelId(pole: PoleName, channelKey: string, channelId: string): Promise<void> {
    await this.set(this.poleChannelKey(pole, channelKey), channelId);
  }

  static async getPoleChannelId(pole: PoleName, channelKey: string): Promise<string | null> {
    return this.get(this.poleChannelKey(pole, channelKey));
  }

  static async setPanelMessageId(
    panelId: string,
    pole: PoleName | null,
    messageId: string,
  ): Promise<void> {
    await this.set(this.panelMessageKey(panelId, pole), messageId);
  }

  static async getPanelMessageId(panelId: string, pole: PoleName | null): Promise<string | null> {
    return this.get(this.panelMessageKey(panelId, pole));
  }

  /**
   * Indique si `/setup` a déjà été exécuté, en vérifiant la présence du rôle
   * Fondateur — le premier élément provisionné.
   */
  static async isProvisioned(): Promise<boolean> {
    return (await this.getRoleId(Grade.FONDATEUR)) !== null;
  }
}

export default GuildStructureService;
