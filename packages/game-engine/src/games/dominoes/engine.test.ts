import { describe, expect, it } from 'vitest';
import type { Seat } from '../../contract.js';
import { seedRandom } from '../../random.js';
import {
  ALL_TILES,
  dominoesEngine as engine,
  type DominoesHandState,
  type DominoesState,
  HAND_SIZE,
} from './engine.js';
import type { DominoesEvent, DominoesTile } from './types.js';

/** Las reglas del Dominó (ADR-020, DO2 a DO14), una por una. */

type Tiles = readonly DominoesTile[];

const key = (tile: DominoesTile) => `${Math.min(...tile)}-${Math.max(...tile)}`;

/**
 * Un estado hecho a mano. Las fichas que no se nombran van al final del
 * pozo, salvo que se pida el pozo exacto: así el estado tiene las 28.
 */
function build(options: {
  playerCount?: number;
  hands: readonly Tiles[];
  line?: Tiles;
  boneyard?: Tiles;
  /** Las fichas que sobran no van al pozo, sino a la mano del último asiento. */
  exactBoneyard?: boolean;
  turn?: Seat;
  leader?: Seat;
  scores?: readonly number[];
  retired?: readonly Seat[];
  opening?: DominoesTile | null;
  number?: number;
}): DominoesState {
  const playerCount = options.playerCount ?? options.hands.length;
  const line = options.line ?? [];
  const named = new Set(
    [...options.hands.flat(), ...line, ...(options.boneyard ?? [])].map((tile) => key(tile)),
  );
  const rest = ALL_TILES.filter((tile) => !named.has(key(tile)));
  const hands = options.hands.map((tiles) => [...tiles]);
  const boneyard = [...(options.boneyard ?? [])];
  if (options.exactBoneyard) {
    // Las que sobran se las queda un asiento retirado o, si no hay, se ignoran.
    const holder = options.retired?.[0];
    if (holder !== undefined) hands[holder] = [...(hands[holder] ?? []), ...rest];
  } else {
    boneyard.push(...rest);
  }
  const hand: DominoesHandState = {
    number: options.number ?? 2,
    leader: options.leader ?? 0,
    turn: options.turn ?? 0,
    // Como en el motor, las manos van ordenadas y con el lado menor primero.
    hands: hands.map((tiles) =>
      tiles
        .map((tile) => [Math.min(...tile), Math.max(...tile)] as DominoesTile)
        .sort((a, b) => a[0] - b[0] || a[1] - b[1]),
    ),
    boneyard,
    line,
    opening: options.opening ?? null,
  };
  return {
    playerCount,
    random: seedRandom('pruebas'),
    scores: options.scores ?? Array.from({ length: playerCount }, () => 0),
    retired: options.retired ?? [],
    hand,
    lastHand: null,
  };
}

function play(state: DominoesState, seat: Seat, action: unknown) {
  const response = engine.applyAction(state, seat, action);
  if (!response.ok) throw new Error(`Rechazada: ${response.code} ${response.reason ?? ''}`);
  return response.value;
}

function reasonOf(state: DominoesState, seat: Seat, action: unknown) {
  const response = engine.applyAction(state, seat, action);
  return response.ok ? 'ACEPTADA' : (response.reason ?? response.code);
}

const ofType = <T extends DominoesEvent['type']>(events: readonly DominoesEvent[], type: T) =>
  events.filter((event): event is Extract<DominoesEvent, { type: T }> => event.type === type);

describe('reparto (DO2)', () => {
  it.each([
    [2, 14],
    [3, 7],
    [4, 0],
  ])('con %i jugadores, siete fichas a cada uno y %i en el pozo', (playerCount, pool) => {
    const state = engine.createInitialState({ playerCount, settings: {}, seed: 'reparto' });
    expect(state.hand.hands.map((tiles) => tiles.length)).toEqual(
      Array.from({ length: playerCount }, () => HAND_SIZE),
    );
    expect(state.hand.boneyard).toHaveLength(pool);
    const all = [...state.hand.hands.flat(), ...state.hand.boneyard].map(key);
    expect(new Set(all).size).toBe(28);
  });

  it('con la misma semilla reparte lo mismo, y con otra, otra cosa', () => {
    const setup = { playerCount: 3, settings: {}, seed: 'misma' };
    expect(engine.createInitialState(setup)).toEqual(engine.createInitialState(setup));
    expect(engine.createInitialState({ ...setup, seed: 'otra' }).hand.hands).not.toEqual(
      engine.createInitialState(setup).hand.hands,
    );
  });

  it('cada mano nueva baraja otra vez', () => {
    const state = build({ hands: [[[0, 1]], [[5, 5]]], line: [[0, 0]] });
    const { state: next } = play(state, 0, { type: 'PLAY', tile: [0, 1] });
    expect(next.hand.number).toBe(3);
    expect(next.random).not.toEqual(state.random);
    expect(next.hand.hands.map((tiles) => tiles.length)).toEqual([7, 7]);
    expect(next.hand.boneyard).toHaveLength(14);
  });
});

