import { API_ERROR_CODES, ERROR_CATALOG, ERROR_CODES } from '@gameboard/contracts';
import { describe, expect, it } from 'vitest';
import { es } from '../i18n/es';
import { readApiResponse } from './api';
import { failureText, fieldTexts } from './errors';
import { requiredTexts } from './forms';
import { formatDuration, formatPlayers } from './format';

describe('textos de los errores', () => {
  it('hay un texto por cada código que puede llegar al cliente, y ninguno de más', () => {
    const reachClient = ERROR_CODES.filter((code) => ERROR_CATALOG[code].reaction !== null);

    expect(Object.keys(es.errors).sort()).toEqual([...reachClient].sort());
  });

  it('todo código de la API tiene texto', () => {
    for (const code of API_ERROR_CODES) {
      expect(failureText({ kind: 'api', error: { code, message: 'x' } })).not.toBe('');
    }
  });
});

describe('lectura de una respuesta de la API', () => {
  it('devuelve el dato de una respuesta correcta', () => {
    expect(readApiResponse(200, { success: true, data: { items: [] } })).toEqual({
      ok: true,
      data: { items: [] },
    });
  });

  it('acepta una respuesta 204 sin cuerpo', () => {
    expect(readApiResponse(204, undefined)).toEqual({ ok: true, data: undefined });
  });

  it('devuelve el error del catálogo de una respuesta fallida', () => {
    const error = { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' };

    expect(readApiResponse(401, { success: false, error })).toEqual({
      ok: false,
      failure: { kind: 'api', error },
    });
  });

  it.each([
    ['un cuerpo que no es el sobre', 200, '<html></html>'],
    ['un sobre correcto con estado de error', 500, { success: true, data: {} }],
    [
      'un sobre de error con estado correcto',
      200,
      { success: false, error: { code: 'FORBIDDEN', message: 'x' } },
    ],
    [
      'un código que no está en el catálogo',
      400,
      { success: false, error: { code: 'OTRO', message: 'x' } },
    ],
    ['una respuesta sin cuerpo que no es 204', 502, undefined],
  ])('trata como inesperado %s', (_case, status, body) => {
    expect(readApiResponse(status, body)).toEqual({ ok: false, failure: { kind: 'unexpected' } });
  });
});

describe('fallos que se señalan en un campo', () => {
  it('lee los campos de un VALIDATION_ERROR', () => {
    const failure = {
      kind: 'api',
      error: {
        code: 'VALIDATION_ERROR',
        message: 'x',
        details: {
          fields: [
            { field: 'email', rule: 'INVALID_FORMAT' },
            { field: 'password', rule: 'TOO_SHORT' },
            { field: 'raro', rule: 'REGLA_DESCONOCIDA' },
          ],
        },
      },
    } as const;

    expect(fieldTexts(failure)).toEqual({
      email: es.validation.INVALID_FORMAT,
      password: es.validation.TOO_SHORT,
    });
  });

  it('señala en su campo el correo y el nombre de usuario ya en uso', () => {
    expect(fieldTexts({ kind: 'api', error: { code: 'EMAIL_TAKEN', message: 'x' } })).toEqual({
      email: es.errors.EMAIL_TAKEN,
    });
    expect(fieldTexts({ kind: 'api', error: { code: 'USERNAME_TAKEN', message: 'x' } })).toEqual({
      username: es.errors.USERNAME_TAKEN,
    });
  });

  it('no señala ningún campo en los demás fallos', () => {
    expect(fieldTexts({ kind: 'network' })).toEqual({});
    expect(fieldTexts({ kind: 'api', error: { code: 'INTERNAL_ERROR', message: 'x' } })).toEqual(
      {},
    );
  });

  it('marca como obligatorios los campos vacíos', () => {
    expect(requiredTexts({ username: '', password: 'algo' })).toEqual({
      username: es.validation.REQUIRED,
    });
  });
});

describe('formato', () => {
  it.each([
    [600_000, '10 minutos'],
    [60_000, '1 minuto'],
    [90_000, '1 minuto y 30 segundos'],
    [12 * 3_600_000, '12 horas'],
    [3_600_000, '1 hora'],
    [5_400_000, '1 hora y 30 minutos'],
    [3_661_000, '1 hora y 1 minuto'],
    [0, '0 segundos'],
  ])('escribe %i ms como "%s"', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });

  it('escribe cuántas personas juegan', () => {
    expect(formatPlayers({ minPlayers: 2, maxPlayers: 2 })).toBe('2 jugadores');
    expect(formatPlayers({ minPlayers: 2, maxPlayers: 4 })).toBe('De 2 a 4 jugadores');
  });
});
