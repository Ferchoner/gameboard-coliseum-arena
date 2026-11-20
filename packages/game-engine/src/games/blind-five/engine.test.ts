import { describe, expect, it } from 'vitest';
import type { Seat } from '../../contract.js';
import { seedRandom } from '../../random.js';
import {
  blindFiveEngine as engine,
  type BlindFiveOut,
  type BlindFiveState,
  CATALOG,
  dotsOf,
  SUITS,
  suitOf,
} from './engine.js';
import type { BlindFiveClue, BlindFiveEvent, BlindFiveStep, BlindFiveView } from './types.js';

/** Las reglas de Cinco a ciegas (ADR-022, CA3 a CA15), una por una. */

/** Atriles de ejemplo: uno de cada palo, en orden. */
const STAND_A = [1, 7, 13, 19, 25]; // S1 S2 S3 S4 S5
const STAND_B = [6, 12, 18, 24, 30];
const STAND_C = [11, 17, 23, 29, 35];

/**
 * Un estado hecho a mano. Las fichas que no se nombran van al pozo, salvo
 * que se pida el pozo exacto: entonces quedan como usadas en pistas de un
 * asiento, para que el estado siga teniendo las 60.
 */
function build(options: {
  stands?: readonly (readonly number[])[];
  faceUp?: readonly number[];
  supply?: readonly number[];
  clues?: readonly BlindFiveClue[];
  out?: readonly BlindFiveOut[];
  turn?: Seat;
  step?: BlindFiveStep;
  winner?: Seat | null;
}): BlindFiveState {
  const stands = (options.stands ?? [STAND_A, STAND_B]).map((stand) => [...stand]);
  const faceUp = [...(options.faceUp ?? [2, 3, 4, 5, 26])].sort((a, b) => a - b);
  const named = new Set([...stands.flat(), ...faceUp, ...(options.supply ?? [])]);
  const clues = [...(options.clues ?? [])];
  for (const clue of clues) named.add(clue.tile);
  const rest = CATALOG.map((tile) => tile.number).filter((number) => !named.has(number));
  let supply = [...(options.supply ?? []), ...rest];
  if (options.supply) {
    supply = [...options.supply];
    for (const tile of rest) clues.push({ seat: 0, tile, clue: 'SORT', slot: 0 });
  }
  return {
    playerCount: stands.length,
    random: seedRandom('pruebas'),
    stands,
    supply: supply.sort((a, b) => a - b),
    faceUp,
    revealed: [...faceUp, ...clues.map((clue) => clue.tile)],
    clues,
    declarations: [],
    out: [...(options.out ?? [])],
    turn: options.turn ?? 0,
    step: options.step ?? 'REVEAL',
    winner: options.winner ?? null,
  };
}

function apply(state: BlindFiveState, seat: Seat, action: unknown) {
  const result = engine.applyAction(state, seat, action);
  if (!result.ok) throw new Error(`Rechazada: ${result.code} ${result.reason ?? ''}`);
  return result.value;
}

function rejection(state: BlindFiveState, seat: Seat, action: unknown) {
  const result = engine.applyAction(state, seat, action);
  return result.ok ? null : { code: result.code, reason: result.reason };
}

describe('el catálogo (CA3)', () => {
  it('tiene las 60 fichas, con el palo de 5 en 5 y los puntos por tramos de 5 cada 15', () => {
    expect(CATALOG).toHaveLength(60);
    expect([1, 6, 11, 16, 56].map(suitOf)).toEqual(['S1', 'S1', 'S1', 'S1', 'S1']);
    expect([2, 7, 3, 4, 5, 60].map(suitOf)).toEqual(['S2', 'S2', 'S3', 'S4', 'S5', 'S5']);
    expect([1, 5, 6, 10, 11, 15, 16, 20, 21, 60].map(dotsOf)).toEqual([
      1, 1, 2, 2, 3, 3, 1, 1, 2, 3,
    ]);
  });

  it('cada palo tiene 12 fichas: 4 de 1 punto, 4 de 2 y 4 de 3', () => {
    for (const suit of SUITS) {
      const tiles = CATALOG.filter((tile) => tile.suit === suit);
      expect(tiles).toHaveLength(12);
      for (const dots of [1, 2, 3]) {
        expect(tiles.filter((tile) => tile.dots === dots)).toHaveLength(4);
      }
    }
  });
});