describe('salida (DO5)', () => {
  it('con 4 sale quien tiene el [6|6], y tiene que salir con él', () => {
    const state = engine.createInitialState({ playerCount: 4, settings: {}, seed: 'salida' });
    const leader = state.hand.leader;
    expect(state.hand.hands[leader]).toContainEqual([6, 6]);
    expect(engine.getStatus(state)).toEqual({ finished: false, activeSeats: [leader] });
    const view = engine.getView(state, leader);
    expect(view.playable).toEqual([{ tile: [6, 6], ends: ['RIGHT'] }]);
    const other = state.hand.hands[leader]?.find((tile) => key(tile) !== '6-6');
    expect(reasonOf(state, leader, { type: 'PLAY', tile: other })).toBe('WRONG_OPENING_TILE');
    expect(play(state, leader, { type: 'PLAY', tile: [6, 6] }).state.hand.line).toEqual([[6, 6]]);
  });

  it('sin dobles repartidos, sale la ficha con más puntos', () => {
    let state: DominoesState | null = null;
    for (let seed = 0; seed < 20_000 && !state; seed += 1) {
      const dealt = engine.createInitialState({ playerCount: 2, settings: {}, seed: `${seed}` });
      if (dealt.hand.hands.flat().every((tile) => tile[0] !== tile[1])) state = dealt;
    }
    if (!state) throw new Error('Ninguna semilla repartió sin dobles');
    const all = state.hand.hands.flat();
    const best = Math.max(...all.map((tile) => tile[0] + tile[1]));
    expect(state.hand.opening?.[0]).toBeDefined();
    const opening = state.hand.opening as DominoesTile;
    expect(opening[0] + opening[1]).toBe(best);
    expect(state.hand.hands[state.hand.leader]).toContainEqual(opening);
  });

  it('en las manos siguientes, quien sale elige ficha', () => {
    const state = build({
      hands: [
        [
          [1, 2],
          [3, 4],
        ],
        [[5, 5]],
      ],
    });
    expect(engine.getView(state, 0).playable).toHaveLength(2);
    expect(play(state, 0, { type: 'PLAY', tile: [4, 3] }).state.hand.line).toEqual([[3, 4]]);
  });
});

