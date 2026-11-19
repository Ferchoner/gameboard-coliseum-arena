import type { MatchPlayerView, MatchView } from '@gameboard/contracts';
import { describe, expect, it } from 'vitest';
import { fourInARowTexts } from '../games/four-in-a-row';
import { es } from '../i18n/es';
import {
  abandonAfter,
  clockAfter,
  endReasonText,
  formatClock,
  formatMatchClock,
  formatTurnClock,
  outcomeOf,
  rejectionText,
  rivalNames,
  shouldRefreshAfter,
  supersedes,
  youAbandoned,
  youRetired,
} from './matches';

function player(seat: number, displayName: string, clockRemainingMs = 300_000): MatchPlayerView {
  return {
    seat,
    playerId: `player-${seat}`,
    username: displayName.toLowerCase(),
    displayName,
    connected: true,
    clockRemainingMs,
    abandonAt: null,
    retired: false,
  };
}

function match(overrides: Partial<MatchView> = {}): MatchView {
  return {
    matchId: 'match-1',
    roomId: 'room-1',
    gameSlug: 'four-in-a-row',
    gameVersion: '1.0.0',
    mode: 'REALTIME',
    timeControl: { type: 'TOTAL_PER_PLAYER', totalMs: 300_000 },
    status: 'IN_PROGRESS',
    stateVersion: 3,
    yourSeat: 0,
    players: [player(0, 'Ana'), player(1, 'Bea')],
    activeSeats: [1],
    turnDeadlineAt: '2026-11-16T00:05:00.000Z',
    view: null,
    result: null,
    abortReason: null,
    startedAt: '2026-11-16T00:00:00.000Z',
    endedAt: null,
    ...overrides,
  };
}

const finished = (
  reason: 'COMPLETED' | 'TIMEOUT' | 'RESIGNATION' | 'ABANDONMENT',
  winner: number,
) =>
  match({
    status: 'FINISHED',
    activeSeats: [],
    result: {
      reason,
      seats: [
        { seat: 0, outcome: winner === 0 ? 'WIN' : 'LOSS' },
        { seat: 1, outcome: winner === 1 ? 'WIN' : 'LOSS' },
      ],
    },
  });

describe('relojes de una partida', () => {
  it('corre solo el reloj de quien puede jugar', () => {
    const current = match();
    const [ana, bea] = current.players as [MatchPlayerView, MatchPlayerView];

    expect(clockAfter(current, bea, 12_000)).toBe(288_000);
    expect(clockAfter(current, ana, 12_000)).toBe(300_000);
  });

  it('nunca baja de cero ni sube si el reloj del navegador retrocede', () => {
    const current = match();
    const bea = current.players[1] as MatchPlayerView;

    expect(clockAfter(current, bea, 999_000)).toBe(0);
    expect(clockAfter(current, bea, -5_000)).toBe(300_000);
  });

  it('en una partida terminada ningún reloj corre', () => {
    const current = finished('COMPLETED', 0);
    const bea = current.players[1] as MatchPlayerView;

    expect(clockAfter({ ...current, activeSeats: [1] }, bea, 60_000)).toBe(300_000);
  });

  it('se escribe en minutos y segundos, y solo marca cero cuando no queda nada', () => {
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(247_400)).toBe('4:08');
    expect(formatClock(9_000)).toBe('0:09');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-50)).toBe('0:00');
    expect(formatClock(3 * 3_600_000 + 5 * 60_000 + 7_000)).toBe('3:05:07');
  });

  it('por turnos se escribe en horas y minutos, y en la última hora como en tiempo real', () => {
    expect(formatTurnClock(12 * 3_600_000)).toBe('12 h 00 min');
    expect(formatTurnClock(35 * 3_600_000 + 59 * 60_000 + 59_000)).toBe('35 h 59 min');
    expect(formatTurnClock(3_600_000)).toBe('1 h 00 min');
    expect(formatTurnClock(3_600_000 - 1)).toBe('1 h 00 min');
    expect(formatTurnClock(3_599_000)).toBe('59:59');
    expect(formatTurnClock(59 * 60_000)).toBe('59:00');
    expect(formatTurnClock(0)).toBe('0:00');
    expect(formatMatchClock('TURN_BASED', 2 * 3_600_000)).toBe('2 h 00 min');
    expect(formatMatchClock('REALTIME', 2 * 3_600_000)).toBe('2:00:00');
  });
});

