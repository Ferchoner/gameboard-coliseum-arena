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

  it('sabe mostrar el Dominó 1 y da un nombre a cada uno de sus cuatro asientos (ADR-020)', () => {
    expect(knowsGame('dominoes', '1.0.0')).toBe(true);
    expect(knowsGame('dominoes', '2.0.0')).toBe(false);
    expect(gameUi('dominoes', '1.0.0')?.seatNames).toHaveLength(4);
  });

  it('tiene un texto para cada motivo con el que el Dominó rechaza una jugada', () => {
    expect(Object.keys(gameUi('dominoes', '1.0.0')?.rejections ?? {}).sort()).toEqual(
      [
        'END_REQUIRED',
        'MALFORMED_ACTION',
        'TILE_DOES_NOT_FIT',
        'TILE_NOT_IN_HAND',
        'WRONG_OPENING_TILE',
      ].sort(),
    );
  });

  it('dice cómo terminó el Dominó solo si alguien llegó a los puntos', () => {
    const ui = gameUi('dominoes', '1.0.0');
    expect(ui?.endText({ target: 100, scores: [104, 30] })).toBe('Llegó a 100 puntos.');
    expect(ui?.endText({ target: 100, scores: [40, 30] })).toBeNull();
  });

  it('sabe mostrar Cinco a ciegas 1 y da un nombre a cada uno de sus cuatro asientos (ADR-022)', () => {
    expect(knowsGame('blind-five', '1.0.0')).toBe(true);
    expect(knowsGame('blind-five', '2.0.0')).toBe(false);
    expect(gameUi('blind-five', '1.0.0')?.seatNames).toHaveLength(4);
  });

  it('tiene un texto para cada motivo con el que Cinco a ciegas rechaza una jugada', () => {
    expect(Object.keys(gameUi('blind-five', '1.0.0')?.rejections ?? {}).sort()).toEqual(
      [
        'INVALID_DECLARATION',
        'MALFORMED_ACTION',
        'MUST_DECLARE',
        'POSITION_OUT_OF_RANGE',
        'SUIT_EXHAUSTED',
        'TILE_NOT_FACE_UP',
        'WRONG_STEP',
      ].sort(),
    );
  });

  it('dice cómo terminó Cinco a ciegas: acertando o siendo el último en juego', () => {
    const ui = gameUi('blind-five', '1.0.0');
    const right = { seat: 1, numbers: [1, 2, 3, 4, 5], correct: true };
    const wrong = { seat: 0, numbers: [1, 2, 3, 4, 5], correct: false };
    expect(ui?.endText({ winner: 1, declarations: [wrong, right] })).toBe(
      'Acertó sus cinco números.',
    );
    expect(ui?.endText({ winner: 1, declarations: [wrong] })).toBe('Fue el último en juego.');
    expect(ui?.endText({ winner: null, declarations: [] })).toBeNull();
  });
});
