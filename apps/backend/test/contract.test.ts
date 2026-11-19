import { describe, expect, it } from 'vitest';
import { checkAgainstContract } from './contract.js';

/**
 * La comprobación que pasa toda respuesta de las pruebas contra el contrato
 * (ADR-012, S7; análisis del 2026-11-19, T-02). Si dejara pasar algo, todas
 * las demás pruebas lo dejarían pasar también.
 */

const game = {
  slug: 'cuatro-en-raya',
  name: 'Cuatro en raya',
  description: null,
  minPlayers: 2,
  maxPlayers: 2,
  modes: ['REALTIME'],
  timeControls: {},
  currentVersion: '1.0.0',
};

function error(status: number, code: string) {
  const body = { success: false, error: { code, message: 'x' } };
  return { status, body, text: JSON.stringify(body) };
}

describe('comprobación de las respuestas contra el contrato', () => {
  it('admite un error que la operación enumera', () => {
    expect(() =>
      checkAgainstContract('get', '/api/v1/games/otro', error(404, 'GAME_NOT_FOUND')),
    ).not.toThrow();
  });

  it('rechaza un código que la operación no enumera para ese estado', () => {
    expect(() =>
      checkAgainstContract('get', '/api/v1/games/otro', error(404, 'ROOM_NOT_FOUND')),
    ).toThrow(/no enumera/);
  });

  it('rechaza un estado que la operación no prevé', () => {
    expect(() =>
      checkAgainstContract('get', '/api/v1/games/otro', error(409, 'ROOM_FULL')),
    ).toThrow(/no prevé/);
  });

  it('admite en cualquier operación un error común con su estado', () => {
    expect(() =>
      checkAgainstContract('get', '/api/v1/games/otro', error(500, 'INTERNAL_ERROR')),
    ).not.toThrow();
    expect(() =>
      checkAgainstContract('get', '/api/v1/games/otro', error(400, 'INTERNAL_ERROR')),
    ).toThrow(/no prevé/);
  });

  it('rechaza un cuerpo que no cumple el esquema', () => {
    const body = { success: true, data: { ...game, slug: undefined } };
    expect(() =>
      checkAgainstContract('get', '/api/v1/games/cuatro-en-raya', {
        status: 200,
        body,
        text: JSON.stringify(body),
      }),
    ).toThrow(/no cumple el contrato/);
  });

  it('una ruta que el contrato no tiene solo puede responder ROUTE_NOT_FOUND o METHOD_NOT_ALLOWED', () => {
    expect(() =>
      checkAgainstContract('get', '/api/v1/no-existe', error(404, 'ROUTE_NOT_FOUND')),
    ).not.toThrow();
    expect(() =>
      checkAgainstContract('get', '/api/v1/no-existe', error(404, 'GAME_NOT_FOUND')),
    ).toThrow();
  });

  it('pide declarar las rutas que quedan fuera de la API versionada', () => {
    expect(() =>
      checkAgainstContract('get', '/health', { status: 200, body: {}, text: '{}' }),
    ).not.toThrow();
    expect(() =>
      checkAgainstContract('get', '/otra', { status: 200, body: {}, text: '{}' }),
    ).toThrow(/OUTSIDE_CONTRACT/);
  });
});
