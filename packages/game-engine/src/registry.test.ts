import { describe, expect, it } from 'vitest';
import { createGameEngineRegistry } from './registry.js';
import { createFakeEngine } from './testing/fake-engine.js';

describe('registro de motores', () => {
  it('resuelve un motor por su juego y su versión', () => {
    const v1 = createFakeEngine('counter', '1.0.0');
    const v2 = createFakeEngine('counter', '1.1.0');
    const registry = createGameEngineRegistry([v1, v2]);

    expect(registry.resolve('counter', '1.0.0')).toBe(v1);
    expect(registry.resolve('counter', '1.1.0')).toBe(v2);
    expect(registry.list()).toEqual([v1, v2]);
  });

  it('devuelve undefined si la versión no está registrada', () => {
    const registry = createGameEngineRegistry([createFakeEngine('counter', '1.0.0')]);

    expect(registry.resolve('counter', '2.0.0')).toBeUndefined();
    expect(registry.resolve('other', '1.0.0')).toBeUndefined();
  });

  it('rechaza dos motores con el mismo juego y la misma versión', () => {
    expect(() =>
      createGameEngineRegistry([
        createFakeEngine('counter', '1.0.0'),
        createFakeEngine('counter', '1.0.0'),
      ]),
    ).toThrow(/duplicado/);
  });

  it('rechaza un motor cuyos metadatos no cumplen la regla 7.2 (ADR-018, Z4)', () => {
    const HOUR_MS = 60 * 60 * 1000;
    const cases = [
      { REALTIME: [{ type: 'TOTAL_PER_PLAYER', totalMs: 31 * 60 * 1000 }], TURN_BASED: [] },
      { REALTIME: [{ type: 'TOTAL_PER_PLAYER', totalMs: 0 }], TURN_BASED: [] },
      { REALTIME: [], TURN_BASED: [{ type: 'TOTAL_PER_PLAYER', totalMs: 8 * HOUR_MS }] },
      { REALTIME: [], TURN_BASED: [] },
      {
        REALTIME: [
          { type: 'TOTAL_PER_PLAYER', totalMs: 60_000 },
          { type: 'TOTAL_PER_PLAYER', totalMs: 60_000 },
        ],
        TURN_BASED: [],
      },
    ] as const;
    for (const timeControls of cases) {
      expect(() =>
        createGameEngineRegistry([createFakeEngine('counter', '1.0.0', { timeControls })]),
      ).toThrow(/metadatos del motor counter@1.0.0 no son válidos/);
    }
  });

  it('rechaza un número de jugadores sin sentido', () => {
    for (const players of [
      { minPlayers: 3, maxPlayers: 2 },
      { minPlayers: 0, maxPlayers: 2 },
      { minPlayers: 2, maxPlayers: 2.5 },
    ]) {
      expect(() =>
        createGameEngineRegistry([createFakeEngine('counter', '1.0.0', players)]),
      ).toThrow(/minPlayers/);
    }
  });

  it('admite los límites de la regla 7.2: 30 minutos, y 12, 24 y 36 horas', () => {
    const HOUR_MS = 60 * 60 * 1000;
    const engine = createFakeEngine('counter', '1.0.0', {
      timeControls: {
        REALTIME: [{ type: 'TOTAL_PER_PLAYER', totalMs: 30 * 60 * 1000 }],
        TURN_BASED: [12, 24, 36].map((hours) => ({
          type: 'TOTAL_PER_PLAYER' as const,
          totalMs: hours * HOUR_MS,
        })),
      },
    });
    expect(createGameEngineRegistry([engine]).list()).toEqual([engine]);
  });

  it('admite una lista vacía', () => {
    const registry = createGameEngineRegistry([]);

    expect(registry.list()).toEqual([]);
  });
});

describe('motor de pruebas', () => {
  it('es determinista y no modifica el estado que recibe', () => {
    const engine = createFakeEngine('counter', '1.0.0');
    const initial = engine.createInitialState({ playerCount: 2, settings: {}, seed: 'seed' });
    const frozen = Object.freeze({ ...initial });

    const first = engine.applyAction(frozen, 0, { type: 'INCREMENT' });
    const second = engine.applyAction(frozen, 0, { type: 'INCREMENT' });

    expect(first).toEqual(second);
    expect(frozen.count).toBe(0);
  });
});
