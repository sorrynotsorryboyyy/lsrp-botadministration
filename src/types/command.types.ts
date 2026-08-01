import {
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
} from 'discord.js';
import { Grade } from '@prisma/client';

/**
 * Type couvrant toutes les formes de builder renvoyées par la chaîne de
 * construction d'une slash command. `.addSubcommand()` et `.addStringOption()`
 * renvoient des types plus étroits que `SlashCommandBuilder` — les inclure ici
 * évite d'avoir à caster dans chaque fichier de commande.
 */
export type AnySlashCommandBuilder =
  | SlashCommandBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | SlashCommandOptionsOnlyBuilder;

export interface CommandModule {
  data: AnySlashCommandBuilder;
  /** Grade minimum requis, vérifié par `permissionMiddleware` avant `execute`. */
  minGrade?: Grade;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /**
   * Alimente les options déclarées `setAutocomplete(true)`.
   *
   * Non soumis à `minGrade` : Discord impose une réponse en moins de 3 secondes
   * et l'autocomplétion ne fait que suggérer — les permissions sont appliquées
   * à l'exécution de la commande.
   */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export interface ButtonHandler {
  customIdPrefix: string;
  minGrade?: Grade;
  execute: (interaction: ButtonInteraction) => Promise<void>;
}

export interface SelectMenuHandler {
  customIdPrefix: string;
  minGrade?: Grade;
  execute: (interaction: StringSelectMenuInteraction) => Promise<void>;
}

export interface ModalHandler {
  customIdPrefix: string;
  minGrade?: Grade;
  execute: (interaction: ModalSubmitInteraction) => Promise<void>;
}
