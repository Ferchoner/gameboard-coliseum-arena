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
});
