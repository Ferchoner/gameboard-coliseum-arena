import { describe, expect, it } from 'vitest';
import type { AnyGameEngine, Seat } from './contract.js';
import { GAME_ENGINES } from './engines.js';
import { type BlindFiveState, SUITS } from './games/blind-five/engine.js';
import type { DominoesState } from './games/dominoes/engine.js';
import { COLUMN_COUNT } from './games/four-in-a-row/engine.js';
import { GRID_SIZE, type NavalBattleState } from './games/naval-battle/engine.js';
import type { TidesState } from './games/tides/engine.js';
import { candidateActions as tidesCandidates } from './games/tides/legal.js';
import { checkEngineConformance, type ConformanceFixture } from './testing/conformance.js';
import {
  createFakeEngine,
  createOutOfTurnFakeEngine,
  createSimultaneousFakeEngine,
} from './testing/fake-engine.js';

/**
 * Cada motor registrado pasa la comprobación común del contrato (ADR-018,
 * decisión Z3). Un juego nuevo necesita aquí sus datos de prueba: sin
 * ellos, esta prueba falla.
 */
const FIXTURES: Readonly<Record<string, ConformanceFixture>> = {
  'four-in-a-row@1.0.0': {
    settings: {},
    // Todas las columnas, más una que no existe y una acción mal formada.
    candidateActions: () => [
      ...Array.from({ length: COLUMN_COUNT }, (_, column) => ({ type: 'DROP_TOKEN', column })),
      { type: 'DROP_TOKEN', column: COLUMN_COUNT },
      { type: 'OTRA_COSA' },
    ],
  },
  'naval-battle@1.0.0': {
    settings: {},
    // En la colocación, una flota válida y otra con barcos que se tocan. En
    // los disparos, algunas casillas sin disparar y una ya disparada.
    // Siempre, una acción mal formada.
    candidateActions: (state, seat) => {
      const { fleets, shots } = state as NavalBattleState;
      if (fleets.some((fleet) => fleet === null)) {
        return [VALID_FLEET, TOUCHING_FLEET, { type: 'OTRA_COSA' }];
      }
      const own = shots[seat] ?? [];
      const fired = new Set(own.map(({ row, col }) => `${row},${col}`));
      const open = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({
        row: Math.floor(index / GRID_SIZE),
        col: index % GRID_SIZE,
      })).filter(({ row, col }) => !fired.has(`${row},${col}`));
      // Tres casillas sin disparar, repartidas, bastan: cada disparo deja menos.
      const picks = [open[0], open[Math.floor(open.length / 2)], open.at(-1)];
      return [
        ...picks.flatMap((cell) => (cell ? [{ type: 'FIRE', ...cell }] : [])),
        ...own.slice(0, 1).map((cell) => ({ type: 'FIRE', ...cell })),
        { type: 'OTRA_COSA' },
      ];
    },
  },
  'blind-five@1.0.0': {
    settings: {},
    // Revelar cada palo, pistas con las fichas boca arriba, una cantada mal
    // escrita y, de vez en cuando, una cantada correcta o una errónea. Cantar
    // vale fuera de turno (ADR-022, CA9). Juega partidas de 2, 3 y 4.
    games: 21,
    allowedOutOfTurn: (action) => (action as { type?: unknown }).type === 'DECLARE',
    candidateActions: (state, seat) => {
      const { faceUp, stands, clues } = state as BlindFiveState;
      const own = stands[seat] ?? [];
      const declarations = [{ type: 'DECLARE', numbers: [5, 4, 3, 2, 1] }];
      if (clues.length % 7 === 6) declarations.push({ type: 'DECLARE', numbers: [...own] });
      if (clues.length % 5 === 4) {
        const wrong = own.map((one, index) => (index === 4 ? (one === 60 ? 59 : 60) : one));
        if (wrong[4] !== own[4] && (wrong[3] ?? 0) < (wrong[4] ?? 0)) {
          declarations.push({ type: 'DECLARE', numbers: wrong });
        }
      }
      return [
        ...SUITS.map((suit) => ({ type: 'REVEAL', suit })),
        ...faceUp.slice(0, 2).map((tile) => ({ type: 'CLUE', tile, clue: 'SORT' })),
        ...faceUp.slice(-1).map((tile) => ({ type: 'CLUE', tile, clue: 'COMPARE', position: 2 })),
        { type: 'CLUE', tile: 0, clue: 'SORT' },
        ...declarations,
        { type: 'OTRA_COSA' },
      ];
    },
  },
  'dominoes@1.0.0': {
    settings: {},
    // Cada ficha de la mano en los dos extremos y sin extremo, una ficha que
    // no tiene y una acción mal formada. Juega partidas de 2, 3 y 4.
    games: 21,
    candidateActions: (state, seat) => {
      const { hand } = state as DominoesState;
      const own = hand.hands[seat] ?? [];
      const missing = [
        [0, 0],
        [6, 6],
        [3, 4],
      ].find((tile) => !own.some((one) => one[0] === tile[0] && one[1] === tile[1]));
      return [
        ...own.flatMap((tile) => [
          { type: 'PLAY', tile },
          { type: 'PLAY', tile: [tile[1], tile[0]], end: 'LEFT' },
          { type: 'PLAY', tile, end: 'RIGHT' },
        ]),
        { type: 'PLAY', tile: missing },
        { type: 'OTRA_COSA' },
      ];
    },
  },
  'tides@1.0.0': {
    settings: {},
    // Las jugadas que el generador propone (colocar cada dado en cada sitio,
    // con y sin forzar; cumplir, usar, anidar, resolver y terminar), más una
    // mal formada. Una partida son unas 200 jugadas. Juega partidas de 2, 3 y 4.
    games: 12,
    maxSteps: 3000,
    candidateActions: (state, seat) => [
      ...tidesCandidates(state as TidesState, seat),
      { type: 'OTRA_COSA' },
    ],
  },
};

