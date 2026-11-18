import type { MatchSummaryView } from '@gameboard/contracts';

/**
 * La lista de las partidas en curso del jugador, tal como la lleva la
 * aplicación: se pide a la API al conectar y la ponen al día los avisos
 * personales de cada partida (protocolo, decisión T4; ADR-016, decisión N2).
 */

/** Cómo queda la lista tras un aviso personal, y si con él empieza su turno. */
export interface SummaryUpdate {
  readonly items: readonly MatchSummaryView[];
  /** Le toca ahora en una partida por turnos y antes no le tocaba. Es lo que merece un aviso. */
  readonly turnStarted: boolean;
}

export function applySummary(
  items: readonly MatchSummaryView[],
  summary: MatchSummaryView,
): SummaryUpdate {
  const previous = items.find((item) => item.matchId === summary.matchId);
  const others = items.filter((item) => item.matchId !== summary.matchId);
  const ongoing = summary.status === 'IN_PROGRESS';
  return {
    items: ongoing ? [...others, summary] : others,
    turnStarted:
      ongoing && summary.mode === 'TURN_BASED' && summary.yourTurn && !previous?.yourTurn,
  };
}

const deadlineOf = (item: MatchSummaryView): number =>
  item.turnDeadlineAt === null ? Number.POSITIVE_INFINITY : Date.parse(item.turnDeadlineAt);

const startOf = (item: MatchSummaryView): number => Date.parse(item.startedAt);

/**
 * Primero las partidas en las que le toca, de la que vence antes a la que
 * vence después. Después las demás, de la más reciente a la más antigua,
 * como las da la API (ADR-016, decisión N3).
 */
export function sortInProgress(items: readonly MatchSummaryView[]): MatchSummaryView[] {
  const mine = items.filter((item) => item.yourTurn).sort((a, b) => deadlineOf(a) - deadlineOf(b));
  const theirs = items.filter((item) => !item.yourTurn).sort((a, b) => startOf(b) - startOf(a));
  return [...mine, ...theirs];
}

/** En cuántas partidas le toca. */
export function yourTurnCount(items: readonly MatchSummaryView[]): number {
  return items.filter((item) => item.yourTurn).length;
}

/** El título de la pestaña, con el número de partidas en las que le toca delante. */
export function titleWithTurns(title: string, count: number): string {
  return count > 0 ? `(${count}) ${title}` : title;
}
