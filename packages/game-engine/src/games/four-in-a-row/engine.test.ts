import { describe, expect, it } from 'vitest';
import type { GameStatus } from '../../contract.js';
import {
  COLUMN_COUNT,
  type FourInARowState,
  fourInARowEngine as engine,
  ROW_COUNT,
} from './engine.js';

const initial = (): FourInARowState =>
  engine.createInitialState({ playerCount: 2, settings: {}, seed: 'semilla' });

/** Juega las columnas dadas, alternando asientos desde el 0. Falla si alguna se rechaza. */
function play(columns: readonly number[], from: FourInARowState = initial()): FourInARowState {
  let state = from;
  for (const column of columns) {
    const status = engine.getStatus(state);
    if (status.finished) throw new Error('El juego ya terminó');
    const result = engine.applyAction(state, status.activeSeats[0] ?? 0, {
      type: 'DROP_TOKEN',
      column,
    });
    if (!result.ok) throw new Error(`Jugada rechazada en la columna ${column}: ${result.reason}`);
    state = result.value.state;
  }
  return state;
}

/** Una copia sin nada compartido, como la que vuelve de la base de datos. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const finishedWith = (status: GameStatus) => (status.finished ? status.results : null);

/**
 * Llena el tablero sin que nadie alinee cuatro. Cada columna queda, de
 * abajo arriba, con el patrón 0 0 0 1 1 1 o su contrario, de modo que no
 * hay cuatro seguidas en vertical, y las columnas se alternan de dos en
 * dos para que tampoco las haya en horizontal ni en diagonal.
 */
const DRAW_GAME = [
  0, 1, 0, 1, 0, 1, 2, 3, 2, 3, 2, 3, 1, 0, 1, 0, 1, 0, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5,
  4, 5, 4, 6, 6, 6, 6, 6, 6,
];

describe('Cuatro en raya: lo que declara', () => {
  it('es de dos jugadores y se llama four-in-a-row', () => {
    expect(engine.gameSlug).toBe('four-in-a-row');
    expect(engine.gameVersion).toBe('1.0.0');
    expect(engine.metadata.minPlayers).toBe(2);
    expect(engine.metadata.maxPlayers).toBe(2);
  });

  it('ofrece 3, 5 y 10 minutos en tiempo real y todavía nada por turnos', () => {
    expect(engine.metadata.timeControls.REALTIME).toEqual([
      { type: 'TOTAL_PER_PLAYER', totalMs: 180_000 },
      { type: 'TOTAL_PER_PLAYER', totalMs: 300_000 },
      { type: 'TOTAL_PER_PLAYER', totalMs: 600_000 },
    ]);
    expect(engine.metadata.timeControls.TURN_BASED).toEqual([]);
  });

  it('no tiene opciones: solo acepta un objeto vacío', () => {
    expect(engine.parseSettings({})).toEqual({ ok: true, value: {} });
    for (const input of [{ rows: 8 }, null, undefined, 'x', []]) {
      expect(engine.parseSettings(input)).toEqual({ ok: false, code: 'INVALID_SETTINGS' });
    }
  });
});

describe('Cuatro en raya: el inicio', () => {
  it('empieza con el tablero vacío y le toca al asiento 0', () => {
    const state = initial();
    expect(engine.getStatus(state)).toEqual({ finished: false, activeSeats: [0] });

    const view = engine.getView(state, 0);
    expect(view.columnCount).toBe(COLUMN_COUNT);
    expect(view.rowCount).toBe(ROW_COUNT);
    expect(view.cells).toHaveLength(COLUMN_COUNT);
    expect(view.cells.every((column) => column.length === ROW_COUNT)).toBe(true);
    expect(view.cells.flat().every((cell) => cell === null)).toBe(true);
    expect(view.playableColumns).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(view.lastToken).toBeNull();
    expect(view.winningLine).toBeNull();
  });

  it('el estado inicial no depende de la semilla: el juego no tiene azar', () => {
    const other = engine.createInitialState({ playerCount: 2, settings: {}, seed: 'otra' });
    expect(other).toEqual(initial());
  });
});