/** Una flota de Batalla naval válida: cinco barcos en filas pares, sin tocarse. */
const VALID_FLEET = {
  type: 'PLACE_FLEET',
  ships: [
    { ship: 'S5', row: 0, col: 0, orientation: 'H' },
    { ship: 'S4', row: 2, col: 0, orientation: 'H' },
    { ship: 'S3A', row: 4, col: 0, orientation: 'H' },
    { ship: 'S3B', row: 6, col: 0, orientation: 'H' },
    { ship: 'S2', row: 8, col: 0, orientation: 'H' },
  ],
};

/** La misma flota con el destructor pegado al portaaviones. */
const TOUCHING_FLEET = {
  ...VALID_FLEET,
  ships: VALID_FLEET.ships.map((ship) => (ship.ship === 'S2' ? { ...ship, row: 1 } : ship)),
};

const keyOf = (engine: AnyGameEngine) => `${engine.gameSlug}@${engine.gameVersion}`;

describe('comprobación común de los motores', () => {
  it('cada motor registrado tiene sus datos de prueba', () => {
    expect(GAME_ENGINES.map(keyOf).filter((key) => !FIXTURES[key])).toEqual([]);
  });

  for (const engine of GAME_ENGINES) {
    it(`${keyOf(engine)} cumple las reglas del contrato`, () => {
      const fixture = FIXTURES[keyOf(engine)];
      if (!fixture) return;
      expect(checkEngineConformance(engine, fixture)).toEqual([]);
    });
  }

  it('el motor de pruebas también las cumple, con dos a cuatro jugadores', () => {
    const engine = createFakeEngine('counter', '1.0.0', { maxPlayers: 4 });
    const fixture: ConformanceFixture = {
      settings: {},
      candidateActions: () => [{ type: 'INCREMENT' }, { type: 'OTRA_COSA' }],
    };
    expect(checkEngineConformance(engine, fixture)).toEqual([]);
  });

  it('el motor de pruebas de jugadas simultáneas también las cumple (ADR-019)', () => {
    const engine = createSimultaneousFakeEngine('rounds', '1.0.0');
    const fixture: ConformanceFixture = {
      settings: {},
      candidateActions: () => [{ type: 'SUBMIT' }, { type: 'OTRA_COSA' }],
    };
    expect(checkEngineConformance(engine, fixture)).toEqual([]);
  });

  it('el motor de pruebas de jugadas fuera de turno también las cumple (ADR-022)', () => {
    const engine = createOutOfTurnFakeEngine('calls', '1.0.0');
    const fixture: ConformanceFixture = {
      settings: {},
      candidateActions: () => [{ type: 'INCREMENT' }, { type: 'CALL' }, { type: 'OTRA_COSA' }],
      allowedOutOfTurn: (action) => (action as { type?: unknown }).type === 'CALL',
    };
    expect(checkEngineConformance(engine, fixture)).toEqual([]);
  });

  it('sin declarar las jugadas fuera de turno, la comprobación las señala', () => {
    const engine = createOutOfTurnFakeEngine('calls', '1.0.0');
    const fixture: ConformanceFixture = {
      settings: {},
      candidateActions: () => [{ type: 'INCREMENT' }, { type: 'CALL' }],
    };
    expect(checkEngineConformance(engine, fixture)).toContain(
      'applyAction no rechaza con NOT_YOUR_TURN la acción de un asiento que no puede jugar',
    );
  });
});

