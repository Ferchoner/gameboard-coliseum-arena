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