describe('Cuatro en raya: jugar', () => {
  it('la ficha cae a la casilla libre más baja y el turno pasa al otro asiento', () => {
    const first = engine.applyAction(initial(), 0, { type: 'DROP_TOKEN', column: 3 });
    if (!first.ok) throw new Error('rechazada');
    expect(first.value.action).toEqual({ type: 'DROP_TOKEN', column: 3 });
    expect(first.value.events).toEqual([{ type: 'TOKEN_DROPPED', seat: 0, column: 3, row: 0 }]);
    expect(engine.getStatus(first.value.state)).toEqual({ finished: false, activeSeats: [1] });

    const second = engine.applyAction(first.value.state, 1, { type: 'DROP_TOKEN', column: 3 });
    if (!second.ok) throw new Error('rechazada');
    expect(second.value.events).toEqual([{ type: 'TOKEN_DROPPED', seat: 1, column: 3, row: 1 }]);

    const view = engine.getView(second.value.state, 1);
    expect(view.cells[3]).toEqual([0, 1, null, null, null, null]);
    expect(view.lastToken).toEqual({ seat: 1, column: 3, row: 1 });
  });

  it('no modifica el estado que recibe', () => {
    const state = play([3]);
    const copy = clone(state);
    engine.applyAction(state, 1, { type: 'DROP_TOKEN', column: 3 });
    engine.retireSeat(state, 0, 'RESIGNATION');
    expect(state).toEqual(copy);
  });

  it('es determinista: las mismas jugadas dan el mismo estado', () => {
    expect(play([3, 3, 4, 2, 0])).toEqual(play([3, 3, 4, 2, 0]));
  });

  it('el estado es JSON plano: sobrevive a guardarse y leerse', () => {
    const state = play([3, 3, 4, 2, 0]);
    const restored = engine.restoreState(JSON.parse(JSON.stringify(state)));
    expect(restored).toEqual({ ok: true, value: state });
  });

  it('la vista es la misma para los dos asientos y para quien no juega', () => {
    const state = play([3, 2, 3]);
    expect(engine.getView(state, 1)).toEqual(engine.getView(state, 0));
    expect(engine.getView(state, null)).toEqual(engine.getView(state, 0));
  });
});

describe('Cuatro en raya: jugadas rechazadas', () => {
  it('rechaza a quien juega fuera de turno', () => {
    expect(engine.applyAction(initial(), 1, { type: 'DROP_TOKEN', column: 0 })).toEqual({
      ok: false,
      code: 'NOT_YOUR_TURN',
    });
    expect(engine.applyAction(play([0]), 0, { type: 'DROP_TOKEN', column: 0 })).toEqual({
      ok: false,
      code: 'NOT_YOUR_TURN',
    });
  });

  it('rechaza un asiento que no existe', () => {
    expect(engine.applyAction(initial(), 2, { type: 'DROP_TOKEN', column: 0 })).toEqual({
      ok: false,
      code: 'NOT_YOUR_TURN',
    });
  });

  it('rechaza una columna llena', () => {
    const state = play([0, 0, 0, 0, 0, 0]);
    expect(engine.getView(state, 0).playableColumns).toEqual([1, 2, 3, 4, 5, 6]);
    expect(engine.applyAction(state, 0, { type: 'DROP_TOKEN', column: 0 })).toEqual({
      ok: false,
      code: 'INVALID_ACTION',
      reason: 'COLUMN_FULL',
    });
  });

  it.each([-1, 7, 100])('rechaza la columna %i, que no existe', (column) => {
    expect(engine.applyAction(initial(), 0, { type: 'DROP_TOKEN', column })).toEqual({
      ok: false,
      code: 'INVALID_ACTION',
      reason: 'COLUMN_OUT_OF_RANGE',
    });
  });

  it.each([
    ['nada', undefined],
    ['un texto', 'DROP_TOKEN'],
    ['otro tipo de acción', { type: 'MOVE', column: 1 }],
    ['sin columna', { type: 'DROP_TOKEN' }],
    ['una columna con decimales', { type: 'DROP_TOKEN', column: 1.5 }],
    ['una columna que no es un número', { type: 'DROP_TOKEN', column: '1' }],
    ['una lista', [{ type: 'DROP_TOKEN', column: 1 }]],
  ])('rechaza una acción mal formada: %s', (_name, input) => {
    expect(engine.applyAction(initial(), 0, input)).toEqual({
      ok: false,
      code: 'INVALID_ACTION',
      reason: 'MALFORMED_ACTION',
    });
  });

  it('descarta lo que la acción traiga de más', () => {
    const result = engine.applyAction(initial(), 0, { type: 'DROP_TOKEN', column: 2, extra: 'x' });
    expect(result.ok && result.value.action).toEqual({ type: 'DROP_TOKEN', column: 2 });
  });
});

