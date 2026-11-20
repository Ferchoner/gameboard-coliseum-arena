import { describe, expect, it } from 'vitest';
import { cycleMark, notesKey, parseNotes, seenNumbers, toggled, validDeclaration } from './notes';

describe('la hoja de deducción de Cinco a ciegas (ADR-022, CA16)', () => {
  it('cada toque pasa de nada a descartado, a posible y vuelta a nada', () => {
    expect(cycleMark(undefined)).toBe('CROSSED');
    expect(cycleMark('CROSSED')).toBe('POSSIBLE');
    expect(cycleMark('POSSIBLE')).toBeUndefined();
    expect(toggled(toggled(toggled({}, 7), 7), 7)).toEqual({});
    expect(toggled({ 3: 'CROSSED' }, 7)).toEqual({ 3: 'CROSSED', 7: 'CROSSED' });
  });

  it('lee las marcas guardadas y descarta lo que no lo es', () => {
    expect(parseNotes('{"4":"CROSSED","9":"POSSIBLE"}')).toEqual({ 4: 'CROSSED', 9: 'POSSIBLE' });
    expect(parseNotes('{"0":"CROSSED","61":"POSSIBLE","8":"OTRA"}')).toEqual({});
    expect(parseNotes('no es json')).toEqual({});
    expect(parseNotes(null)).toEqual({});
  });

  it('distingue la partida por sus cinco primeras fichas boca arriba y el asiento', () => {
    expect(notesKey([3, 14, 20, 37, 51, 44], 1)).toBe('blind-five:notes:3-14-20-37-51:1');
  });

  it('se tacha solo lo que está a la vista: atriles ajenos y fichas reveladas', () => {
    const stands = [
      [{ number: null }, { number: null }],
      [{ number: 6 }, { number: 12 }],
    ];
    expect([...seenNumbers(stands, [2, 40])].sort((a, b) => a - b)).toEqual([2, 6, 12, 40]);
  });

  it('una cantada necesita cinco números distintos del 1 al 60 en orden', () => {
    expect(validDeclaration([1, 7, 13, 19, 25])).toBe(true);
    expect(validDeclaration([7, 1, 13, 19, 25])).toBe(false);
    expect(validDeclaration([1, 7, 13, 19])).toBe(false);
    expect(validDeclaration([1, 7, 13, 19, 61])).toBe(false);
  });
});
