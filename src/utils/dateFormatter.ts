export function formatDate(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Analyse une date saisie au format français `JJ/MM/AAAA`.
 *
 * Vérifie que les composants survivent à la construction du `Date` : `new Date`
 * accepte silencieusement le 31/02 et le décale au 03/03, ce qui donnerait une
 * échéance différente de celle saisie.
 *
 * @returns La date à minuit, ou `null` si la saisie est invalide.
 */
export function parseDueDate(input: string): Date | null {
  const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(year, month - 1, day);

  const isConsistent =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;

  return isConsistent ? date : null;
}

export function formatDuration(start: Date, end: Date): string {
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (diffDays > 0) {
    return `${diffDays}j ${diffHours}h`;
  }
  return `${diffHours}h`;
}
