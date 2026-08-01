import { SlashCommandBuilder } from 'discord.js';
import { Grade, SanctionSeverity, SanctionType } from '@prisma/client';
import { CommandModule } from '@apptypes/command.types';
import { POLES_CONFIG } from '@config/poles.config';
import { GRADE_LABELS } from '@modules/rh/embeds/rhEmbeds';
import { handleRh } from '@modules/rh/handlers/rhHandler';

const POLE_CHOICES = Object.values(POLES_CONFIG).map((pole) => ({
  name: pole.displayName,
  value: pole.name as string,
}));

const GRADE_CHOICES = Object.values(Grade).map((grade) => ({
  name: GRADE_LABELS[grade],
  value: grade as string,
}));

const SANCTION_TYPE_CHOICES = Object.values(SanctionType).map((type) => ({
  name: type,
  value: type as string,
}));

const SEVERITY_CHOICES = Object.values(SanctionSeverity).map((severity) => ({
  name: severity,
  value: severity as string,
}));

/**
 * `minGrade` est volontairement fixé à RECRUE : la sous-commande `candidature`
 * doit rester ouverte à tous. Chaque sous-commande applique ensuite sa propre
 * règle via `src/modules/rh/permissions.ts`.
 */
const command: CommandModule = {
  data: new SlashCommandBuilder()
    .setName('rh')
    .setDescription('Gestion des ressources humaines')
    .addSubcommand((sub) =>
      sub
        .setName('recruter')
        .setDescription('Ouvrir une candidature pour un candidat externe')
        .addUserOption((opt) => opt.setName('candidat').setDescription('Le candidat').setRequired(true))
        .addStringOption((opt) =>
          opt.setName('pole').setDescription('Pôle visé').setRequired(true).addChoices(...POLE_CHOICES),
        )
        .addStringOption((opt) =>
          opt
            .setName('motivation')
            .setDescription('Motivation du candidat')
            .setRequired(true)
            .setMaxLength(1000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('candidature')
        .setDescription('Déposer votre propre candidature interne')
        .addStringOption((opt) =>
          opt.setName('pole').setDescription('Pôle visé').setRequired(true).addChoices(...POLE_CHOICES),
        )
        .addStringOption((opt) =>
          opt.setName('motivation').setDescription('Votre motivation').setRequired(true).setMaxLength(1000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('promouvoir')
        .setDescription('Promouvoir un membre (Directeur de Pôle et au-dessus)')
        .addUserOption((opt) =>
          opt.setName('membre').setDescription('Membre à promouvoir').setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName('grade').setDescription('Nouveau grade').setRequired(true).addChoices(...GRADE_CHOICES),
        )
        .addStringOption((opt) =>
          opt.setName('motif').setDescription('Motif de la promotion').setMaxLength(500),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('retrograder')
        .setDescription('Rétrograder un membre (Directeur Général et au-dessus)')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre concerné').setRequired(true))
        .addStringOption((opt) =>
          opt.setName('grade').setDescription('Nouveau grade').setRequired(true).addChoices(...GRADE_CHOICES),
        )
        .addStringOption((opt) => opt.setName('motif').setDescription('Motif').setMaxLength(500)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('changer-pole')
        .setDescription('Affecter un membre à un autre pôle')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre concerné').setRequired(true))
        .addStringOption((opt) =>
          opt.setName('pole').setDescription('Nouveau pôle').setRequired(true).addChoices(...POLE_CHOICES),
        )
        .addStringOption((opt) => opt.setName('motif').setDescription('Motif').setMaxLength(500)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('avertir')
        .setDescription("Émettre un avertissement (Chef d'équipe et au-dessus)")
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre concerné').setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName('motif')
            .setDescription("Motif de l'avertissement")
            .setRequired(true)
            .setMaxLength(1000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('sanctionner')
        .setDescription('Émettre une sanction (Responsable et au-dessus)')
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre concerné').setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName('type')
            .setDescription('Type de sanction')
            .setRequired(true)
            .addChoices(...SANCTION_TYPE_CHOICES),
        )
        .addStringOption((opt) =>
          opt.setName('gravite').setDescription('Gravité').setRequired(true).addChoices(...SEVERITY_CHOICES),
        )
        .addStringOption((opt) =>
          opt.setName('motif').setDescription('Motif de la sanction').setRequired(true).setMaxLength(1000),
        )
        .addIntegerOption((opt) =>
          opt
            .setName('duree')
            .setDescription('Durée en jours (vide = permanente)')
            .setMinValue(1)
            .setMaxValue(365),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('historique')
        .setDescription("Consulter le dossier RH d'un membre")
        .addUserOption((opt) => opt.setName('membre').setDescription('Membre (vous par défaut)')),
    ),
  minGrade: Grade.RECRUE,
  execute: handleRh,
};

export default command;
