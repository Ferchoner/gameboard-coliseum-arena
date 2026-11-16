import type { AnyGameEngine } from './contract.js';
import { fourInARowEngine } from './games/four-in-a-row/engine.js';

/**
 * Los motores que la plataforma tiene disponibles.
 *
 * Añadir un juego consiste en añadir aquí su motor y dar de alta el juego y
 * su versión en la base de datos con una migración (API, decisión A5;
 * ADR-014, decisión K5).
 */
export const GAME_ENGINES: readonly AnyGameEngine[] = [fourInARowEngine];
