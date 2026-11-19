import { describe, expect, it } from 'vitest';
import type { AnyGameEngine, Seat } from './contract.js';
import { GAME_ENGINES } from './engines.js';
import { COLUMN_COUNT } from './games/four-in-a-row/engine.js';
import { checkEngineConformance, type ConformanceFixture } from './testing/conformance.js';
import { createFakeEngine } from './testing/fake-engine.js';

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