describe('Cuatro en raya: quién gana', () => {
  it('gana quien alinea cuatro en horizontal', () => {
    const state = play([0, 0, 1, 1, 2, 2, 3]);
    expect(finishedWith(engine.getStatus(state))).toEqual([
      { seat: 0, outcome: 'WIN' },
      { seat: 1, outcome: 'LOSS' },
    ]);
    expect(engine.getView(state, 1).winningLine).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 2, row: 0 },
      { column: 3, row: 0 },
    ]);
  });

  it('gana quien alinea cuatro en vertical', () => {
    const state = play([0, 1, 0, 1, 0, 1, 0]);
    expect(finishedWith(engine.getStatus(state))?.[0]).toEqual({ seat: 0, outcome: 'WIN' });
    expect(engine.getView(state, 0).winningLine).toEqual([
      { column: 0, row: 0 },
      { column: 0, row: 1 },
      { column: 0, row: 2 },
      { column: 0, row: 3 },
    ]);
  });

  it('gana quien alinea cuatro en diagonal ascendente', () => {
    // El asiento 0 ocupa (0,0), (1,1), (2,2) y (3,3).
    const state = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
    expect(finishedWith(engine.getStatus(state))?.[0]).toEqual({ seat: 0, outcome: 'WIN' });
    expect(engine.getView(state, 0).winningLine).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 1 },
      { column: 2, row: 2 },
      { column: 3, row: 3 },
    ]);
  });

  it('gana quien alinea cuatro en diagonal descendente', () => {
    // El asiento 0 ocupa (3,0), (2,1), (1,2) y (0,3).
    const state = play([3, 2, 2, 1, 1, 0, 1, 0, 0, 6, 0]);
    expect(finishedWith(engine.getStatus(state))?.[0]).toEqual({ seat: 0, outcome: 'WIN' });
    expect(engine.getView(state, 0).winningLine).toEqual([
      { column: 0, row: 3 },
      { column: 1, row: 2 },
      { column: 2, row: 1 },
      { column: 3, row: 0 },
    ]);
  });

  it('también puede ganar el asiento 1', () => {
    const state = play([0, 1, 0, 1, 0, 1, 6, 1]);
    expect(finishedWith(engine.getStatus(state))).toEqual([
      { seat: 0, outcome: 'LOSS' },
      { seat: 1, outcome: 'WIN' },
    ]);
  });

  it('la línea se detecta aunque la última ficha caiga en medio, y puede tener más de cuatro', () => {
    // El asiento 0 tiene (0,0), (1,0), (3,0) y (4,0), y completa con (2,0).
    const state = play([0, 0, 1, 1, 3, 3, 4, 4, 2]);
    expect(engine.getView(state, 0).winningLine).toHaveLength(5);
    expect(finishedWith(engine.getStatus(state))?.[0]).toEqual({ seat: 0, outcome: 'WIN' });
  });

  it('tres en línea no bastan', () => {
    expect(engine.getStatus(play([0, 0, 1, 1, 2]))).toEqual({ finished: false, activeSeats: [1] });
  });

  it('con el juego terminado no se puede jugar más', () => {
    const state = play([0, 0, 1, 1, 2, 2, 3]);
    expect(engine.getView(state, 1).playableColumns).toEqual([]);
    expect(engine.applyAction(state, 1, { type: 'DROP_TOKEN', column: 5 })).toEqual({
      ok: false,
      code: 'GAME_ALREADY_FINISHED',
    });
  });

  it('si el tablero se llena sin línea, empate', () => {
    const beforeLast = play(DRAW_GAME.slice(0, -1));
    expect(engine.getStatus(beforeLast).finished).toBe(false);

    const state = play(DRAW_GAME);
    expect(
      engine
        .getView(state, 0)
        .cells.flat()
        .every((cell) => cell !== null),
    ).toBe(true);
    expect(engine.getView(state, 0).winningLine).toBeNull();
    expect(finishedWith(engine.getStatus(state))).toEqual([
      { seat: 0, outcome: 'DRAW' },
      { seat: 1, outcome: 'DRAW' },
    ]);
  });
});