describe('la preparación (CA5)', () => {
  it.each([
    [2, 45],
    [3, 40],
    [4, 35],
  ])(
    'con %i jugadores, cada atril tiene uno de cada palo y quedan %i fichas en el pozo',
    (count, left) => {
      const state = engine.createInitialState({
        playerCount: count,
        settings: {},
        seed: 'semilla',
      });

      for (const stand of state.stands) {
        expect(stand).toEqual([...stand].sort((a, b) => a - b));
        expect(new Set(stand.map(suitOf)).size).toBe(5);
      }
      expect(new Set(state.faceUp.map(suitOf)).size).toBe(5);
      expect(state.supply).toHaveLength(left);
      const all = [...state.stands.flat(), ...state.faceUp, ...state.supply];
      expect(new Set(all).size).toBe(60);
      expect(state).toMatchObject({ turn: 0, step: 'REVEAL', winner: null });
      expect(engine.getStatus(state)).toEqual({ finished: false, activeSeats: [0] });
    },
  );

  it('con la misma semilla reparte lo mismo, y con otra, otra cosa', () => {
    const setup = { playerCount: 3, settings: {}, seed: 'una' };
    expect(engine.createInitialState(setup)).toEqual(engine.createInitialState(setup));
    expect(engine.createInitialState({ ...setup, seed: 'otra' }).stands).not.toEqual(
      engine.createInitialState(setup).stands,
    );
  });
});

describe('el turno (CA6 a CA8)', () => {
  it('revelar saca una ficha boca abajo del palo pedido y deja pedir la pista', () => {
    const state = build({});
    const { state: next, events } = apply(state, 0, { type: 'REVEAL', suit: 'S3' });

    const [event] = events as BlindFiveEvent[];
    expect(event).toMatchObject({ type: 'TILE_REVEALED', seat: 0 });
    const tile = (event as { tile: number }).tile;
    expect(suitOf(tile)).toBe('S3');
    expect(next.faceUp).toContain(tile);
    expect(next.supply).not.toContain(tile);
    expect(next.revealed.at(-1)).toBe(tile);
    expect(next).toMatchObject({ turn: 0, step: 'CLUE' });
  });

  it('no se pide pista antes de revelar ni se revela dos veces', () => {
    expect(rejection(build({}), 0, { type: 'CLUE', tile: 2, clue: 'SORT' })).toEqual({
      code: 'INVALID_ACTION',
      reason: 'WRONG_STEP',
    });
    expect(rejection(build({ step: 'CLUE' }), 0, { type: 'REVEAL', suit: 'S1' })).toEqual({
      code: 'INVALID_ACTION',
      reason: 'WRONG_STEP',
    });
  });

  it('ordenar dice en qué hueco del atril cae la ficha, y el turno pasa', () => {
    // El atril del asiento 0 es 1, 7, 13, 19, 25: el 4 cae entre el 1 y el 7.
    const { state, events } = apply(build({ step: 'CLUE' }), 0, {
      type: 'CLUE',
      tile: 4,
      clue: 'SORT',
    });

    expect(events).toEqual([{ type: 'CLUE_GIVEN', seat: 0, tile: 4, clue: 'SORT', slot: 1 }]);
    expect(state.faceUp).not.toContain(4);
    expect(state.clues.at(-1)).toEqual({ seat: 0, tile: 4, clue: 'SORT', slot: 1 });
    expect(state).toMatchObject({ turn: 1, step: 'REVEAL' });
  });

  it('ordenar una ficha mayor que todas cae en el último hueco', () => {
    const { events } = apply(build({ step: 'CLUE' }), 0, { type: 'CLUE', tile: 26, clue: 'SORT' });
    expect(events).toEqual([{ type: 'CLUE_GIVEN', seat: 0, tile: 26, clue: 'SORT', slot: 5 }]);
  });

  it('comparar dice si tienen los mismos puntos, sea cual sea el palo', () => {
    // El 7 (posición 1) tiene 2 puntos; el 21 tiene 2 y el 2 tiene 1.
    const same = apply(build({ step: 'CLUE', faceUp: [2, 3, 4, 5, 21] }), 0, {
      type: 'CLUE',
      tile: 21,
      clue: 'COMPARE',
      position: 1,
    });
    const different = apply(build({ step: 'CLUE' }), 0, {
      type: 'CLUE',
      tile: 2,
      clue: 'COMPARE',
      position: 1,
    });

    expect(same.events).toEqual([
      { type: 'CLUE_GIVEN', seat: 0, tile: 21, clue: 'COMPARE', position: 1, sameDots: true },
    ]);
    expect(different.events[0]).toMatchObject({ sameDots: false });
  });

  it('la pista pide una ficha boca arriba y una posición del atril', () => {
    const state = build({ step: 'CLUE' });
    expect(rejection(state, 0, { type: 'CLUE', tile: 40, clue: 'SORT' })).toEqual({
      code: 'INVALID_ACTION',
      reason: 'TILE_NOT_FACE_UP',
    });
    expect(rejection(state, 0, { type: 'CLUE', tile: 2, clue: 'COMPARE', position: 5 })).toEqual({
      code: 'INVALID_ACTION',
      reason: 'POSITION_OUT_OF_RANGE',
    });
    expect(rejection(state, 0, { type: 'CLUE', tile: 2, clue: 'COMPARE' })).toEqual({
      code: 'INVALID_ACTION',
      reason: 'MALFORMED_ACTION',
    });
    expect(rejection(state, 0, { type: 'REVEAL', suit: 'S9' })).toEqual({
      code: 'INVALID_ACTION',
      reason: 'MALFORMED_ACTION',
    });
  });

  it('revelar y pedir pista fuera de turno no vale', () => {
    expect(rejection(build({}), 1, { type: 'REVEAL', suit: 'S1' })).toEqual({
      code: 'NOT_YOUR_TURN',
      reason: undefined,
    });
  });
});

