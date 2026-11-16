import type { RoomView } from '@gameboard/contracts';
import { describe, expect, it } from 'vitest';
import { canMarkReady, ownerName, playerCounts, startHint } from './rooms';

type Member = RoomView['members'][number];

function member(playerId: string, ready = false): Member {
  return {
    playerId,
    username: playerId,
    displayName: playerId.toUpperCase(),
    ready,
    connected: true,
    joinedAt: '2026-11-16T00:00:00.000Z',
  };
}

function room(overrides: Partial<RoomView>): RoomView {
  return {
    roomId: 'room',
    gameSlug: 'game',
    mode: 'REALTIME',
    timeControl: { type: 'TOTAL_PER_PLAYER', totalMs: 300_000 },
    maxPlayers: 2,
    rematchEnabled: true,
    settings: {},
    status: 'WAITING',
    closeReason: null,
    ownerPlayerId: 'ana',
    members: [member('ana')],
    currentMatchId: null,
    ...overrides,
  };
}

describe('capacidades de sala que admite un juego', () => {
  it('van del mínimo al máximo de jugadores', () => {
    expect(playerCounts({ minPlayers: 2, maxPlayers: 2 })).toEqual([2]);
    expect(playerCounts({ minPlayers: 2, maxPlayers: 5 })).toEqual([2, 3, 4, 5]);
  });
});

describe('qué falta para que empiece la partida', () => {
  it('en tiempo real, que la sala se complete y todos estén listos', () => {
    expect(startHint(room({}))).toBe('whenFullAndReady');
    expect(startHint(room({ members: [member('ana', true), member('bea')] }))).toBe('whenAllReady');
    expect(startHint(room({ members: [member('ana', true), member('bea', true)] }))).toBe(
      'allReady',
    );
  });

  it('por turnos, que la sala se complete', () => {
    expect(startHint(room({ mode: 'TURN_BASED' }))).toBe('whenFull');
  });
});

describe('marca de listo', () => {
  it('se ofrece en tiempo real mientras la sala espera', () => {
    expect(canMarkReady(room({}))).toBe(true);
    expect(canMarkReady(room({ status: 'IN_MATCH' }))).toBe(false);
    expect(canMarkReady(room({ status: 'CLOSED', closeReason: 'IDLE' }))).toBe(false);
  });

  it('por turnos solo se ofrece con la sala completa', () => {
    expect(canMarkReady(room({ mode: 'TURN_BASED' }))).toBe(false);
    expect(
      canMarkReady(room({ mode: 'TURN_BASED', members: [member('ana'), member('bea')] })),
    ).toBe(true);
  });
});

describe('nombre de quien creó la sala', () => {
  it('es su nombre visible, o nada si ya no está en la sala', () => {
    expect(ownerName(room({}))).toBe('ANA');
    expect(ownerName(room({ members: [member('bea')] }))).toBeNull();
  });
});