describe('jugar (DO6)', () => {
  // Extremos 2 a la izquierda y 5 a la derecha.
  const line: Tiles = [
    [2, 4],
    [4, 5],
  ];
  const state = build({
    hands: [
      [
        [0, 0],
        [1, 2],
        [2, 5],
        [5, 6],
      ],
      [
        [3, 3],
        [6, 6],
      ],
    ],
    line,
  });

  it('pone la ficha en el extremo con el que casa, orientada', () => {
    expect(play(state, 0, { type: 'PLAY', tile: [5, 6] }).state.hand.line).toEqual([
      ...line,
      [5, 6],
    ]);
    expect(play(state, 0, { type: 'PLAY', tile: [2, 1] }).state.hand.line).toEqual([
      [1, 2],
      ...line,
    ]);
  });

  it('si cabe en los dos extremos, hay que decir en cuál', () => {
    expect(reasonOf(state, 0, { type: 'PLAY', tile: [2, 5] })).toBe('END_REQUIRED');
    expect(play(state, 0, { type: 'PLAY', tile: [2, 5], end: 'LEFT' }).state.hand.line).toEqual([
      [5, 2],
      ...line,
    ]);
    expect(play(state, 0, { type: 'PLAY', tile: [2, 5], end: 'RIGHT' }).state.hand.line).toEqual([
      ...line,
      [5, 2],
    ]);
    expect(engine.getView(state, 0).playable).toEqual([
      { tile: [1, 2], ends: ['LEFT'] },
      { tile: [2, 5], ends: ['LEFT', 'RIGHT'] },
      { tile: [5, 6], ends: ['RIGHT'] },
    ]);
  });

  it('con los dos extremos iguales no hace falta elegir', () => {
    const same = build({
      hands: [
        [
          [3, 6],
          [5, 5],
        ],
        [[0, 0]],
      ],
      line: [
        [3, 1],
        [1, 3],
      ],
    });
    expect(engine.getView(same, 0).playable).toEqual([{ tile: [3, 6], ends: ['RIGHT'] }]);
    expect(play(same, 0, { type: 'PLAY', tile: [3, 6] }).state.hand.line.at(-1)).toEqual([3, 6]);
  });

  it('rechaza lo que no vale', () => {
    expect(reasonOf(state, 0, { type: 'PLAY', tile: [0, 0] })).toBe('TILE_DOES_NOT_FIT');
    expect(reasonOf(state, 0, { type: 'PLAY', tile: [5, 6], end: 'LEFT' })).toBe(
      'TILE_DOES_NOT_FIT',
    );
    expect(reasonOf(state, 0, { type: 'PLAY', tile: [3, 3] })).toBe('TILE_NOT_IN_HAND');
    expect(reasonOf(state, 1, { type: 'PLAY', tile: [3, 3] })).toBe('NOT_YOUR_TURN');
    for (const bad of [
      null,
      { type: 'DRAW' },
      { type: 'PLAY' },
      { type: 'PLAY', tile: [7, 1] },
      { type: 'PLAY', tile: [1] },
      { type: 'PLAY', tile: [1, 2], end: 'UP' },
    ]) {
      expect(reasonOf(state, 0, bad)).toBe('MALFORMED_ACTION');
    }
  });

  it('anota la acción con la ficha ordenada y el extremo usado', () => {
    expect(play(state, 0, { type: 'PLAY', tile: [6, 5] }).action).toEqual({
      type: 'PLAY',
      tile: [5, 6],
      end: 'RIGHT',
    });
  });

  it('no modifica el estado que recibe', () => {
    const copy = JSON.parse(JSON.stringify(state)) as DominoesState;
    play(state, 0, { type: 'PLAY', tile: [5, 6] });
    expect(state).toEqual(copy);
  });
});

describe('robar y pasar (DO7)', () => {
  it('a quien no puede jugar, el motor le roba hasta que puede, y solo dice cuántas', () => {
    const state = build({
      hands: [
        [
          [0, 5],
          [6, 6],
        ],
        [
          [1, 1],
          [3, 3],
        ],
      ],
      line: [[4, 0]],
      boneyard: [
        [1, 2],
        [2, 3],
        [3, 5],
        [0, 3],
      ],
      exactBoneyard: true,
    });
    const { state: next, events } = play(state, 0, { type: 'PLAY', tile: [0, 5] });
    // La línea queda de 4 a 5: el 1 roba [1|2], [2|3] y [3|5], que ya casa.
    expect(events).toEqual([
      { type: 'TILE_PLAYED', seat: 0, tile: [0, 5], end: 'RIGHT' },
      { type: 'TILES_DRAWN', seat: 1, count: 3 },
    ]);
    expect(next.hand.turn).toBe(1);
    expect(next.hand.boneyard).toEqual([[0, 3]]);
    expect(next.hand.hands[1]).toContainEqual([3, 5]);
    expect(JSON.stringify(events)).not.toContain('[1,2]');
  });

  it('si el pozo se acaba y sigue sin poder, pasa', () => {
    const state = build({
      playerCount: 3,
      hands: [
        [
          [0, 5],
          [5, 6],
        ],
        [[1, 1]],
        [
          [5, 5],
          [2, 2],
        ],
      ],
      line: [[4, 0]],
      boneyard: [[1, 2]],
      exactBoneyard: true,
    });
    const { state: next, events } = play(state, 0, { type: 'PLAY', tile: [0, 5] });
    expect(events.slice(1)).toEqual([
      { type: 'TILES_DRAWN', seat: 1, count: 1 },
      { type: 'PASSED', seat: 1 },
    ]);
    expect(next.hand.turn).toBe(2);
    expect(engine.getStatus(next)).toEqual({ finished: false, activeSeats: [2] });
  });
});