describe('cuenta atrás del abandono', () => {
  const serverTime = '2026-11-16T00:01:00.000Z';
  const absent = { abandonAt: '2026-11-16T00:02:42.000Z' };

  it('cuenta desde la hora del servidor con la que llegó la partida', () => {
    expect(abandonAfter(match(), absent, serverTime, 0)).toBe(102_000);
    expect(abandonAfter(match(), absent, serverTime, 2_000)).toBe(100_000);
    expect(formatClock(abandonAfter(match(), absent, serverTime, 0) ?? 0)).toBe('1:42');
  });

  it('no baja de cero', () => {
    expect(abandonAfter(match(), absent, serverTime, 500_000)).toBe(0);
  });

  it('no hay cuenta atrás si el jugador no falta o si la partida ya no está en curso', () => {
    expect(abandonAfter(match(), { abandonAt: null }, serverTime, 0)).toBeNull();
    expect(abandonAfter(finished('ABANDONMENT', 0), absent, serverTime, 0)).toBeNull();
  });

  it('sabe si quien mira perdió por abandono', () => {
    expect(youAbandoned(finished('ABANDONMENT', 1))).toBe(true);
    expect(youAbandoned(finished('ABANDONMENT', 0))).toBe(false);
    expect(youAbandoned(finished('RESIGNATION', 1))).toBe(false);
  });

  it('sabe si quien mira se retiró de una partida que siguió sin él', () => {
    const retiredPlayer = { ...player(0, 'Ana'), retired: true };
    const three = [player(0, 'Ana'), player(1, 'Bea'), player(2, 'Carla')];

    expect(youRetired(match({ players: three }))).toBe(false);
    expect(youRetired(match({ players: [retiredPlayer, ...three.slice(1)] }))).toBe(true);
    expect(youRetired(match({ players: [retiredPlayer, ...three.slice(1)], yourSeat: 1 }))).toBe(
      false,
    );
  });
});

describe('estado de una partida', () => {
  it('un estado más antiguo que el que se muestra se descarta', () => {
    const current = match({ stateVersion: 3 });

    expect(supersedes(null, current)).toBe(true);
    expect(supersedes(current, match({ stateVersion: 4 }))).toBe(true);
    // La misma versión puede traer un cambio de presencia o el final por anulación.
    expect(supersedes(current, match({ stateVersion: 3 }))).toBe(true);
    expect(supersedes(current, match({ stateVersion: 2 }))).toBe(false);
    expect(supersedes(current, match({ matchId: 'otra', stateVersion: 0 }))).toBe(true);
  });

  it('dice el resultado de un asiento y quiénes son los rivales', () => {
    const current = finished('COMPLETED', 1);

    expect(outcomeOf(current, 0)).toBe('LOSS');
    expect(outcomeOf(current, 1)).toBe('WIN');
    expect(outcomeOf(match(), 0)).toBeNull();
    expect(rivalNames(current)).toBe('Bea');
    expect(rivalNames({ ...current, yourSeat: 1 })).toBe('Ana');
  });
});

describe('cómo terminó una partida', () => {
  it('cuenta el tiempo agotado, la rendición y el abandono a quien pierde y a quien gana', () => {
    expect(endReasonText(finished('TIMEOUT', 1))).toBe('Se te acabó el tiempo.');
    expect(endReasonText(finished('TIMEOUT', 0))).toBe('A Bea se le acabó el tiempo.');
    expect(endReasonText(finished('RESIGNATION', 1))).toBe('Te rendiste.');
    expect(endReasonText(finished('RESIGNATION', 0))).toBe('Bea se rindió.');
    expect(endReasonText(finished('ABANDONMENT', 0))).toBe('Bea abandonó la partida.');
    expect(endReasonText(finished('COMPLETED', 0))).toBe(es.match.endReasons.COMPLETED);
    expect(endReasonText(match())).toBe('');
  });

  it('Cuatro en raya cuenta si hubo cuatro en línea o si el tablero se llenó', () => {
    const ui = fourInARowTexts;
    const empty = Array.from({ length: 7 }, () => Array.from({ length: 6 }, () => null));
    const full = empty.map((column) => column.map(() => 0));

    expect(ui.endText({ cells: full, winningLine: [{ column: 0, row: 0 }] })).toBe(
      'Cuatro en línea.',
    );
    expect(ui.endText({ cells: full, winningLine: null })).toBe(
      'El tablero se llenó sin cuatro en línea.',
    );
    // Si alguien se rindió con el tablero a medias, el juego no tiene nada que añadir.
    expect(ui.endText({ cells: empty, winningLine: null })).toBeNull();
  });
});

describe('órdenes de juego rechazadas', () => {
  it('usa el texto del motivo del juego, y si no lo conoce, el del código', () => {
    const reasons = fourInARowTexts.rejections;

    expect(
      rejectionText({ ok: false, code: 'INVALID_ACTION', reason: 'COLUMN_FULL' }, reasons),
    ).toBe('Esa columna está llena.');
    expect(rejectionText({ ok: false, code: 'INVALID_ACTION', reason: 'OTRO' }, reasons)).toBe(
      es.errors.INVALID_ACTION,
    );
    expect(rejectionText({ ok: false, code: 'NOT_YOUR_TURN' })).toBe(es.errors.NOT_YOUR_TURN);
    expect(rejectionText({ ok: false, code: 'NOT_CONNECTED' })).toBe(es.match.notConnected);
  });

  it('vuelve a pedir la partida cuando el rechazo dice que cambió', () => {
    for (const code of [
      'STALE_STATE_VERSION',
      'NOT_YOUR_TURN',
      'CLOCK_EXPIRED',
      'MATCH_NOT_IN_PROGRESS',
    ] as const) {
      expect(shouldRefreshAfter({ ok: false, code })).toBe(true);
    }
    expect(shouldRefreshAfter({ ok: false, code: 'INVALID_ACTION' })).toBe(false);
    expect(shouldRefreshAfter({ ok: false, code: 'NOT_CONNECTED' })).toBe(false);
    expect(shouldRefreshAfter({ ok: true })).toBe(false);
  });
});
