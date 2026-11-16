import type { MatchView, RoomView } from '@gameboard/contracts';
import { expect } from 'vitest';
import type { TestApp } from './app.js';
import { query } from './database.js';
import { signUp, type TestPlayer } from './players.js';
import { seedGame } from './seed.js';

export const MINUTE_MS = 60 * 1000;
export const FIVE_MINUTES = { type: 'TOTAL_PER_PLAYER', totalMs: 5 * MINUTE_MS } as const;

/** Una sala de Cuatro en raya en tiempo real, con cinco minutos por jugador. */
export const FOUR_IN_A_ROW = {
  gameSlug: 'four-in-a-row',
  mode: 'REALTIME',
  timeControl: FIVE_MINUTES,
  maxPlayers: 2,
};

/** Da de alta Cuatro en raya, como hace su migración de datos (ADR-014, decisión K5). */
export async function seedFourInARow(): Promise<void> {
  await seedGame({
    slug: 'four-in-a-row',
    name: 'Cuatro en raya',
    versions: [{ version: '1.0.0', isCurrent: true }],
  });
}

/** Una partida empezada, con quién ocupa cada asiento. */
export interface StartedMatch {
  readonly roomId: string;
  readonly matchId: string;
  /** Quien ocupa el asiento 0. */
  readonly first: TestPlayer;
  /** Quien ocupa el asiento 1. */
  readonly second: TestPlayer;
  readonly owner: TestPlayer;
  readonly guest: TestPlayer;
}

/** Marca listos a los dos miembros de una sala, con lo que empieza su partida. */
export async function startMatchIn(
  roomId: string,
  owner: TestPlayer,
  guest: TestPlayer,
): Promise<StartedMatch> {
  await owner.put(`/rooms/${roomId}/members/me/ready`, { ready: true });
  const response = await guest.put(`/rooms/${roomId}/members/me/ready`, { ready: true });
  expect(response.status, response.text).toBe(200);
  const room = response.body.data as RoomView;
  expect(room.status).toBe('IN_MATCH');
  const matchId = room.currentMatchId as string;

  const view = (await owner.get(`/matches/${matchId}`)).body.data as MatchView;
  const [first, second] = view.yourSeat === 0 ? [owner, guest] : [guest, owner];
  return { roomId, matchId, first, second, owner, guest };
}

/** Dos jugadores crean una sala, entran, se marcan listos y empieza su partida. */
export async function startMatch(t: TestApp, body: object = FOUR_IN_A_ROW): Promise<StartedMatch> {
  const owner = await signUp(t, { displayName: 'Ana' });
  const guest = await signUp(t, { displayName: 'Bea' });
  const created = await owner.post('/rooms', body);
  expect(created.status, created.text).toBe(201);
  const { roomId } = created.body.data as RoomView;
  const joined = await guest.put(`/rooms/${roomId}/members/me`);
  expect(joined.status, joined.text).toBe(200);
  return startMatchIn(roomId, owner, guest);
}

/** La versión actual del estado de una partida, leída de la base de datos. */
export async function stateVersionOf(matchId: string): Promise<number> {
  const [row] = await query<{ state_version: number }>(
    'select state_version from game_sessions where match_id = $1',
    [matchId],
  );
  if (!row) throw new Error(`La partida ${matchId} no tiene sesión`);
  return row.state_version;
}
