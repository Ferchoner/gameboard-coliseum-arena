import { describe, expect, it } from 'vitest';
import type { AnyGameEngine, Seat } from './contract.js';
import { GAME_ENGINES } from './engines.js';
import { COLUMN_COUNT } from './games/four-in-a-row/engine.js';
import { GRID_SIZE, type NavalBattleState } from './games/naval-battle/engine.js';
import { checkEngineConformance, type ConformanceFixture } from './testing/conformance.js';
import { createFakeEngine, createSimultaneousFakeEngine } from './testing/fake-engine.js';

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
