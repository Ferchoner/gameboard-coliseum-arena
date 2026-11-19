import { describe, expect, it } from 'vitest';
import type { GameStatus } from '../../contract.js';
import { checkFleet, FLEET, navalBattleEngine as engine, type NavalBattleState } from './engine.js';
import type { NavalBattleCell, NavalBattlePlacement, NavalBattleView } from './types.js';

const initial = (): NavalBattleState =>
  engine.createInitialState({ playerCount: 2, settings: {}, seed: 'semilla' });

/** Cinco barcos en horizontal, en las filas 0, 2, 4, 6 y 8, desde la columna 0. */
const FLEET_A: readonly NavalBattlePlacement[] = [
  { ship: 'S5', row: 0, col: 0, orientation: 'H' },
  { ship: 'S4', row: 2, col: 0, orientation: 'H' },
  { ship: 'S3A', row: 4, col: 0, orientation: 'H' },
  { ship: 'S3B', row: 6, col: 0, orientation: 'H' },
  { ship: 'S2', row: 8, col: 0, orientation: 'H' },
];

/** Cinco barcos en vertical, en las columnas 1, 3, 5, 7 y 9, desde la fila 0. */
const FLEET_B: readonly NavalBattlePlacement[] = [
  { ship: 'S5', row: 0, col: 1, orientation: 'V' },
  { ship: 'S4', row: 0, col: 3, orientation: 'V' },
  { ship: 'S3A', row: 0, col: 5, orientation: 'V' },
  { ship: 'S3B', row: 0, col: 7, orientation: 'V' },
  { ship: 'S2', row: 0, col: 9, orientation: 'V' },
];

/** Las casillas de una flota, en orden. */
const cellsOf = (fleet: readonly NavalBattlePlacement[]): NavalBattleCell[] =>
  fleet.flatMap(({ ship, row, col, orientation }) => {
    const size = FLEET.find((one) => one.ship === ship)?.size ?? 0;
    return Array.from({ length: size }, (_, step) =>
      orientation === 'H' ? { row, col: col + step } : { row: row + step, col },
    );
  });

/** Una casilla de agua para cada flota: ninguna de las dos tiene barco en la fila 9, columna 0. */
const WATER: NavalBattleCell = { row: 9, col: 0 };

function apply(state: NavalBattleState, seat: number, action: unknown): NavalBattleState {
  const result = engine.applyAction(state, seat, action);
  if (!result.ok) throw new Error(`Rechazada: ${result.code} ${result.reason ?? ''}`);
  return result.value.state;
}

/** Los dos colocan: el 0, la flota A; el 1, la B. */
function placed(): NavalBattleState {
  const state = apply(initial(), 0, { type: 'PLACE_FLEET', ships: FLEET_A });
  return apply(state, 1, { type: 'PLACE_FLEET', ships: FLEET_B });
}

/** Una copia sin nada compartido, como la que vuelve de la base de datos. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const finishedWith = (status: GameStatus) => (status.finished ? status.results : null);
const activeOf = (status: GameStatus) => (status.finished ? null : status.activeSeats);

/**
 * Juega por turnos desde `state`: el 0 dispara a las casillas de `zero` y
 * el 1, a las de `one`, alternando desde el 0.
 */
function fire(
  state: NavalBattleState,
  zero: readonly NavalBattleCell[],
  one: readonly NavalBattleCell[],
): NavalBattleState {
  let current = state;
  for (let index = 0; index < Math.max(zero.length, one.length); index += 1) {
    const a = zero[index];
    if (a) current = apply(current, 0, { type: 'FIRE', ...a });
    const b = one[index];
    if (b) current = apply(current, 1, { type: 'FIRE', ...b });
  }
  return current;
}

/** Casillas de agua para el 1 contra la flota A, distintas entre sí. */
const waterAgainstA = (count: number): NavalBattleCell[] => {
  const occupied = cellsOf(FLEET_A);
  const free: NavalBattleCell[] = [];
  for (let row = 0; row < 10 && free.length < count; row += 1) {
    for (let col = 0; col < 10 && free.length < count; col += 1) {
      if (!occupied.some((cell) => cell.row === row && cell.col === col)) free.push({ row, col });
    }
  }
  return free;
};

