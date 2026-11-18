import type { MatchSummaryView } from '@gameboard/contracts';
import { describe, expect, it } from 'vitest';
import { applySummary, sortInProgress, titleWithTurns, yourTurnCount } from './my-matches';

function summary(overrides: Partial<MatchSummaryView> = {}): MatchSummaryView {
  return {
    matchId: 'match-1',
    roomId: 'room-1',
    gameSlug: 'four-in-a-row',
    mode: 'TURN_BASED',
    status: 'IN_PROGRESS',
    yourTurn: false,
    turnDeadlineAt: '2026-11-19T08:00:00.000Z',
    opponents: [{ playerId: 'player-2', username: 'ana', displayName: 'Ana' }],
    yourOutcome: null,
    endReason: null,
    startedAt: '2026-11-18T08:00:00.000Z',
    endedAt: null,
    ...overrides,
  };
}

describe('lista de partidas en curso', () => {
  it('un aviso añade la partida, la sustituye o la quita si terminó', () => {
    const first = applySummary([], summary());
    expect(first.items).toEqual([summary()]);

    const updated = applySummary(first.items, summary({ yourTurn: true }));
    expect(updated.items).toEqual([summary({ yourTurn: true })]);

    const ended = applySummary(updated.items, summary({ status: 'FINISHED' }));
    expect(ended.items).toEqual([]);
  });

  it('avisa solo cuando empieza su turno en una partida por turnos', () => {
    expect(applySummary([], summary({ yourTurn: true })).turnStarted).toBe(true);
    expect(
      applySummary([summary({ yourTurn: true })], summary({ yourTurn: true })).turnStarted,
    ).toBe(false);
    expect(applySummary([summary()], summary({ yourTurn: false })).turnStarted).toBe(false);
    expect(applySummary([], summary({ yourTurn: true, mode: 'REALTIME' })).turnStarted).toBe(false);
    expect(
      applySummary([summary()], summary({ yourTurn: true, status: 'FINISHED' })).turnStarted,
    ).toBe(false);
  });

  it('pone primero las de su turno, de la que vence antes a la que vence después', () => {
    const later = summary({
      matchId: 'later',
      yourTurn: true,
      turnDeadlineAt: '2026-11-20T00:00:00Z',
    });
    const sooner = summary({
      matchId: 'sooner',
      yourTurn: true,
      turnDeadlineAt: '2026-11-19T00:00:00Z',
    });
    const old = summary({ matchId: 'old', startedAt: '2026-11-01T00:00:00Z' });
    const recent = summary({ matchId: 'recent', startedAt: '2026-11-17T00:00:00Z' });

    expect(sortInProgress([old, later, recent, sooner]).map((item) => item.matchId)).toEqual([
      'sooner',
      'later',
      'recent',
      'old',
    ]);
  });

  it('cuenta las partidas en las que le toca y lo pone en el título', () => {
    const items = [
      summary({ yourTurn: true }),
      summary({ matchId: 'b' }),
      summary({ matchId: 'c', yourTurn: true }),
    ];
    expect(yourTurnCount(items)).toBe(2);
    expect(titleWithTurns('Mis partidas', 2)).toBe('(2) Mis partidas');
    expect(titleWithTurns('Mis partidas', 0)).toBe('Mis partidas');
  });
});
