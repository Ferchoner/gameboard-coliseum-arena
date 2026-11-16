import { describe, expect, it } from 'vitest';
import { CLOSE_CODES, COMMAND_TYPES, commandSchema, parseCommand } from './protocol.js';

const requestId = 'f2c7d9a1-4b83-4e60-8c15-0a9e3b6d7f42';
const roomId = '0b0f6f0e-3c58-4f7d-9a65-2f1c8a4d9e10';
const matchId = '7d3a1c52-9e4b-4a60-b1f8-5c2e9d7a3f01';

describe('órdenes del protocolo de tiempo real', () => {
  it('acepta las seis órdenes con su sobre', () => {
    const commands = [
      { type: 'SUBSCRIBE_ROOM', requestId, roomId },
      { type: 'UNSUBSCRIBE_ROOM', requestId, roomId },
      { type: 'SUBSCRIBE_MATCH', requestId, matchId },
      { type: 'UNSUBSCRIBE_MATCH', requestId, matchId },
      { type: 'SUBMIT_ACTION', requestId, matchId, payload: { stateVersion: 3, action: { column: 2 } } },
      { type: 'RESIGN_MATCH', requestId, matchId },
    ];

    expect(commands.map((command) => command.type)).toEqual([...COMMAND_TYPES]);
    for (const command of commands) {
      expect(parseCommand(JSON.stringify(command))).toEqual({ ok: true, command });
    }
  });

  it('una orden de sala no admite campos de más ni de partida', () => {
    expect(
      commandSchema.safeParse({ type: 'SUBSCRIBE_ROOM', requestId, roomId, matchId }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({ type: 'SUBSCRIBE_ROOM', requestId, roomId, playerId: roomId })
        .success,
    ).toBe(false);
  });

  it('una jugada exige la versión del estado', () => {
    expect(
      commandSchema.safeParse({ type: 'SUBMIT_ACTION', requestId, matchId, payload: { action: 1 } })
        .success,
    ).toBe(false);
  });

  it.each([
    ['no es JSON', '{"type":', null, null],
    ['no es un objeto', '"hola"', null, null],
    ['su tipo no existe', JSON.stringify({ type: 'JOIN_ROOM', requestId, roomId }), requestId, null],
    ['le falta el identificador de sala', JSON.stringify({ type: 'SUBSCRIBE_ROOM', requestId }), requestId, 'SUBSCRIBE_ROOM'],
    ['su requestId no es un UUID', JSON.stringify({ type: 'SUBSCRIBE_ROOM', requestId: 'x', roomId }), null, 'SUBSCRIBE_ROOM'],
  ])('si el mensaje %s, devuelve lo que pudo leer', (_case, text, id, type) => {
    expect(parseCommand(text)).toEqual({ ok: false, requestId: id, commandType: type });
  });
});

describe('códigos de cierre', () => {
  it('son los del protocolo', () => {
    expect(CLOSE_CODES).toEqual({
      POLICY_VIOLATION: 1008,
      MESSAGE_TOO_BIG: 1009,
      SERVICE_RESTART: 1012,
      SESSION_ENDED: 4001,
      UNSUPPORTED_PROTOCOL_VERSION: 4002,
      TOO_MANY_CONNECTIONS: 4003,
    });
  });
});