describe('fin de la mano y puntos (DO8 y DO9)', () => {
  it('dominó: quien se queda sin fichas anota los puntos de los rivales', () => {
    const state = build({
      playerCount: 3,
      hands: [
        [[0, 1]],
        [
          [6, 6],
          [2, 3],
        ],
        [[4, 5]],
      ],
      line: [[1, 1]],
      exactBoneyard: true,
      boneyard: [],
      retired: [],
    });
    const { state: next, events } = play(state, 0, { type: 'PLAY', tile: [0, 1] });
    const [ended] = ofType(events, 'HAND_ENDED');
    expect(ended).toMatchObject({ ending: 'DOMINO', winner: 0, points: 12 + 5 + 9 });
    expect(ended?.hands).toEqual([
      [],
      [
        [2, 3],
        [6, 6],
      ],
      [[4, 5]],
    ]);
    expect(next.scores).toEqual([26, 0, 0]);
    expect(ofType(events, 'HAND_STARTED')).toEqual([
      { type: 'HAND_STARTED', number: 3, leader: 0 },
    ]);
    expect(engine.getView(next, 1).lastHand).toMatchObject({ winner: 0, points: 26 });
  });

  it('con parejas, anota la pareja, y solo cuentan las fichas de la otra', () => {
    const state = build({
      hands: [[[0, 1]], [[6, 6]], [[5, 5]], [[1, 2]]],
      line: [[1, 1]],
      boneyard: [],
      exactBoneyard: true,
    });
    const { state: next, events } = play(state, 0, { type: 'PLAY', tile: [0, 1] });
    expect(ofType(events, 'HAND_ENDED')[0]).toMatchObject({ winner: 0, points: 12 + 3 });
    expect(next.scores).toEqual([15, 0, 15, 0]);
  });

  it('tranque: gana quien menos suma, y sale en la siguiente', () => {
    // Nadie tiene un 0 ni un 6 y el pozo está vacío.
    const state = build({
      hands: [
        [
          [0, 6],
          [1, 1],
        ],
        [[2, 3]],
      ],
      line: [[0, 0]],
      boneyard: [],
      exactBoneyard: true,
      leader: 1,
    });
    const { state: next, events } = play(state, 0, { type: 'PLAY', tile: [0, 6] });
    expect(ofType(events, 'PASSED').map((event) => event.seat)).toEqual([1, 0]);
    expect(ofType(events, 'HAND_ENDED')[0]).toMatchObject({
      ending: 'BLOCKED',
      winner: 0,
      points: 5,
    });
    expect(next.scores).toEqual([5, 0]);
    expect(next.hand.leader).toBe(0);
  });

  it('tranque empatado: nadie anota, y vuelve a salir quien salió', () => {
    // Tras el [0|6], el 0 suma 4 y el 1 también.
    const state = build({
      hands: [
        [
          [0, 6],
          [1, 3],
        ],
        [[2, 2]],
      ],
      line: [[0, 0]],
      boneyard: [],
      exactBoneyard: true,
      leader: 1,
    });
    const { state: next, events } = play(state, 0, { type: 'PLAY', tile: [0, 6] });
    expect(ofType(events, 'HAND_ENDED')[0]).toMatchObject({
      ending: 'BLOCKED_TIE',
      winner: null,
      points: 0,
    });
    expect(next.scores).toEqual([0, 0]);
    expect(next.hand.leader).toBe(1);
    expect(next.hand.turn).toBe(1);
  });
});

