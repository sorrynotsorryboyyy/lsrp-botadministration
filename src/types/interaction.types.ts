import {
  ChatInputCommandInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  GuildMember,
} from 'discord.js';
import { Grade } from '@prisma/client';

export interface PermissionContext {
  member: GuildMember;
  grade: Grade;
}

export type AnyInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;
