import { SlashCommandBuilder } from 'discord.js';
import { Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { AUDIT_ACTION_LABELS, AuditAction } from '@modules/audit/actions';
import { ENTITY_CHOICES, handleAudit } from '@modules/audit/handlers/auditHandler';

// Discord plafonne à 25 choix par option ; le catalogue en compte moins, mais on
// tronque par sécurité au cas où il s'étofferait.
const ACTION_CHOICES = Object.values(AuditAction)
  .slice(0, 25)
  .map((action) => ({
    name: AUDIT_ACTION_LABELS[action] ?? action,
    value: action as string,
  }));

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('journal')
    .setDescription("Consulter le journal d'audit")
    .addUserOption((opt) => opt.setName('membre').setDescription("Filtrer par auteur de l'action"))
    .addStringOption((opt) =>
      opt.setName('action').setDescription("Filtrer par type d'action").addChoices(...ACTION_CHOICES),
    )
    .addStringOption((opt) =>
      opt.setName('type').setDescription("Filtrer par type d'entité").addChoices(...ENTITY_CHOICES),
    )
    .addIntegerOption((opt) =>
      opt.setName('page').setDescription('Numéro de page (10 entrées par page)').setMinValue(1),
    ),
  minGrade: Grade.RESPONSABLE,
  execute: handleAudit,
};

export default command;