describe('Batalla naval: lo que declara', () => {
  it('es de dos jugadores y se llama naval-battle', () => {
    expect(engine.gameSlug).toBe('naval-battle');
    expect(engine.gameVersion).toBe('1.0.0');
    expect(engine.metadata.minPlayers).toBe(2);
    expect(engine.metadata.maxPlayers).toBe(2);
  });

  it('ofrece 10, 15 y 20 minutos en tiempo real y 12, 24 y 36 horas por turnos (X12)', () => {
    expect(engine.metadata.timeControls.REALTIME.map((one) => one.totalMs)).toEqual([
      600_000, 900_000, 1_200_000,
    ]);
    expect(engine.metadata.timeControls.TURN_BASED.map((one) => one.totalMs)).toEqual([
      12 * 3_600_000,
      24 * 3_600_000,
      36 * 3_600_000,
    ]);
  });

  it('no tiene opciones', () => {
    expect(engine.parseSettings({})).toEqual({ ok: true, value: {} });
    expect(engine.parseSettings({ tablero: 12 })).toEqual({
      ok: false,
      code: 'INVALID_SETTINGS',
    });
  });
});

describe('Batalla naval: colocación', () => {
  it('al empezar, los dos asientos están activos a la vez (X5)', () => {
    expect(activeOf(engine.getStatus(initial()))).toEqual([0, 1]);
  });

  it('quien coloca deja de estar activo y el otro sigue', () => {
    const state = apply(initial(), 1, { type: 'PLACE_FLEET', ships: FLEET_B });
    expect(activeOf(engine.getStatus(state))).toEqual([0]);
  });

  it('el evento de colocar no lleva la flota (M8)', () => {
    const result = engine.applyAction(initial(), 0, { type: 'PLACE_FLEET', ships: FLEET_A });
    expect(result.ok && result.value.events).toEqual([{ type: 'FLEET_PLACED', seat: 0 }]);
  });

  it('guarda la flota en el orden de los barcos, aunque llegue en otro', () => {
    const result = engine.applyAction(initial(), 0, {
      type: 'PLACE_FLEET',
      ships: [...FLEET_A].reverse(),
    });
    expect(result.ok && result.value.action).toEqual({ type: 'PLACE_FLEET', ships: FLEET_A });
  });

  it('tras colocar los dos, dispara el asiento 0 (X6)', () => {
    expect(activeOf(engine.getStatus(placed()))).toEqual([0]);
  });

  it('no se puede colocar dos veces', () => {
    const state = apply(initial(), 0, { type: 'PLACE_FLEET', ships: FLEET_A });
    expect(engine.applyAction(state, 0, { type: 'PLACE_FLEET', ships: FLEET_B })).toEqual({
      ok: false,
      code: 'NOT_YOUR_TURN',
    });
  });

  it.each([
    ['falta un barco', FLEET_A.slice(1), 'INVALID_FLEET'],
    ['un barco repetido', [...FLEET_A.slice(0, 4), { ...FLEET_A[3], row: 8 }], 'INVALID_FLEET'],
    ['un barco fuera', [{ ...FLEET_A[0], col: 6 }, ...FLEET_A.slice(1)], 'SHIP_OUT_OF_BOUNDS'],
    [
      'dos barcos en la misma casilla',
      [...FLEET_A.slice(0, 4), { ship: 'S2', row: 0, col: 3, orientation: 'V' }],
      'SHIPS_OVERLAP',
    ],
    [
      'dos barcos que se tocan',
      [...FLEET_A.slice(0, 4), { ship: 'S2', row: 1, col: 0, orientation: 'H' }],
      'SHIPS_TOUCHING',
    ],
    [
      'dos barcos que se tocan en diagonal',
      [...FLEET_A.slice(0, 4), { ship: 'S2', row: 1, col: 5, orientation: 'H' }],
      'SHIPS_TOUCHING',
    ],
  ] as const)('rechaza una flota con %s', (_, ships, reason) => {
    expect(engine.applyAction(initial(), 0, { type: 'PLACE_FLEET', ships })).toEqual({
      ok: false,
      code: 'INVALID_ACTION',
      reason,
    });
  });

  it('admite barcos en la última fila y la última columna', () => {
    expect(Array.isArray(checkFleet(FLEET_B))).toBe(true);
    const corner: NavalBattlePlacement[] = [
      { ship: 'S5', row: 9, col: 5, orientation: 'H' },
      ...FLEET_B.slice(1, 4),
      { ship: 'S2', row: 8, col: 0, orientation: 'V' },
    ];
    expect(Array.isArray(checkFleet(corner))).toBe(true);
  });

  it('rechaza las acciones mal formadas y disparar durante la colocación', () => {
    const state = initial();
    for (const action of [
      null,
      { type: 'PLACE_FLEET' },
      { type: 'PLACE_FLEET', ships: [{ ship: 'S9', row: 0, col: 0, orientation: 'H' }] },
      { type: 'PLACE_FLEET', ships: [{ ship: 'S5', row: 0, col: 0, orientation: 'D' }] },
      { type: 'FIRE', row: 'a', col: 0 },
      { type: 'OTRA_COSA' },
    ]) {
      expect(engine.applyAction(state, 0, action)).toEqual({
        ok: false,
        code: 'INVALID_ACTION',
        reason: 'MALFORMED_ACTION',
      });
    }
    expect(engine.applyAction(state, 0, { type: 'FIRE', row: 0, col: 0 })).toEqual({
      ok: false,
      code: 'INVALID_ACTION',
      reason: 'WRONG_PHASE',
    });
  });
});