describe('fin de la partida (DO10)', () => {
  it('gana quien llega a 100 al acabar una mano, con sus puntos', () => {
    const state = build({
      hands: [[[0, 1]], [[6, 6]]],
      line: [[1, 1]],
      boneyard: [],
      exactBoneyard: true,
      scores: [90, 95],
    });
    const { state: next, events } = play(state, 0, { type: 'PLAY', tile: [0, 1] });
    expect(ofType(events, 'HAND_STARTED')).toEqual([]);
    expect(engine.getStatus(next)).toEqual({
      finished: true,
      results: [
        { seat: 0, outcome: 'WIN', score: 102 },
        { seat: 1, outcome: 'LOSS', score: 95 },
      ],
    });
    expect(engine.getView(next, 0).turn).toBeNull();
    expect(engine.applyAction(next, 1, { type: 'PLAY', tile: [6, 6] })).toEqual({
      ok: false,
      code: 'GAME_ALREADY_FINISHED',
    });
  });

  it('con parejas ganan los dos', () => {
    const state = build({
      hands: [[[0, 1]], [[6, 6]], [[5, 5]], [[1, 2]]],
      line: [[1, 1]],
      boneyard: [],
      exactBoneyard: true,
      scores: [90, 0, 90, 0],
    });
    const { state: next } = play(state, 0, { type: 'PLAY', tile: [0, 1] });
    const status = engine.getStatus(next);
    expect(status.finished && status.results.map((one) => one.outcome)).toEqual([
      'WIN',
      'LOSS',
      'WIN',
      'LOSS',
    ]);
  });

  it('se juega entera sin atascarse, con 2, 3 y 4', () => {
    for (const playerCount of [2, 3, 4]) {
      let state = engine.createInitialState({ playerCount, settings: {}, seed: `${playerCount}` });
      let moves = 0;
      for (;;) {
        const status = engine.getStatus(state);
        if (status.finished) break;
        const [seat] = status.activeSeats as [Seat];
        const [first] = engine.getView(state, seat).playable;
        if (!first) throw new Error('Le toca a quien no puede jugar');
        state = play(state, seat, { type: 'PLAY', tile: first.tile, end: first.ends[0] }).state;
        moves += 1;
        expect(moves).toBeLessThan(1000);
      }
      expect(Math.max(...state.scores)).toBeGreaterThanOrEqual(100);
    }
  });
});

describe('retiradas (DO11)', () => {
  it('con 2, pierde quien se retira', () => {
    const state = engine.createInitialState({ playerCount: 2, settings: {}, seed: 'dos' });
    const { state: next } = engine.retireSeat(state, 1, 'RESIGNATION');
    const status = engine.getStatus(next);
    expect(status.finished && status.results.map((one) => one.outcome)).toEqual(['WIN', 'LOSS']);
  });

  it('con 4, pierde su pareja y la partida termina', () => {
    const state = engine.createInitialState({ playerCount: 4, settings: {}, seed: 'cuatro' });
    const { state: next } = engine.retireSeat(state, 3, 'TIMEOUT');
    const status = engine.getStatus(next);
    expect(status.finished && status.results.map((one) => one.outcome)).toEqual([
      'WIN',
      'LOSS',
      'WIN',
      'LOSS',
    ]);
  });

  it('con 3, sus fichas salen del juego sin mostrarse y siguen los otros dos', () => {
    const state = build({
      playerCount: 3,
      hands: [
        [
          [0, 1],
          [5, 5],
        ],
        [
          [6, 6],
          [1, 3],
        ],
        [
          [1, 4],
          [2, 2],
        ],
      ],
      line: [[1, 1]],
      turn: 1,
      boneyard: [],
      exactBoneyard: true,
    });
    const { state: next, events } = engine.retireSeat(state, 1, 'ABANDONMENT');
    expect(events).toEqual([{ type: 'SEAT_RETIRED', seat: 1 }]);
    // Le tocaba: juega el siguiente.
    expect(engine.getStatus(next)).toEqual({ finished: false, activeSeats: [2] });
    const view = engine.getView(next, 1);
    expect(view.hand).toBeNull();
    expect(view.tileCounts).toEqual([2, 0, 2]);
    expect(view.retiredSeats).toEqual([1]);
    expect(JSON.stringify(engine.getView(next, 0))).not.toContain('[6,6]');

    // Juegan el 2 y el 0, y la mano se tranca: gana el 2 con los 10 puntos
    // del 0. Las fichas del retirado no cuentan.
    const after = play(next, 2, { type: 'PLAY', tile: [1, 4] }).state;
    expect(after.hand.turn).toBe(0);
    const ended = play(after, 0, { type: 'PLAY', tile: [0, 1] });
    expect(ofType(ended.events, 'PASSED').map((event) => event.seat)).toEqual([2, 0]);
    expect(ofType(ended.events, 'HAND_ENDED')[0]).toMatchObject({
      ending: 'BLOCKED',
      winner: 2,
      points: 10,
    });
  });

  it('con 3, la mano siguiente se reparte solo entre los dos que siguen', () => {
    const state = build({
      playerCount: 3,
      hands: [[[0, 1]], [[6, 6]], [[5, 5]]],
      line: [[1, 1]],
      boneyard: [],
      exactBoneyard: true,
      retired: [1],
    });
    const { state: next, events } = play(state, 0, { type: 'PLAY', tile: [0, 1] });
    expect(ofType(events, 'HAND_ENDED')[0]).toMatchObject({ winner: 0, points: 10 });
    expect(ofType(events, 'HAND_ENDED')[0]?.hands[1]).toEqual([]);
    expect(next.hand.hands.map((tiles) => tiles.length)).toEqual([7, 0, 7]);
    expect(next.hand.boneyard).toHaveLength(14);
  });

  it('con 3, si solo queda uno, gana', () => {
    const state = engine.createInitialState({ playerCount: 3, settings: {}, seed: 'tres' });
    const first = engine.retireSeat(state, 0, 'RESIGNATION').state;
    expect(engine.getStatus(first).finished).toBe(false);
    const second = engine.retireSeat(first, 2, 'TIMEOUT').state;
    const status = engine.getStatus(second);
    expect(status.finished && status.results.map((one) => one.outcome)).toEqual([
      'LOSS',
      'WIN',
      'LOSS',
    ]);
  });
});

