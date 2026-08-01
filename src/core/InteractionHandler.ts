import ExtendedClient from './Client';
import logger from './Logger';
import { ButtonHandler, ModalHandler, SelectMenuHandler } from '@apptypes/command.types';
import {
  applicationDecisionButton,
  applicationDecisionModal,
} from '@modules/rh/buttons/applicationDecisionButton';
import {
  projectButtons,
  projectCommentModal,
  projectStatusSelect,
} from '@modules/projects/interactions';
import { taskButtons, taskCommentModal, taskStatusSelect } from '@modules/tasks/interactions';
import { announcementPoleSelect } from '@modules/announcements/interactions';
import {
  decisionButtons,
  meetingButtons,
  meetingSummaryModal,
} from '@modules/meetings/interactions';
import { expenseButtons, expenseRefusalModal } from '@modules/expenses/interactions';

/**
 * Enregistre les handlers d'interactions non-slash (boutons, select menus, modals).
 *
 * Contrairement aux commandes et aux events, ces handlers sont déclarés
 * explicitement plutôt que découverts par scan de répertoire : ils sont indexés
 * par préfixe de `customId`, et une collision silencieuse entre deux modules
 * serait bien plus difficile à diagnostiquer qu'un import oublié ici.
 */
export function registerInteractionHandlers(client: ExtendedClient): void {
  const buttons: ButtonHandler[] = [
    applicationDecisionButton,
    projectButtons,
    taskButtons,
    meetingButtons,
    decisionButtons,
    expenseButtons,
  ];
  const selectMenus: SelectMenuHandler[] = [
    projectStatusSelect,
    taskStatusSelect,
    announcementPoleSelect,
  ];
  const modals: ModalHandler[] = [
    applicationDecisionModal,
    projectCommentModal,
    taskCommentModal,
    meetingSummaryModal,
    expenseRefusalModal,
  ];

  for (const handler of buttons) {
    assertFree(client.buttons, handler.customIdPrefix, 'bouton');
    client.buttons.set(handler.customIdPrefix, handler);
  }

  for (const handler of selectMenus) {
    assertFree(client.selectMenus, handler.customIdPrefix, 'select menu');
    client.selectMenus.set(handler.customIdPrefix, handler);
  }

  for (const handler of modals) {
    assertFree(client.modals, handler.customIdPrefix, 'modal');
    client.modals.set(handler.customIdPrefix, handler);
  }

  logger.info(
    `✓ ${buttons.length} bouton(s), ${selectMenus.length} select menu(s), ${modals.length} modal(s) enregistré(s)`,
  );
}

/** Deux handlers partageant un préfixe se masqueraient l'un l'autre. */
function assertFree(collection: Map<string, unknown>, prefix: string, kind: string): void {
  if (collection.has(prefix)) {
    throw new Error(`Conflit de préfixe ${kind} : "${prefix}" est déjà enregistré.`);
  }
}