describe('Batalla naval: disparos', () => {
  it('agua, tocado y hundido, y el turno pasa aunque acierte (X7)', () => {
    let state = placed();
    // El 0 dispara a la columna 9 de la fila 0: el destructor del 1, que tiene dos casillas.
    let result = engine.applyAction(state, 0, { type: 'FIRE', row: 0, col: 9 });
    expect(result.ok && result.value.events).toEqual([
      { type: 'SHOT_FIRED', seat: 0, row: 0, col: 9, result: 'HIT' },
    ]);
    state = result.ok ? result.value.state : state;
    expect(activeOf(engine.getStatus(state))).toEqual([1]);

    result = engine.applyAction(state, 1, { type: 'FIRE', ...WATER });
    expect(result.ok && result.value.events).toEqual([
      { type: 'SHOT_FIRED', seat: 1, ...WATER, result: 'MISS' },
    ]);
    state = result.ok ? result.value.state : state;

    result = engine.applyAction(state, 0, { type: 'FIRE', row: 1, col: 9 });
    expect(result.ok && result.value.events).toEqual([
      { type: 'SHOT_FIRED', seat: 0, row: 1, col: 9, result: 'SUNK' },
      {
        type: 'SHIP_SUNK',
        seat: 1,
        ship: 'S2',
        cells: [
          { row: 0, col: 9 },
          { row: 1, col: 9 },
        ],
      },
    ]);
  });

  it('rechaza disparar fuera, repetir casilla y colocar durante los disparos', () => {
    const state = apply(placed(), 0, { type: 'FIRE', row: 0, col: 0 });
    const after = apply(state, 1, { type: 'FIRE', row: 0, col: 0 });
    expect(engine.applyAction(after, 0, { type: 'FIRE', row: 10, col: 0 })).toMatchObject({
      reason: 'CELL_OUT_OF_RANGE',
    });
    expect(engine.applyAction(after, 0, { type: 'FIRE', row: 0, col: 0 })).toMatchObject({
      reason: 'CELL_ALREADY_FIRED',
    });
    expect(engine.applyAction(after, 0, { type: 'PLACE_FLEET', ships: FLEET_A })).toMatchObject({
      reason: 'WRONG_PHASE',
    });
    expect(engine.applyAction(after, 1, { type: 'FIRE', row: 5, col: 5 })).toEqual({
      ok: false,
      code: 'NOT_YOUR_TURN',
    });
  });

  it('gana quien hunde toda la flota rival', () => {
    const targets = cellsOf(FLEET_B);
    const state = fire(placed(), targets, waterAgainstA(targets.length - 1));
    expect(finishedWith(engine.getStatus(state))).toEqual([
      { seat: 0, outcome: 'WIN' },
      { seat: 1, outcome: 'LOSS' },
    ]);
    expect(engine.applyAction(state, 1, { type: 'FIRE', row: 9, col: 9 })).toEqual({
      ok: false,
      code: 'GAME_ALREADY_FINISHED',
    });
  });

  it('también puede ganar el asiento 1', () => {
    const targets = cellsOf(FLEET_A);
    // El 0 dispara a casillas de agua contra la flota B: la fila 9, de la columna 0 a la 8, y la 8.
    const water = Array.from({ length: 10 }, (_, col) => ({ row: 9, col }))
      .concat(Array.from({ length: 10 }, (_, col) => ({ row: 8, col })))
      .filter((cell) => !cellsOf(FLEET_B).some((b) => b.row === cell.row && b.col === cell.col));
    const state = fire(placed(), water.slice(0, targets.length), targets);
    expect(finishedWith(engine.getStatus(state))).toEqual([
      { seat: 0, outcome: 'LOSS' },
      { seat: 1, outcome: 'WIN' },
    ]);
  });

  it('quien se retira pierde, también durante la colocación (7.18)', () => {
    for (const reason of ['TIMEOUT', 'RESIGNATION', 'ABANDONMENT'] as const) {
      const { state } = engine.retireSeat(initial(), 0, reason);
      expect(finishedWith(engine.getStatus(state))).toEqual([
        { seat: 0, outcome: 'LOSS' },
        { seat: 1, outcome: 'WIN' },
      ]);
    }
  });
});

