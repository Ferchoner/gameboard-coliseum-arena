import { describe, expect, it } from 'vitest';
import { gameUi, knowsGame } from '.';
import { gameUiKey } from './keys';

describe('qué juegos sabe mostrar la aplicación (ADR-018, decisión Z5)', () => {
  it('elige el tablero por juego y versión mayor', () => {
    expect(gameUiKey('four-in-a-row', '1.0.0')).toBe('four-in-a-row@1');
    expect(gameUiKey('four-in-a-row', '1.4.2')).toBe('four-in-a-row@1');
    expect(gameUiKey('four-in-a-row', '2.0.0')).toBe('four-in-a-row@2');
  });

  it('una versión con otra versión mayor necesita su propio tablero', () => {
    expect(knowsGame('four-in-a-row', '1.0.0')).toBe(true);
    expect(knowsGame('four-in-a-row', '1.3.0')).toBe(true);
    expect(knowsGame('four-in-a-row', '2.0.0')).toBe(false);
    expect(gameUi('four-in-a-row', '2.0.0')).toBeNull();
  });

  it('no conoce un juego sin tablero', () => {
    expect(knowsGame('unknown-game', '1.0.0')).toBe(false);
  });

  it('da un nombre a cada asiento de Cuatro en raya', () => {
    expect(gameUi('four-in-a-row', '1.0.0')?.seatNames).toHaveLength(2);
  });

  it('sabe mostrar Batalla naval 1 y da un nombre a cada asiento (ADR-019)', () => {
    expect(knowsGame('naval-battle', '1.0.0')).toBe(true);
    expect(knowsGame('naval-battle', '2.0.0')).toBe(false);
    expect(gameUi('naval-battle', '1.0.0')?.seatNames).toHaveLength(2);
  });

  it('tiene un texto para cada motivo con el que Batalla naval rechaza una jugada', () => {
    expect(Object.keys(gameUi('naval-battle', '1.0.0')?.rejections ?? {}).sort()).toEqual(
      [
        'CELL_ALREADY_FIRED',
        'CELL_OUT_OF_RANGE',
        'INVALID_FLEET',
        'MALFORMED_ACTION',
        'SHIPS_OVERLAP',
        'SHIPS_TOUCHING',
        'SHIP_OUT_OF_BOUNDS',
        'WRONG_PHASE',
      ].sort(),
    );
  });

  it('dice cómo terminó Batalla naval solo si alguien hundió toda la flota', () => {
    const ui = gameUi('naval-battle', '1.0.0');
    const fleet = [{ ship: 'S2', size: 2 }];
    const grid = (sunk: number) => ({
      placed: true,
      ships: null,
      sunk: Array.from({ length: sunk }, () => ({ ship: 'S2', cells: [] })),
      shots: [],
    });
    expect(ui?.endText({ fleet, grids: [grid(0), grid(1)] })).toBe('Hundió toda la flota rival.');
    expect(ui?.endText({ fleet, grids: [grid(0), grid(0)] })).toBeNull();
  });
});
