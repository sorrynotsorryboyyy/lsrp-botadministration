import { ColorResolvable, EmbedBuilder, User } from 'discord.js';
import { Priority, AnnouncementPriority } from '@prisma/client';

export class EmbedFactory {
  static baseEmbed(user?: User): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setColor('#2c3e50')
      .setTimestamp();

    if (user) {
      embed.setFooter({ text: `Demandé par ${user.username}`, iconURL: user.displayAvatarURL() });
    }

    return embed;
  }

  static errorEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor('#e74c3c')
      .setTitle('❌ ' + title)
      .setDescription(description)
      .setTimestamp();
  }

  static successEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor('#27ae60')
      .setTitle('✅ ' + title)
      .setDescription(description)
      .setTimestamp();
  }

  static infoEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor('#3498db')
      .setTitle('ℹ️ ' + title)
      .setDescription(description)
      .setTimestamp();
  }

  static warningEmbed(title: string, description: string): EmbedBuilder {
    return new EmbedBuilder()
      .setColor('#f39c12')
      .setTitle('⚠️ ' + title)
      .setDescription(description)
      .setTimestamp();
  }

  static getPriorityColor(priority: Priority): ColorResolvable {
    const colors: Record<Priority, ColorResolvable> = {
      [Priority.BASSE]: '#95a5a6',
      [Priority.NORMALE]: '#3498db',
      [Priority.HAUTE]: '#f39c12',
      [Priority.CRITIQUE]: '#e74c3c',
    };
    return colors[priority];
  }

  static getAnnouncementPriorityColor(priority: AnnouncementPriority): ColorResolvable {
    const colors: Record<AnnouncementPriority, ColorResolvable> = {
      [AnnouncementPriority.INFO]: '#3498db',
      [AnnouncementPriority.IMPORTANTE]: '#f39c12',
      [AnnouncementPriority.URGENTE]: '#e74c3c',
    };
    return colors[priority];
  }

  static getPriorityLabel(priority: Priority): string {
    const labels: Record<Priority, string> = {
      [Priority.BASSE]: '🔵 Basse',
      [Priority.NORMALE]: '🟢 Normale',
      [Priority.HAUTE]: '🟠 Haute',
      [Priority.CRITIQUE]: '🔴 Critique',
    };
    return labels[priority];
  }

  static getAnnouncementPriorityLabel(priority: AnnouncementPriority): string {
    const labels: Record<AnnouncementPriority, string> = {
      [AnnouncementPriority.INFO]: '🔵 Info',
      [AnnouncementPriority.IMPORTANTE]: '🟠 Importante',
      [AnnouncementPriority.URGENTE]: '🔴 Urgente',
    };
    return labels[priority];
  }
}

export default EmbedFactory;