describe('Batalla naval: vista', () => {
  /** El 0 ha tocado el portaaviones del 1 y el 1 ha disparado al agua. */
  const midGame = () => fire(placed(), [{ row: 0, col: 1 }], [WATER]);

  const shipCellsIn = (view: NavalBattleView, owner: number) =>
    view.grids[owner]?.ships?.flatMap((ship) => ship.cells) ?? [];

  it('cada uno ve su flota y no la del rival (X10)', () => {
    const view = engine.getView(midGame(), 0);
    expect(shipCellsIn(view, 0)).toEqual(cellsOf(FLEET_A));
    expect(view.grids[1]?.ships).toBeNull();
    expect(view.grids[1]?.shots).toEqual([{ row: 0, col: 1, result: 'HIT' }]);
    expect(view.grids[0]?.shots).toEqual([{ ...WATER, result: 'MISS' }]);
  });

  it('ninguna parte de la vista de un asiento contiene una casilla de un barco rival sin hundir', () => {
    // La flota A tiene barcos en las filas 0, 2, 4, 6 y 8; el 1 solo ha disparado a la 9.
    const text = JSON.stringify(engine.getView(midGame(), 1).grids[0]);
    for (const row of [0, 2, 4, 6, 8]) expect(text).not.toContain(`"row":${row}`);
  });

  it('quien no ocupa asiento no ve ninguna flota', () => {
    const view = engine.getView(midGame(), null);
    expect(view.grids.map((grid) => grid.ships)).toEqual([null, null]);
    expect(view.lastShot).toEqual({ seat: 1, ...WATER });
  });

  it('los barcos hundidos los ven los dos (X8)', () => {
    const state = fire(
      placed(),
      [
        { row: 0, col: 9 },
        { row: 1, col: 9 },
      ],
      waterAgainstA(2),
    );
    for (const viewer of [0, 1, null]) {
      expect(engine.getView(state, viewer).grids[1]?.sunk).toEqual([
        {
          ship: 'S2',
          cells: [
            { row: 0, col: 9 },
            { row: 1, col: 9 },
          ],
        },
      ]);
    }
  });

  it('dice si cada uno ya colocó y en qué fase está el juego', () => {
    const state = apply(initial(), 1, { type: 'PLACE_FLEET', ships: FLEET_B });
    const view = engine.getView(state, 0);
    expect(view.phase).toBe('PLACEMENT');
    expect(view.grids.map((grid) => grid.placed)).toEqual([false, true]);
    expect(engine.getView(placed(), 0).phase).toBe('FIRING');
  });
});

describe('Batalla naval: estado guardado', () => {
  it('acepta un estado serializado al que se llega jugando', () => {
    const state = clone(midGame());
    expect(engine.restoreState(state)).toEqual({ ok: true, value: state });
  });

  it.each([
    ['sin flotas', { shots: [[], []], retiredSeat: null }],
    [
      'con una flota que se toca',
      {
        ...placed(),
        fleets: [
          FLEET_A,
          [...FLEET_A.slice(0, 4), { ship: 'S2', row: 1, col: 0, orientation: 'H' }],
        ],
      },
    ],
    ['con disparos antes de colocar', { ...initial(), shots: [[{ row: 0, col: 0 }], []] }],
    ['con el 1 disparando más que el 0', { ...placed(), shots: [[], [{ row: 0, col: 0 }]] }],
    [
      'con una casilla repetida',
      {
        ...placed(),
        shots: [
          [
            { row: 0, col: 0 },
            { row: 0, col: 0 },
          ],
          [WATER, { row: 9, col: 1 }],
        ],
      },
    ],
    ['con un asiento retirado que no existe', { ...placed(), retiredSeat: 2 }],
  ])('rechaza un estado %s', (_, snapshot) => {
    expect(engine.restoreState(clone(snapshot))).toEqual({ ok: false, code: 'INVALID_GAME_STATE' });
  });

  it('rechaza un estado en el que se siguió disparando tras ganar', () => {
    const targets = cellsOf(FLEET_B);
    const won = fire(placed(), targets, waterAgainstA(targets.length - 1));
    const extra = { ...won, shots: [won.shots[0], [...(won.shots[1] ?? []), { row: 9, col: 9 }]] };
    expect(engine.restoreState(clone(won)).ok).toBe(true);
    expect(engine.restoreState(clone(extra))).toEqual({ ok: false, code: 'INVALID_GAME_STATE' });
  });

  function midGame(): NavalBattleState {
    return fire(placed(), [{ row: 0, col: 1 }], [WATER]);
  }
});
