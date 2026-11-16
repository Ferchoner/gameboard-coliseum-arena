import type { GameEngine, GameEvent, GameMetadata } from '../contract.js';

interface CounterState {
  readonly count: number;
  readonly playerCount: number;
  readonly retired: readonly number[];
}

/**
 * Motor mínimo para probar el registro y el catálogo sin depender de un
 * juego real. Cada asiento suma uno por turno y el juego termina en empate
 * al llegar a tres. Se expone por la entrada `testing` del paquete y ningún
 * código de producción debe importarlo.
 */
export function createFakeEngine(
  gameSlug: string,
  gameVersion: string,
  metadata?: Partial<GameMetadata>,
): GameEngine<
  Record<string, never>,
  CounterState,
  { readonly type: 'INCREMENT' },
  GameEvent,
  CounterState
> {
  return {
    gameSlug,
    gameVersion,
    metadata: {
      minPlayers: 2,
      maxPlayers: 2,
      timeControls: {
        REALTIME: [{ type: 'TOTAL_PER_PLAYER', totalMs: 300_000 }],
        TURN_BASED: [],
      },
      ...metadata,
    },
    parseSettings(input) {
      if (input === undefined || (typeof input === 'object' && input !== null)) {
        return { ok: true, value: {} };
      }
      return { ok: false, code: 'INVALID_SETTINGS' };
    },
    createInitialState(setup) {
      return { count: 0, playerCount: setup.playerCount, retired: [] };
    },
    restoreState(snapshot) {
      if (
        typeof snapshot === 'object' &&
        snapshot !== null &&
        typeof (snapshot as CounterState).count === 'number'
      ) {
        return { ok: true, value: snapshot as CounterState };
      }
      return { ok: false, code: 'INVALID_GAME_STATE' };
    },
    getStatus(state) {
      const playing = Array.from({ length: state.playerCount }, (_, seat) => seat).filter(
        (seat) => !state.retired.includes(seat),
      );
      if (state.count >= 3 || playing.length < 2) {
        return {
          finished: true,
          results: Array.from({ length: state.playerCount }, (_, seat) => ({
            seat,
            outcome: state.retired.includes(seat) ? 'LOSS' : playing.length < 2 ? 'WIN' : 'DRAW',
          })),
        };
      }
      return { finished: false, activeSeats: [playing[state.count % playing.length] ?? 0] };
    },
    applyAction(state, seat, input) {
      const status = this.getStatus(state);
      if (status.finished) return { ok: false, code: 'GAME_ALREADY_FINISHED' };
      if (!status.activeSeats.includes(seat)) return { ok: false, code: 'NOT_YOUR_TURN' };
      if (
        typeof input !== 'object' ||
        input === null ||
        (input as { type?: unknown }).type !== 'INCREMENT'
      ) {
        return { ok: false, code: 'INVALID_ACTION' };
      }
      return {
        ok: true,
        value: {
          state: { ...state, count: state.count + 1 },
          action: { type: 'INCREMENT' },
          events: [{ type: 'INCREMENTED' }],
        },
      };
    },
    retireSeat(state, seat) {
      return { state: { ...state, retired: [...state.retired, seat] }, events: [] };
    },
    getView(state) {
      return state;
    },
  };
}
