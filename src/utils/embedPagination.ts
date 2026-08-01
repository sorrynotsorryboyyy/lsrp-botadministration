import { EmbedBuilder } from 'discord.js';

export interface PaginationOptions {
  itemsPerPage: number;
}

export class EmbedPaginator {
  private items: string[];
  private itemsPerPage: number;
  private currentPage: number = 0;

  constructor(items: string[], options: PaginationOptions = { itemsPerPage: 10 }) {
    this.items = items;
    this.itemsPerPage = options.itemsPerPage;
  }

  getTotalPages(): number {
    return Math.ceil(this.items.length / this.itemsPerPage);
  }

  getCurrentPage(): number {
    return this.currentPage + 1;
  }

  getPageItems(): string[] {
    const start = this.currentPage * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    return this.items.slice(start, end);
  }

  addToEmbed(embed: EmbedBuilder, title: string): EmbedBuilder {
    const items = this.getPageItems();
    const content = items.length > 0 ? items.join('\n') : 'Aucun élément';

    embed.addFields({
      name: title,
      value: content,
      inline: false,
    });

    const totalPages = this.getTotalPages();
    if (totalPages > 1) {
      embed.setFooter({
        text: `Page ${this.getCurrentPage()} / ${totalPages}`,
      });
    }

    return embed;
  }

  nextPage(): boolean {
    if (this.currentPage < this.getTotalPages() - 1) {
      this.currentPage++;
      return true;
    }
    return false;
  }

  previousPage(): boolean {
    if (this.currentPage > 0) {
      this.currentPage--;
      return true;
    }
    return false;
  }

  goToPage(page: number): boolean {
    if (page >= 1 && page <= this.getTotalPages()) {
      this.currentPage = page - 1;
      return true;
    }
    return false;
  }
}
