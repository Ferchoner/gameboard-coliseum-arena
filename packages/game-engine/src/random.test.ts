import { describe, expect, it } from 'vitest';
import { isRandomState, nextRandom, randomInt, seedRandom, shuffle } from './random.js';

/** Generador con semilla (ADR-020, DO15). */
describe('generador con semilla', () => {
  function series(seed: string, length: number): number[] {
    let state = seedRandom(seed);
    return Array.from({ length }, () => {
      const next = nextRandom(state);
      state = next.state;
      return next.value;
    });
  }

  it('con la misma semilla da la misma serie', () => {
    expect(series('partida-1', 50)).toEqual(series('partida-1', 50));
  });

  it('con semillas parecidas da series distintas', () => {
    expect(series('partida-1', 5)).not.toEqual(series('partida-2', 5));
    expect(series('', 5)).not.toEqual(series('a', 5));
  });

  it('da números en [0, 1)', () => {
    for (const value of series('rango', 2000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('su estado son cuatro enteros sin signo, y sobrevive a JSON', () => {
    const state = seedRandom('json');
    expect(isRandomState(state)).toBe(true);
    const copy = JSON.parse(JSON.stringify(state)) as typeof state;
    expect(nextRandom(copy)).toEqual(nextRandom(state));
  });

  it('no modifica el estado que recibe', () => {
    const state = Object.freeze(seedRandom('quieto'));
    const before = [...state];
    nextRandom(state);
    shuffle([1, 2, 3], state);
    expect([...state]).toEqual(before);
  });

  it('reparte los enteros de forma pareja', () => {
    let state = seedRandom('dado');
    const counts = [0, 0, 0, 0, 0, 0];
    for (let roll = 0; roll < 12_000; roll += 1) {
      const next = randomInt(state, 6);
      state = next.state;
      counts[next.value] = (counts[next.value] ?? 0) + 1;
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(1800);
      expect(count).toBeLessThan(2200);
    }
  });

  it('baraja una copia con los mismos elementos', () => {
    const items = Object.freeze(Array.from({ length: 28 }, (_, index) => index));
    const { items: shuffled, state } = shuffle(items, seedRandom('baraja'));
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(shuffled).not.toEqual(items);
    expect(state).not.toEqual(seedRandom('baraja'));
    expect(shuffle(items, seedRandom('baraja')).items).toEqual(shuffled);
  });

  it('reconoce lo que no es un estado', () => {
    for (const value of [null, [], [1, 2, 3], [1, 2, 3, -1], [1, 2, 3, 1.5], [0, 0, 0, 0], 'x']) {
      expect(isRandomState(value)).toBe(false);
    }
    expect(isRandomState([1, 2, 3, 2 ** 32])).toBe(false);
  });
});