describe('palo o pozo agotados (CA12)', () => {
  it('un palo sin fichas boca abajo no se puede revelar', () => {
    // En el pozo solo quedan fichas del palo S2.
    const state = build({ supply: [32, 37] });
    expect(rejection(state, 0, { type: 'REVEAL', suit: 'S1' })).toEqual({
      code: 'INVALID_ACTION',
      reason: 'SUIT_EXHAUSTED',
    });
    expect(apply(state, 0, { type: 'REVEAL', suit: 'S2' }).state.step).toBe('CLUE');
  });

  it('sin pozo, el turno siguiente empieza en la pista', () => {
    const { state } = apply(build({ supply: [], step: 'CLUE' }), 0, {
      type: 'CLUE',
      tile: 2,
      clue: 'SORT',
    });
    expect(state).toMatchObject({ turn: 1, step: 'CLUE' });
  });

  it('sin pozo ni fichas boca arriba, solo se puede cantar', () => {
    const { state } = apply(build({ supply: [], faceUp: [2], step: 'CLUE' }), 0, {
      type: 'CLUE',
      tile: 2,
      clue: 'SORT',
    });

    expect(state).toMatchObject({ turn: 1, step: 'DECLARE_ONLY' });
    expect(rejection(state, 1, { type: 'REVEAL', suit: 'S1' })).toEqual({
      code: 'INVALID_ACTION',
      reason: 'MUST_DECLARE',
    });
    expect(apply(state, 1, { type: 'DECLARE', numbers: STAND_B }).state.winner).toBe(1);
  });
});