describe('vista (DO14)', () => {
  it('nunca lleva las fichas de otro asiento ni las del pozo', () => {
    const state = engine.createInitialState({ playerCount: 3, settings: {}, seed: 'vista' });
    for (const viewer of [0, 1, 2]) {
      const view = engine.getView(state, viewer);
      const own = new Set((state.hand.hands[viewer] ?? []).map(key));
      const shown = [...JSON.stringify(view).matchAll(/\[(\d),(\d)\]/g)].map(
        ([, a, b]) => `${a}-${b}`,
      );
      expect(shown.every((tile) => own.has(tile))).toBe(true);
      expect(view.hand).toHaveLength(7);
      expect(view.tileCounts).toEqual([7, 7, 7]);
      expect(view.boneyardCount).toBe(7);
    }
    const spectator = engine.getView(state, null);
    expect(spectator.hand).toBeNull();
    expect(spectator.playable).toEqual([]);
    expect(JSON.stringify(spectator)).not.toMatch(/\[\d,\d\]/);
  });

  it('dice las parejas con 4, y a cuánto se juega', () => {
    const state = engine.createInitialState({ playerCount: 4, settings: {}, seed: 'parejas' });
    expect(engine.getView(state, 0)).toMatchObject({
      target: 100,
      teams: [
        [0, 2],
        [1, 3],
      ],
      handNumber: 1,
      boneyardCount: 0,
    });
    expect(
      engine.getView(engine.createInitialState({ playerCount: 2, settings: {}, seed: 'x' }), 0)
        .teams,
    ).toBeNull();
  });
});

describe('estado guardado', () => {
  const state = engine.createInitialState({ playerCount: 3, settings: {}, seed: 'guardado' });

  it('se recupera tal cual tras pasar por JSON', () => {
    expect(engine.restoreState(JSON.parse(JSON.stringify(state)))).toEqual({
      ok: true,
      value: state,
    });
  });

  it('rechaza lo que no puede ser un estado', () => {
    const [first] = state.hand.boneyard;
    const broken: unknown[] = [
      { ...state, playerCount: 5 },
      { ...state, random: [0, 0, 0, 0] },
      { ...state, scores: [0, -1, 0] },
      { ...state, retired: [3] },
      { ...state, hand: { ...state.hand, boneyard: [...state.hand.boneyard, first] } },
      { ...state, hand: { ...state.hand, boneyard: state.hand.boneyard.slice(1) } },
      {
        ...state,
        hand: {
          ...state.hand,
          boneyard: [],
          line: state.hand.boneyard,
          opening: null,
        },
      },
      { ...state, retired: [state.hand.turn] },
    ];
    for (const snapshot of broken) {
      expect(engine.restoreState(snapshot)).toEqual({ ok: false, code: 'INVALID_GAME_STATE' });
    }
  });
});
