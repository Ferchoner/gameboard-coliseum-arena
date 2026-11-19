import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { MatchView, RoomView } from '@gameboard/contracts';
import { createSimultaneousFakeEngine } from '@gameboard/game-engine/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MatchSnapshot } from '../src/modules/broadcast/match-snapshot.js';
import { GameSessionsService } from '../src/modules/game-sessions/game-sessions.service.js';
import { createTestApp, type TestApp } from './app.js';
import { query, resetDatabase } from './database.js';
import { FIVE_MINUTES, MINUTE_MS } from './match-setup.js';
import { signUp, type TestPlayer } from './players.js';
import { seedGame } from './seed.js';

/**
 * Jugadas simultáneas (ADR-019, decisiones X15 a X17), con un motor en el
 * que todos los asientos están activos a la vez y cada uno juega dos veces.
 */
const engines = [createSimultaneousFakeEngine('rounds', '1.0.0')];
const SUBMIT = { type: 'SUBMIT' };

describe('jugadas simultáneas', () => {
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
      slug: 'rounds',
      name: 'Rondas',
      versions: [{ version: '1.0.0', isCurrent: true }],
    });
  });

  // --- Ayudas --------------------------------------------------------------

  /** Empieza una partida de `count` jugadores. Devuelve el jugador de cada asiento. */
  async function start(count: number): Promise<{ matchId: string; seats: TestPlayer[] }> {
    const players = await Promise.all(Array.from({ length: count }, () => signUp(t)));
    const [owner, ...guests] = players as [TestPlayer, ...TestPlayer[]];
    const created = await owner.post('/rooms', {
      gameSlug: 'rounds',
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
  ): Promise<MatchSnapshot> {
    if (!player) throw new Error('Ese asiento no existe');
    return sessions.submitAction(player.playerId, matchId, randomUUID(), stateVersion, SUBMIT);
  }

  async function activeSince(matchId: string): Promise<Record<string, number>> {
    const [row] = await query<{ active_since: Record<string, number> }>(
      'select active_since from game_sessions where match_id = $1',
      [matchId],
    );
    if (!row) throw new Error('La partida no tiene sesión');
    return row.active_since;
  }

  /**
   * Deja al asiento 0 con `remainingMs` y a los demás con su tiempo entero,
   * medidos ahora. La fecha límite pasa a ser la del asiento 0.
   */
  async function shortenFirstClock(matchId: string, remainingMs: number): Promise<void> {
    await query(
      `update game_sessions
          set clocks = jsonb_set(clocks, '{0}', to_jsonb($2::int)),
              turn_started_at = $3,
              turn_deadline_at = $3::timestamptz + make_interval(secs => $2::int / 1000.0)
        where match_id = $1`,
      [matchId, remainingMs, t.clock.now()],
    );
  }

  // --- Versión de la jugada (X15 y X16) -------------------------------------

  it('al empezar, todos los asientos activos lo están desde la versión 0', async () => {
    const { matchId } = await start(2);

    expect(await activeSince(matchId)).toEqual({ '0': 0, '1': 0 });
  });

  it('dos asientos activos juegan sobre la misma versión y se aceptan las dos jugadas', async () => {
    const { matchId, seats } = await start(2);

    await submit(seats[0], matchId, 0);
    const snapshot = await submit(seats[1], matchId, 0);

    expect(snapshot).toMatchObject({ stateVersion: 2, activeSeats: [0, 1] });
    expect(await query('select sequence from match_actions order by sequence')).toEqual([
      { sequence: 1 },
      { sequence: 2 },
    ]);
  });

  it('también si llegan a la vez', async () => {
    const { matchId, seats } = await start(2);

    const results = await Promise.allSettled([
      submit(seats[0], matchId, 0),
      submit(seats[1], matchId, 0),
    ]);

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await query('select count(*)::int as n from match_actions')).toEqual([{ n: 2 }]);
  });

  it('quien juega y sigue activo cuenta desde su jugada: dos jugadas suyas sobre la misma versión no valen', async () => {
    const { matchId, seats } = await start(2);

    await submit(seats[0], matchId, 0);
    expect(await activeSince(matchId)).toEqual({ '0': 1, '1': 0 });

    await expect(submit(seats[0], matchId, 0)).rejects.toMatchObject({
      code: 'STALE_STATE_VERSION',
      details: { currentStateVersion: 1 },
    });
    await expect(submit(seats[0], matchId, 1)).resolves.toMatchObject({ stateVersion: 2 });
  });

  it('a un asiento que ya no está activo solo le vale la versión actual', async () => {
    const { matchId, seats } = await start(2);
    await submit(seats[0], matchId, 0);
    await submit(seats[0], matchId, 1);

    // El asiento 0 ya jugó sus dos veces y no está activo.
    await expect(submit(seats[0], matchId, 1)).rejects.toMatchObject({
      code: 'STALE_STATE_VERSION',
    });
    await expect(submit(seats[0], matchId, 2)).rejects.toMatchObject({ code: 'NOT_YOUR_TURN' });
  });

  it('una versión posterior a la actual no vale', async () => {
    const { matchId, seats } = await start(2);

    await expect(submit(seats[0], matchId, 1)).rejects.toMatchObject({
      code: 'STALE_STATE_VERSION',
    });
  });

  // --- Reloj agotado de otro asiento (X17) -----------------------------------

  it('si se agotó el reloj de otro asiento y la partida sigue, la jugada se aplica tras el vencimiento', async () => {
    const { matchId, seats } = await start(3);
    await shortenFirstClock(matchId, MINUTE_MS);
    t.clock.advance(MINUTE_MS + 1);

    const snapshot = await submit(seats[1], matchId, 0);

    // Primero el vencimiento del asiento 0 (versión 1) y después la jugada (versión 2).
    expect(snapshot).toMatchObject({ status: 'IN_PROGRESS', stateVersion: 2, activeSeats: [1, 2] });
    expect(await query('select sequence, reason from match_retirements')).toEqual([
      { sequence: 1, reason: 'TIMEOUT' },
    ]);
    expect(await query('select sequence from match_actions')).toEqual([{ sequence: 2 }]);
    expect(await activeSince(matchId)).toEqual({ '1': 2, '2': 0 });
  });

  it('si el vencimiento de otro asiento termina la partida, la jugada se rechaza como fuera de partida', async () => {
    const { matchId, seats } = await start(2);
    await shortenFirstClock(matchId, MINUTE_MS);
    t.clock.advance(MINUTE_MS + 1);

    await expect(submit(seats[1], matchId, 0)).rejects.toMatchObject({
      code: 'MATCH_NOT_IN_PROGRESS',
    });

    // El vencimiento queda guardado aunque la jugada se rechace, y gana quien la envió.
    expect(await query('select reason from match_results')).toEqual([{ reason: 'TIMEOUT' }]);
    expect(
      await query('select outcome from player_results where player_id = $1', [seats[1]?.playerId]),
    ).toEqual([{ outcome: 'WIN' }]);
    expect(await query('select sequence from match_actions')).toEqual([]);
  });

  it('si se agotó el reloj de quien envía, la jugada se rechaza por su reloj, como siempre', async () => {
    const { matchId, seats } = await start(3);
    await shortenFirstClock(matchId, MINUTE_MS);
    t.clock.advance(MINUTE_MS + 1);

    await expect(submit(seats[0], matchId, 0)).rejects.toMatchObject({ code: 'CLOCK_EXPIRED' });

    expect(await query('select sequence, reason from match_retirements')).toEqual([
      { sequence: 1, reason: 'TIMEOUT' },
    ]);
    expect(await activeSince(matchId)).toEqual({ '1': 0, '2': 0 });
  });

  it('al terminar, la sesión no tiene asientos activos', async () => {
    const { matchId, seats } = await start(2);
    await submit(seats[0], matchId, 0);
    await submit(seats[0], matchId, 1);
    await submit(seats[1], matchId, 0);
    const snapshot = await submit(seats[1], matchId, 3);

    expect(snapshot.status).toBe('FINISHED');
    expect(await activeSince(matchId)).toEqual({});
  });
});