describe('la comprobación encuentra los incumplimientos', () => {
  const base = createFakeEngine('counter', '1.0.0') as unknown as AnyGameEngine;
  const fixture: ConformanceFixture = {
    settings: {},
    games: 3,
    candidateActions: () => [{ type: 'INCREMENT' }],
  };
  interface CounterState {
    count: number;
    playerCount: number;
    retired: Seat[];
  }

  it('un motor que modifica el estado que recibe', () => {
    const engine: AnyGameEngine = {
      ...base,
      applyAction(state, seat, input) {
        (state as CounterState).count += 1;
        return base.applyAction.call(this, state, seat, input);
      },
    };
    expect(checkEngineConformance(engine, fixture)).toContain(
      'applyAction modifica el estado que recibe',
    );
  });

  it('un motor que no es determinista', () => {
    let calls = 0;
    const engine = {
      ...base,
      createInitialState(setup) {
        calls += 1;
        return { ...(base.createInitialState(setup) as object), extra: calls };
      },
    } satisfies AnyGameEngine;
    expect(checkEngineConformance(engine, fixture)).toContain(
      'createInitialState no es determinista: con la misma preparación da estados distintos',
    );
  });

  it('un estado que no es JSON plano', () => {
    const engine = {
      ...base,
      createInitialState(setup) {
        return { ...(base.createInitialState(setup) as object), when: new Date(0) };
      },
    } satisfies AnyGameEngine;
    expect(checkEngineConformance(engine, fixture)).toContain(
      'el estado no es un valor JSON plano: when es un objeto de una clase',
    );
  });

  it('un motor que deja jugar a quien no tiene el turno', () => {
    const engine = {
      ...base,
      applyAction(state: unknown, _seat: Seat, input: unknown) {
        const active = base.getStatus.call(this, state);
        const seat = active.finished ? 0 : (active.activeSeats[0] ?? 0);
        return base.applyAction.call(this, state, seat, input);
      },
    } satisfies AnyGameEngine;
    expect(checkEngineConformance(engine, fixture)).toContain(
      'applyAction no rechaza con NOT_YOUR_TURN la acción de un asiento que no puede jugar',
    );
  });

  it('una retirada que no da la victoria al otro en un juego de dos', () => {
    const engine = {
      ...base,
      retireSeat(state: unknown) {
        return { state, events: [] };
      },
    } satisfies AnyGameEngine;
    expect(checkEngineConformance(engine, fixture).join('\n')).toMatch(
      /retirar un asiento por TIMEOUT no termina con su derrota/,
    );
  });

  it('unos metadatos fuera de la regla 7.2', () => {
    const engine = createFakeEngine('counter', '1.0.0', {
      timeControls: {
        REALTIME: [{ type: 'TOTAL_PER_PLAYER', totalMs: 60 * 60 * 1000 }],
        TURN_BASED: [],
      },
    });
    expect(checkEngineConformance(engine, fixture).join('\n')).toMatch(/^metadatos: REALTIME/m);
  });
});
