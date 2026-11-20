import type { AnyGameEngine } from './contract.js';
import { blindFiveEngine } from './games/blind-five/engine.js';
import { dominoesEngine } from './games/dominoes/engine.js';
import { fourInARowEngine } from './games/four-in-a-row/engine.js';
import { navalBattleEngine } from './games/naval-battle/engine.js';

/**
 * Los motores que la plataforma tiene disponibles.
 *
 * Añadir un juego es añadir aquí su motor, con sus datos para la
 * comprobación común, y dar de alta el juego y su versión **inactivos** con
 * una migración (API, decisión A5; ADR-014, decisión K5; ADR-018, Z8). Se
 * activan desde la administración cuando el frontend sabe mostrarlos. Los
 * pasos están en `docs/guia-nuevo-juego.md`.
 */
export const GAME_ENGINES: readonly AnyGameEngine[] = [
  fourInARowEngine,
  navalBattleEngine,
  dominoesEngine,
  blindFiveEngine,
];
