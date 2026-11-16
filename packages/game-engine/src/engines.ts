import type { AnyGameEngine } from './contract.js';

/**
 * Los motores que la plataforma tiene disponibles.
 *
 * Está vacía a propósito: el primer motor, Cuatro en raya, llega en el
 * Hito 3. Añadir un juego consiste en añadir aquí su motor y dar de alta
 * el juego y su versión en la base de datos (API, decisión A5).
 */
export const GAME_ENGINES: readonly AnyGameEngine[] = [];