describe('cantar (CA9 a CA11)', () => {
  it('quien acierta gana, aunque no le toque', () => {
    const { state, events } = apply(build({}), 1, { type: 'DECLARE', numbers: STAND_B });

    expect(events).toEqual([{ type: 'DECLARED', seat: 1, numbers: STAND_B, correct: true }]);
    expect(engine.getStatus(state)).toEqual({
      finished: true,
      results: [
        { seat: 0, outcome: 'LOSS' },
        { seat: 1, outcome: 'WIN' },
      ],
    });
  });

  it('con dos, quien falla pierde en ese momento', () => {
    const { state, events } = apply(build({}), 1, {
      type: 'DECLARE',
      numbers: [6, 12, 18, 24, 35],
    });

    expect(events).toEqual([
      { type: 'DECLARED', seat: 1, numbers: [6, 12, 18, 24, 35], correct: false },
      { type: 'SEAT_OUT', seat: 1, reason: 'WRONG_DECLARATION' },
    ]);
    expect(engine.getStatus(state)).toMatchObject({
      finished: true,
      results: [
        { seat: 0, outcome: 'WIN' },
        { seat: 1, outcome: 'LOSS' },
      ],
    });
  });

  it('con tres, quien falla queda fuera, se salta su turno y no vuelve a cantar', () => {
    const three = build({ stands: [STAND_A, STAND_B, STAND_C] });
    const { state } = apply(three, 1, { type: 'DECLARE', numbers: [1, 2, 3, 4, 5] });

    expect(engine.getStatus(state)).toEqual({ finished: false, activeSeats: [0] });
    expect(rejection(state, 1, { type: 'DECLARE', numbers: STAND_B })).toEqual({
      code: 'NOT_YOUR_TURN',
      reason: undefined,
    });
    // Tras el asiento 0 le toca al 2: el 1 se salta.
    const after = apply(apply(state, 0, { type: 'REVEAL', suit: 'S1' }).state, 0, {
      type: 'CLUE',
      tile: 2,
      clue: 'SORT',
    }).state;
    expect(after.turn).toBe(2);
  });

  it('si falla quien tiene el turno, el turno pasa al siguiente', () => {
    const three = build({ stands: [STAND_A, STAND_B, STAND_C], step: 'CLUE' });
    const { state } = apply(three, 0, { type: 'DECLARE', numbers: [1, 2, 3, 4, 5] });
    expect(state).toMatchObject({ turn: 1, step: 'REVEAL' });
  });

  it('si todos menos uno fallan, el que queda gana sin cantar', () => {
    let state = build({ stands: [STAND_A, STAND_B, STAND_C] });
    state = apply(state, 1, { type: 'DECLARE', numbers: [1, 2, 3, 4, 5] }).state;
    state = apply(state, 2, { type: 'DECLARE', numbers: [1, 2, 3, 4, 5] }).state;

    expect(engine.getStatus(state)).toMatchObject({
      finished: true,
      results: [
        { seat: 0, outcome: 'WIN' },
        { seat: 1, outcome: 'LOSS' },
        { seat: 2, outcome: 'LOSS' },
      ],
    });
  });

  it.each([
    [[1, 7, 13, 19]],
    [[7, 1, 13, 19, 25]],
    [[1, 7, 7, 19, 25]],
    [[0, 7, 13, 19, 25]],
    [[1, 7, 13, 19, 61]],
    [[1, 7, 13, 19, 25.5]],
  ])('una cantada mal escrita, %j, se rechaza y no elimina', (numbers) => {
    expect(rejection(build({}), 0, { type: 'DECLARE', numbers })).toEqual({
      code: 'INVALID_ACTION',
      reason: 'INVALID_DECLARATION',
    });
  });

  it('tras terminar no se acepta nada', () => {
    const state = build({ winner: 0 });
    expect(rejection(state, 1, { type: 'DECLARE', numbers: STAND_B })).toEqual({
      code: 'GAME_ALREADY_FINISHED',
      reason: undefined,
    });
  });
});

describe('retiradas (CA13 y CA20)', () => {
  it('con dos, pierde quien se retira', () => {
    const { state } = engine.retireSeat(build({}), 0, 'RESIGNATION');
    expect(engine.getStatus(state)).toMatchObject({
      finished: true,
      results: [
        { seat: 0, outcome: 'LOSS' },
        { seat: 1, outcome: 'WIN' },
      ],
    });
  });

  it('con tres, el retirado queda fuera y, si le tocaba, juega el siguiente', () => {
    const three = build({ stands: [STAND_A, STAND_B, STAND_C] });
    const { state, events } = engine.retireSeat(three, 0, 'TIMEOUT');

    expect(events).toEqual([{ type: 'SEAT_OUT', seat: 0, reason: 'RETIRED' }]);
    expect(engine.getStatus(state)).toEqual({ finished: false, activeSeats: [1] });
  });

  it('retirar a quien ya quedó fuera por cantar mal no cambia nada', () => {
    const three = build({ stands: [STAND_A, STAND_B, STAND_C] });
    const { state } = apply(three, 2, { type: 'DECLARE', numbers: [1, 2, 3, 4, 5] });

    expect(engine.retireSeat(state, 2, 'RESIGNATION')).toEqual({ state, events: [] });
  });
});

