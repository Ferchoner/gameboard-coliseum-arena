import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { MatchView, RoomView } from '@gameboard/contracts';
import { createOutOfTurnFakeEngine } from '@gameboard/game-engine/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MatchSnapshot } from '../src/modules/broadcast/match-snapshot.js';
import { GameSessionsService } from '../src/modules/game-sessions/game-sessions.service.js';
import { createTestApp, type TestApp } from './app.js';
import { query, resetDatabase } from './database.js';
import { FIVE_MINUTES, MINUTE_MS } from './match-setup.js';
import { signUp, type TestPlayer } from './players.js';
import { seedGame } from './seed.js';

/**
 * Jugadas fuera de turno (ADR-022, decisión CA19), con un motor en el que
 * cada asiento suma uno en su turno y cualquiera puede cantar (`CALL`) en
 * cualquier momento. Cantar no cambia de quién es el turno; quien canta dos
 * veces gana.
 */
const engines = [createOutOfTurnFakeEngine('calls', '1.0.0')];
const INCREMENT = { type: 'INCREMENT' };
const CALL = { type: 'CALL' };
const FULL_CLOCK = FIVE_MINUTES.totalMs;

describe('jugadas fuera de turno', () => {
  let t: TestApp;
  let sessions: GameSessionsService;

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
    t.clock.reset();
    await resetDatabase();
    await seedGame({
      slug: 'calls',
      name: 'Cantar',
      versions: [{ version: '1.0.0', isCurrent: true }],
    });
  });

  // --- Ayudas --------------------------------------------------------------

  /** Empieza una partida de `count` jugadores. Devuelve el jugador de cada asiento. */
  async function start(count: number): Promise<{ matchId: string; seats: TestPlayer[] }> {
    const players = await Promise.all(Array.from({ length: count }, () => signUp(t)));
    const [owner, ...guests] = players as [TestPlayer, ...TestPlayer[]];
    const created = await owner.post('/rooms', {
      gameSlug: 'calls',
      mode: 'REALTIME',
      timeControl: FIVE_MINUTES,
      maxPlayers: count,
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
      const view = (await player.get(`/matches/${matchId}`)).body.data as MatchView;
      seats[view.yourSeat] = player;
    }
    return { matchId, seats };
  }

  function submit(
    player: TestPlayer | undefined,
    matchId: string,
    stateVersion: number,
    action: unknown,
  ): Promise<MatchSnapshot> {
    if (!player) throw new Error('Ese asiento no existe');
    return sessions.submitAction(player.playerId, matchId, randomUUID(), stateVersion, action);
  }

  // --- Pruebas -------------------------------------------------------------

  it('un asiento que no está activo canta, y el turno sigue siendo del mismo', async () => {
    const { matchId, seats } = await start(2);

    const snapshot = await submit(seats[1], matchId, 0, CALL);

    expect(snapshot).toMatchObject({ status: 'IN_PROGRESS', stateVersion: 1, activeSeats: [0] });
    expect(await query('select sequence, action from match_actions')).toEqual([
      { sequence: 1, action: CALL },
    ]);
  });

  it('cantar fuera de turno no gasta reloj, y el del asiento activo sigue corriendo', async () => {
    const { matchId, seats } = await start(2);
    t.clock.advance(MINUTE_MS);

    const snapshot = await submit(seats[1], matchId, 0, CALL);

    // El reloj de prueba sigue a la hora real, así que se admiten unos milisegundos.
    const [active, caller] = snapshot.clocks;
    expect(caller).toBe(FULL_CLOCK);
    expect(active).toBeLessThanOrEqual(FULL_CLOCK - MINUTE_MS);
    expect(active).toBeGreaterThan(FULL_CLOCK - MINUTE_MS - 5_000);
    // La fecha límite sigue siendo la del asiento activo: no se le regala tiempo.
    expect(snapshot.turnDeadlineAt?.getTime()).toBe(
      (snapshot.turnStartedAt?.getTime() ?? 0) + (active ?? 0),
    );
  });

  it('la jugada del asiento activo hecha antes de que otro cantara sigue valiendo', async () => {
    const { matchId, seats } = await start(2);
    await submit(seats[1], matchId, 0, CALL);

    // El asiento 0 jugó sobre la versión 0, desde la que sigue activo (X15).
    const snapshot = await submit(seats[0], matchId, 0, INCREMENT);

    expect(snapshot).toMatchObject({ stateVersion: 2, activeSeats: [1] });
  });

  it('a quien canta fuera de turno solo le vale la versión actual', async () => {
    const { matchId, seats } = await start(2);
    await submit(seats[0], matchId, 0, INCREMENT);

    await expect(submit(seats[0], matchId, 0, CALL)).rejects.toMatchObject({
      code: 'STALE_STATE_VERSION',
      details: { currentStateVersion: 1 },
    });
  });

  it('cualquier otra jugada fuera de turno se rechaza como siempre', async () => {
    const { matchId, seats } = await start(2);

    await expect(submit(seats[1], matchId, 0, INCREMENT)).rejects.toMatchObject({
      code: 'NOT_YOUR_TURN',
    });
    expect(await query('select count(*)::int as n from match_actions')).toEqual([{ n: 0 }]);
  });

  it('una jugada fuera de turno puede terminar la partida', async () => {
    const { matchId, seats } = await start(3);
    await submit(seats[2], matchId, 0, CALL);

    const snapshot = await submit(seats[2], matchId, 1, CALL);

    expect(snapshot).toMatchObject({ status: 'FINISHED', activeSeats: [] });
    expect(await query('select reason from match_results')).toEqual([{ reason: 'COMPLETED' }]);
    expect(
      await query('select outcome from player_results where player_id = $1', [seats[2]?.playerId]),
    ).toEqual([{ outcome: 'WIN' }]);
  });

  it('un asiento retirado ya no puede cantar', async () => {
    const { matchId, seats } = await start(3);
    const resigned = await sessions.resign(seats[2]?.playerId as string, matchId, randomUUID());
    expect(resigned).toMatchObject({ status: 'IN_PROGRESS', retiredSeats: [2] });

    await expect(submit(seats[2], matchId, resigned.stateVersion, CALL)).rejects.toMatchObject({
      code: 'NOT_YOUR_TURN',
    });
  });
});
