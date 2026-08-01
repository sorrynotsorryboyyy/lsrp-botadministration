import { SlashCommandBuilder } from 'discord.js';
import { Grade } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import {
  handleDecision,
  handleDecisionAutocomplete,
} from '@modules/decisions/handlers/decisionHandler';
import { handleMeetingAutocomplete } from '@modules/meetings/handlers/meetingHandler';
import { AutocompleteInteraction } from 'discord.js';

/** L'option `reunion` propose des réunions, `decision` des décisions. */
async function routeAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const focused = interaction.options.getFocused(true);
  return focused.name === 'reunion'
    ? handleMeetingAutocomplete(interaction)
    : handleDecisionAutocomplete(interaction);
}

const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('decision')
    .setDescription('Gestion des décisions')
    .addSubcommand((sub) =>
      sub
        .setName('proposer')
        .setDescription('Proposer une décision à arbitrer')
        .addStringOption((opt) =>
          opt.setName('titre').setDescription('Intitulé de la décision').setRequired(true).setMaxLength(150),
        )
        .addStringOption((opt) =>
          opt
            .setName('description')
            .setDescription('Détail et justification')
            .setRequired(true)
            .setMaxLength(2000),
        )
        .addStringOption((opt) =>
          opt.setName('reunion').setDescription("Réunion d'origine").setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('info')
        .setDescription('Afficher une décision')
        .addStringOption((opt) =>
          opt.setName('decision').setDescription('Décision').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('en-attente').setDescription("Lister les décisions en attente d'arbitrage"),
    ),
  minGrade: Grade.RESPONSABLE,
  execute: handleDecision,
  autocomplete: routeAutocomplete,
};

export default command;
