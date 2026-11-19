import type { AnyGameEngine, GameEngineRegistry, GameSlug, GameVersion } from './contract.js';
import { metadataProblems } from './metadata.js';

function keyOf(gameSlug: GameSlug, gameVersion: GameVersion): string {
  return `${gameSlug}@${gameVersion}`;
}

/**
 * Crea el registro de motores a partir de una lista (acuerdo B3, ADR-007).
 *
 * Rechaza la lista si dos motores declaran el mismo juego y la misma
 * versión: sería imposible saber cuál de los dos gobierna una partida. La
 * rechaza también si los metadatos de un motor no cumplen la regla 7.2 o
 * no tienen sentido (ADR-018, decisión Z4). El registro se crea al
 * arrancar, así que en los dos casos el servidor no arranca.
 */
export function createGameEngineRegistry(engines: readonly AnyGameEngine[]): GameEngineRegistry {
  const byKey = new Map<string, AnyGameEngine>();
  for (const engine of engines) {
    const key = keyOf(engine.gameSlug, engine.gameVersion);
    const problems = metadataProblems(engine.metadata);
    if (problems.length > 0) {
      throw new Error(`Los metadatos del motor ${key} no son válidos: ${problems.join('; ')}`);
    }
    if (byKey.has(key)) {
      throw new Error(`Motor duplicado en el registro: ${key}`);
    }
    byKey.set(key, engine);
  }
  const all: readonly AnyGameEngine[] = [...byKey.values()];

  return {
    resolve(gameSlug, gameVersion) {
      return byKey.get(keyOf(gameSlug, gameVersion));
    },
    list() {
      return all;
    },
  };
}