describe('Cuatro en raya: retirar un asiento', () => {
  it.each(['TIMEOUT', 'RESIGNATION', 'ABANDONMENT'] as const)(
    'por %s pierde el retirado y gana el otro, le toque o no',
    (reason) => {
      const state = play([3]);
      for (const seat of [0, 1] as const) {
        const retired = engine.retireSeat(state, seat, reason);
        expect(retired.events).toEqual([]);
        expect(finishedWith(engine.getStatus(retired.state))).toEqual([
          { seat: 0, outcome: seat === 0 ? 'LOSS' : 'WIN' },
          { seat: 1, outcome: seat === 1 ? 'LOSS' : 'WIN' },
        ]);
        expect(engine.getView(retired.state, 0).playableColumns).toEqual([]);
        expect(engine.getView(retired.state, 0).winningLine).toBeNull();
      }
    },
  );

  it('se puede retirar un asiento antes de la primera jugada', () => {
    const retired = engine.retireSeat(initial(), 1, 'RESIGNATION');
    expect(finishedWith(engine.getStatus(retired.state))?.[0]).toEqual({ seat: 0, outcome: 'WIN' });
  });
});

describe('Cuatro en raya: comprobar un estado guardado', () => {
  const valid = play([3, 3, 4]);

  it('acepta el estado inicial, uno a medias, uno ganado y uno con un asiento retirado', () => {
    for (const state of [
      initial(),
      valid,
      play([0, 0, 1, 1, 2, 2, 3]),
      play(DRAW_GAME),
      engine.retireSeat(valid, 1, 'TIMEOUT').state,
    ]) {
      expect(engine.restoreState(clone(state))).toEqual({ ok: true, value: state });
    }
  });

  it.each([
    ['nada', null],
    ['un texto', 'estado'],
    ['una lista', []],
    ['sin columnas', { lastToken: null, retiredSeat: null }],
    ['seis columnas', { ...valid, columns: valid.columns.slice(1) }],
    [
      'una columna con siete fichas',
      { ...play([0, 0, 0, 0, 0, 0]), columns: [[0, 1, 0, 1, 0, 1, 0], [], [], [], [], [], []] },
    ],
    [
      'una ficha de un asiento que no existe',
      { ...valid, columns: [[2], [], [], [0, 1], [0], [], []] },
    ],
    [
      'dos fichas más de un asiento que del otro',
      { ...valid, columns: [[0], [], [], [0, 1], [0], [], []] },
    ],
    [
      'más fichas del asiento 1 que del 0',
      {
        columns: [[1], [], [], [], [], [], []],
        lastToken: { seat: 1, column: 0, row: 0 },
        retiredSeat: null,
      },
    ],
    ['sin última ficha habiendo fichas', { ...valid, lastToken: null }],
    [
      'una última ficha en el tablero vacío',
      { ...initial(), lastToken: { seat: 0, column: 0, row: 0 } },
    ],
    [
      'una última ficha que no está arriba de su columna',
      { ...valid, lastToken: { seat: 0, column: 3, row: 0 } },
    ],
    [
      'una última ficha de quien no jugó el último',
      { ...valid, lastToken: { seat: 1, column: 3, row: 1 } },
    ],
    ['una última ficha fuera del tablero', { ...valid, lastToken: { seat: 0, column: 9, row: 0 } }],
    ['un asiento retirado que no existe', { ...valid, retiredSeat: 3 }],
  ])('rechaza %s', (_name, snapshot) => {
    expect(engine.restoreState(snapshot)).toEqual({ ok: false, code: 'INVALID_GAME_STATE' });
  });
});