describe('la vista (CA11 y CA15)', () => {
  const tiles = (view: BlindFiveView, seat: number) => view.seats[seat]?.stand;

  it('cada asiento ve los números de los demás, y de los suyos solo el palo', () => {
    const view = engine.getView(build({}), 0);

    expect(tiles(view, 0)).toEqual(
      ['S1', 'S2', 'S3', 'S4', 'S5'].map((suit) => ({ suit, number: null, dots: null })),
    );
    expect(tiles(view, 1)?.map((tile) => tile.number)).toEqual(STAND_B);
    expect(tiles(view, 1)?.[0]).toEqual({ suit: 'S1', number: 6, dots: 2 });
  });

  it('nada de la vista de un asiento en juego lleva sus números', () => {
    const state = build({ stands: [STAND_A, STAND_B, STAND_C], step: 'CLUE' });
    const text = JSON.stringify(engine.getView(state, 2));
    // Los números del asiento 2 solo pueden salir en el catálogo, que los lleva todos.
    const { catalog: _catalog, ...rest } = JSON.parse(text) as BlindFiveView;
    const numbers = JSON.stringify(rest).match(/\d+/g)?.map(Number) ?? [];
    for (const own of STAND_C) {
      expect(JSON.stringify(rest.seats[2])).not.toContain(`"number":${own}`);
    }
    expect(numbers.length).toBeGreaterThan(0);
  });

  it('quien queda fuera ve sus números', () => {
    const three = build({ stands: [STAND_A, STAND_B, STAND_C] });
    const { state } = apply(three, 2, { type: 'DECLARE', numbers: [1, 2, 3, 4, 5] });

    const view = engine.getView(state, 2);
    expect(tiles(view, 2)?.map((tile) => tile.number)).toEqual(STAND_C);
    expect(view.seats[2]?.out).toBe('WRONG_DECLARATION');
    // Los que siguen en juego siguen sin ver los suyos.
    expect(tiles(engine.getView(state, 0), 0)?.[0]?.number).toBeNull();
  });

  it('sin asiento no se ve ningún atril hasta el final', () => {
    const view = engine.getView(build({}), null);
    expect(view.seats.flatMap((seat) => seat.stand.map((tile) => tile.number))).toEqual(
      Array.from({ length: 10 }, () => null),
    );
    const final = engine.getView(build({ winner: 1 }), null);
    expect(tiles(final, 0)?.map((tile) => tile.number)).toEqual(STAND_A);
    expect(final).toMatchObject({ turn: null, step: null, winner: 1 });
  });

  it('lleva el catálogo, lo que hay boca arriba, lo revelado y lo que queda de cada palo', () => {
    const view = engine.getView(build({}), 0);
    expect(view.catalog).toHaveLength(60);
    expect(view.faceUp.map((tile) => tile.number)).toEqual([2, 3, 4, 5, 26]);
    expect(view.revealed).toEqual([2, 3, 4, 5, 26]);
    const total = Object.values(view.supplyBySuit).reduce((sum, count) => sum + count, 0);
    expect(total).toBe(60 - 10 - 5);
    expect(view).toMatchObject({ turn: 0, step: 'REVEAL', winner: null });
  });
});

describe('restaurar', () => {
  it('acepta un estado propio y rechaza uno con una ficha repetida o un atril sin un palo', () => {
    const state = build({});
    expect(engine.restoreState(JSON.parse(JSON.stringify(state)))).toEqual({
      ok: true,
      value: state,
    });
    const repeated = {
      ...state,
      faceUp: [...state.faceUp, state.supply[0] ?? 0].sort((a, b) => a - b),
    };
    expect(engine.restoreState(repeated)).toEqual({ ok: false, code: 'INVALID_GAME_STATE' });
    const twoOfASuit = { ...state, stands: [[1, 6, 13, 19, 25], STAND_B] };
    expect(engine.restoreState(twoOfASuit)).toEqual({ ok: false, code: 'INVALID_GAME_STATE' });
  });

  it('solo acepta las opciones vacías', () => {
    expect(engine.parseSettings({})).toEqual({ ok: true, value: {} });
    expect(engine.parseSettings({ variante: 1 })).toMatchObject({ ok: false });
  });
});
