import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { MatchView, RoomView } from '@gameboard/contracts';
import { createFakeEngine } from '@gameboard/game-engine/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GameSessionsService } from '../src/modules/game-sessions/game-sessions.service.js';
import { createTestApp, type TestApp } from './app.js';
import { query, resetDatabase } from './database.js';
import { FIVE_MINUTES, MINUTE_MS } from './match-setup.js';
import { signUp, type TestPlayer } from './players.js';
import { TestSocket } from './realtime-client.js';
import { seedGame } from './seed.js';

/**
 * Asientos retirados con más de dos jugadores (ADR-020, decisiones DO18 a
 * DO21; regla 7.33). El motor de pruebas sigue con los demás cuando se
 * retira un asiento y termina tras tres jugadas, o cuando queda uno.
 */
const engines = [createFakeEngine('trio', '1.0.0', { minPlayers: 2, maxPlayers: 3 })];
const INCREMENT = { type: 'INCREMENT' };
const ABANDON_MS = 2 * MINUTE_MS;

describe('asientos retirados', () => {
  let t: TestApp;
  let sessions: GameSessionsService;
  let sockets: TestSocket[];

  beforeAll(async () => {
    await resetDatabase();
    t = await createTestApp({ engines });
    sessions = t.app.get(GameSessionsService);
  });
  afterAll(async () => {
    await t.close();
    // Las demás pruebas arrancan sin motores: no deben encontrar este juego.
    await resetDatabase();
  });
  beforeEach(async () => {
    sockets = [];
    t.clock.reset();
    await resetDatabase();
    await seedGame({
      slug: 'trio',
      name: 'Trío',
      versions: [{ version: '1.0.0', isCurrent: true }],
    });
  });
  afterEach(async () => {
    await Promise.all(sockets.map((socket) => socket.close()));
  });

  // --- Ayudas --------------------------------------------------------------

  interface Started {
    readonly roomId: string;
    readonly matchId: string;
    readonly owner: TestPlayer;
    /** El jugador de cada asiento. */
    readonly seats: readonly TestPlayer[];
  }

  /** Empieza una partida de tres en tiempo real. */
  async function start(): Promise<Started> {
    const players = await Promise.all([signUp(t), signUp(t), signUp(t)]);
    const [owner, ...guests] = players as [TestPlayer, TestPlayer, TestPlayer];
    const created = await owner.post('/rooms', {
      gameSlug: 'trio',
      mode: 'REALTIME',
      timeControl: FIVE_MINUTES,
      maxPlayers: 3,
    });
    expect(created.status, created.text).toBe(201);
    const { roomId } = created.body.data as RoomView;
    for (const guest of guests) {
      const joined = await guest.put(`/rooms/${roomId}/members/me`);
      expect(joined.status, joined.text).toBe(200);
    }
    let room: RoomView | undefined;
    for (const player of players) {
      room = (await player.put(`/rooms/${roomId}/members/me/ready`, { ready: true })).body
        .data as RoomView;
    }
    const matchId = room?.currentMatchId as string;
    expect(matchId).toBeTruthy();

    const seats: TestPlayer[] = [];
    for (const player of players) {
      seats[(await viewOf(player, matchId)).yourSeat] = player;
    }
    return { roomId, matchId, owner, seats };
  }

  async function viewOf(player: TestPlayer | undefined, matchId: string): Promise<MatchView> {
    if (!player) throw new Error('Ese asiento no existe');
    const response = await player.get(`/matches/${matchId}`);
    expect(response.status, response.text).toBe(200);
    return response.body.data as MatchView;
  }

  async function roomOf(player: TestPlayer, roomId: string): Promise<RoomView> {
    const response = await player.get(`/rooms/${roomId}`);
    expect(response.status, response.text).toBe(200);
    return response.body.data as RoomView;
  }

  function resign(player: TestPlayer | undefined, matchId: string) {
    if (!player) throw new Error('Ese asiento no existe');
    return sessions.resign(player.playerId, matchId, randomUUID());
  }

  /** Juega quien tenga el turno, hasta que la partida termine. */
  async function playToTheEnd(match: Started): Promise<MatchView> {
    for (let move = 0; move < 10; move += 1) {
      const view = await viewOf(match.seats[0], match.matchId);
      if (view.status !== 'IN_PROGRESS') return view;
      const [seat] = view.activeSeats;
      const player = match.seats[seat ?? -1];
      if (!player) throw new Error('Nadie tiene el turno');
      await sessions.submitAction(
        player.playerId,
        match.matchId,
        randomUUID(),
        view.stateVersion,
        INCREMENT,
      );
    }
    throw new Error('La partida no terminó');
  }

  async function retiredSeats(matchId: string): Promise<number[]> {
    const [row] = await query<{ retired_seats: number[] }>(
      'select retired_seats from game_sessions where match_id = $1',
      [matchId],
    );
    if (!row) throw new Error('La partida no tiene sesión');
    return row.retired_seats;
  }

  /** Un asiento que no es el del anfitrión. */
  function guestSeat(match: Started): number {
    return match.seats.findIndex((player) => player !== match.owner);
  }

  // --- Retirada en una partida que sigue (DO18, DO19, DO21) ------------------

  it('con tres jugadores, quien se rinde queda retirado y la partida sigue sin él', async () => {
    const match = await start();
    const seat = guestSeat(match);

    const snapshot = await resign(match.seats[seat], match.matchId);

    expect(snapshot.status).toBe('IN_PROGRESS');
    expect(snapshot.activeSeats).not.toContain(seat);
    expect(await retiredSeats(match.matchId)).toEqual([seat]);
    const view = await viewOf(match.seats[seat], match.matchId);
    expect(view.players.map((player) => player.retired)).toEqual(
      [0, 1, 2].map((one) => one === seat),
    );
  });

  it('rendirse otra vez no lo retira de nuevo: devuelve la partida como está', async () => {
    const match = await start();
    const seat = guestSeat(match);
    const first = await resign(match.seats[seat], match.matchId);

    const again = await resign(match.seats[seat], match.matchId);

    expect(again.stateVersion).toBe(first.stateVersion);
    expect(await query('select reason from match_retirements')).toEqual([
      { reason: 'RESIGNATION' },
    ]);
  });

  it('un retirado no puede jugar', async () => {
    const match = await start();
    const view = await viewOf(match.seats[0], match.matchId);
    const [active] = view.activeSeats;
    if (active === undefined) throw new Error('Nadie tiene el turno');
    const retired = await resign(match.seats[active], match.matchId);

    await expect(
      sessions.submitAction(
        match.seats[active]?.playerId ?? '',
        match.matchId,
        randomUUID(),
        retired.stateVersion,
        INCREMENT,
      ),
    ).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
  });

  it('si al retirarse quedan menos de dos, la partida termina como siempre', async () => {
    const match = await start();
    const [a, b] = [0, 1];
    await resign(match.seats[a], match.matchId);

    const snapshot = await resign(match.seats[b], match.matchId);

    expect(snapshot.status).toBe('FINISHED');
    expect(snapshot.result?.seats.map((seat) => seat.outcome)).toEqual(['LOSS', 'LOSS', 'WIN']);
  });

  // --- Abandono (DO19) -------------------------------------------------------

  it('un retirado no empieza a contar su ausencia ni pierde por abandono', async () => {
    const match = await start();
    const seat = guestSeat(match);
    const player = match.seats[seat] as TestPlayer;
    await resign(player, match.matchId);

    await sessions.playerDisconnected(player.playerId);
    t.clock.advance(ABANDON_MS + 1);

    expect(await sessions.abandonIfDue(match.matchId)).toBe(false);
    const view = await viewOf(match.owner, match.matchId);
    expect(view.status).toBe('IN_PROGRESS');
    expect(view.players[seat]?.abandonAt).toBeNull();
    expect(await query('select reason from match_retirements')).toEqual([
      { reason: 'RESIGNATION' },
    ]);
  });

  it('un retirado conectado no cuenta como rival conectado', async () => {
    const server = await t.listen();
    const match = await start();
    const seat = guestSeat(match);
    const retired = match.seats[seat] as TestPlayer;
    await resign(retired, match.matchId);
    const socket = await TestSocket.open(server, { cookie: retired.cookie });
    sockets.push(socket);
    await socket.nextOfType('CONNECTION_ESTABLISHED');

    // Los dos que siguen faltan, y solo está conectado el retirado.
    for (const player of match.seats.filter((_, one) => one !== seat)) {
      await sessions.playerDisconnected(player.playerId);
    }
    t.clock.advance(ABANDON_MS + 1);

    expect(await sessions.abandonIfDue(match.matchId)).toBe(false);
    expect((await viewOf(match.owner, match.matchId)).status).toBe('IN_PROGRESS');
  });

  // --- Sala y límite (DO20, regla 7.33) --------------------------------------

  it('mientras la partida sigue, su sala no cuenta para su límite de partidas', async () => {
    const match = await start();
    const seat = guestSeat(match);
    const retired = match.seats[seat] as TestPlayer;
    const room = { gameSlug: 'trio', mode: 'REALTIME', timeControl: FIVE_MINUTES, maxPlayers: 3 };

    // Antes de retirarse, el límite de una partida en tiempo real lo impide.
    const before = await retired.post('/rooms', room);
    expect(before.status, before.text).toBe(409);
    expect(before.body.error.code).toBe('MATCH_LIMIT_REACHED');

    await resign(retired, match.matchId);

    const after = await retired.post('/rooms', room);
    expect(after.status, after.text).toBe(201);
    // Sigue en la sala de la partida, que sigue en curso.
    const members = (await roomOf(match.owner, match.roomId)).members.map((one) => one.playerId);
    expect(members).toContain(retired.playerId);
  });

  it('al terminar la partida sale de la sala, que vuelve a la espera sin él', async () => {
    const match = await start();
    const seat = guestSeat(match);
    const retired = match.seats[seat] as TestPlayer;
    await resign(retired, match.matchId);

    const finished = await playToTheEnd(match);

    expect(finished.status).toBe('FINISHED');
    expect(finished.result?.seats[seat]?.outcome).toBe('LOSS');
    const room = await roomOf(match.owner, match.roomId);
    expect(room.status).toBe('WAITING');
    expect(room.members.map((one) => one.playerId)).not.toContain(retired.playerId);
    expect(room.members).toHaveLength(2);
    // Quien se retiró sigue viendo cómo terminó.
    expect((await viewOf(retired, match.matchId)).players[seat]?.retired).toBe(true);
  });

  it('si el retirado era el anfitrión, la sala se cierra al terminar', async () => {
    const match = await start();
    await resign(match.owner, match.matchId);

    await playToTheEnd(match);

    const room = await roomOf(
      match.seats.find((one) => one !== match.owner) as TestPlayer,
      match.roomId,
    );
    expect(room.status).toBe('CLOSED');
    expect(room.closeReason).toBe('OWNER_LEFT');
  });
});
