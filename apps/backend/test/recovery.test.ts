import { randomUUID } from 'node:crypto';
import type { MatchView, Notification, RoomView } from '@gameboard/contracts';
import { fourInARowEngine } from '@gameboard/game-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameSessionsService } from '../src/modules/game-sessions/game-sessions.service.js';
import { ServerLiveness } from '../src/modules/game-sessions/server-liveness.js';
import { createTestApp, type TestApp, type TestAppOptions } from './app.js';
import { query, resetDatabase } from './database.js';
import { MINUTE_MS, seedFourInARow, type StartedMatch, startMatch } from './match-setup.js';
import { reconnect, type TestPlayer } from './players.js';
import { TestSocket } from './realtime-client.js';

type MatchUpdated = Extract<Notification, { type: 'MATCH_UPDATED' }>;

const SECOND_MS = 1000;
const FIVE_MINUTES_MS = 5 * MINUTE_MS;
const ABANDON_MS = 2 * MINUTE_MS;
/** Lo que tarda de verdad una prueba entre medir y comprobar. */
const TOLERANCE_MS = 3 * SECOND_MS;

/**
 * Reconexión y recuperación (Hito 4, ADR-015): el ajuste de relojes tras
 * una parada del servidor, el margen de desconexión y la derrota por
 * abandono. El tiempo lo controla la prueba.
 */
describe('reconexión y recuperación', () => {
  let apps: TestApp[];
  let sockets: TestSocket[];

  beforeEach(async () => {
    apps = [];
    sockets = [];
    await resetDatabase();
    await seedFourInARow();
  });
  afterEach(async () => {
    await Promise.all(sockets.map((socket) => socket.close()));
    for (const app of apps.splice(0).reverse()) await app.close();
    await resetDatabase();
  });

  // --- Ayudas --------------------------------------------------------------

  async function boot(options: TestAppOptions = {}): Promise<TestApp> {
    const t = await createTestApp({ engines: [fourInARowEngine], ...options });
    apps.push(t);
    return t;
  }

  /** Apaga en orden una aplicación, como en un despliegue. */
  async function shutDown(t: TestApp): Promise<void> {
    apps.splice(apps.indexOf(t), 1);
    await t.close();
  }

  /**
   * Una caída sin apagado: la última anotación es la periódica anterior.
   * Se apaga la aplicación y se devuelve la anotación a ese valor.
   */
  async function crash(t: TestApp, lastAliveAt: Date): Promise<void> {
    await shutDown(t);
    await query('update server_liveness set last_alive_at = $1', [lastAliveAt]);
  }

  async function lastAliveAt(): Promise<Date> {
    const [row] = await query<{ last_alive_at: Date }>('select last_alive_at from server_liveness');
    if (!row) throw new Error('No hay anotación de actividad');
    return row.last_alive_at;
  }

  async function viewOf(t: TestApp, player: TestPlayer, matchId: string): Promise<MatchView> {
    const response = await reconnect(t, player).get(`/matches/${matchId}`);
    expect(response.status, response.text).toBe(200);
    return response.body.data as MatchView;
  }

  async function roomOf(t: TestApp, player: TestPlayer, roomId: string): Promise<RoomView> {
    const response = await reconnect(t, player).get(`/rooms/${roomId}`);
    expect(response.status, response.text).toBe(200);
    return response.body.data as RoomView;
  }

  async function connect(server: string, player: TestPlayer): Promise<TestSocket> {
    const socket = await TestSocket.open(server, { cookie: player.cookie });
    sockets.push(socket);
    await socket.nextOfType('CONNECTION_ESTABLISHED');
    return socket;
  }

  async function follow(server: string, player: TestPlayer, matchId: string): Promise<TestSocket> {
    const socket = await connect(server, player);
    const response = await socket.command({ type: 'SUBSCRIBE_MATCH', matchId });
    expect(response.type).toBe('MATCH_SUBSCRIBED');
    return socket;
  }

  function expectNear(actual: number, expected: number): void {
    expect(actual).toBeLessThanOrEqual(expected);
    expect(actual).toBeGreaterThan(expected - TOLERANCE_MS);
  }

  // --- Ajuste de relojes tras una parada (V4, V10) --------------------------

  describe('ajuste de relojes al arrancar', () => {
    it('un reinicio ordenado no descuenta a nadie el tiempo que el servidor estuvo parado', async () => {
      const t1 = await boot();
      const match = await startMatch(t1);
      t1.clock.advance(20 * SECOND_MS);
      await shutDown(t1);

      // Arranca un minuto después de apagarse.
      const t2 = await boot({ clockOffsetMs: 20 * SECOND_MS + MINUTE_MS });
      const view = await viewOf(t2, match.first, match.matchId);

      expect(view.activeSeats).toEqual([0]);
      // Solo cuentan los 20 segundos jugados, no el minuto parado.
      expectNear(view.players[0]?.clockRemainingMs ?? 0, FIVE_MINUTES_MS - 20 * SECOND_MS);
      expect(view.players[1]?.clockRemainingMs).toBe(FIVE_MINUTES_MS);
      // El ajuste no cambia la versión del estado.
      expect(view.stateVersion).toBe(0);
    });

    it('tras una caída cuenta desde la última anotación, a favor de quien tenía el turno', async () => {
      const t1 = await boot();
      const match = await startMatch(t1);
      t1.clock.advance(20 * SECOND_MS);
      await t1.app.get(ServerLiveness).record();
      const recorded = await lastAliveAt();
      // Se cae 8 segundos después de la última anotación.
      t1.clock.advance(8 * SECOND_MS);
      await crash(t1, recorded);

      const t2 = await boot({ clockOffsetMs: 28 * SECOND_MS + MINUTE_MS });
      const view = await viewOf(t2, match.first, match.matchId);

      // Los 8 segundos sin anotación no se le descuentan.
      expectNear(view.players[0]?.clockRemainingMs ?? 0, FIVE_MINUTES_MS - 20 * SECOND_MS);
    });

    it('un turno que empezó después de la última anotación no queda empezando en el futuro', async () => {
      const t1 = await boot();
      const match = await startMatch(t1);
      const recorded = await lastAliveAt();
      t1.clock.advance(10 * SECOND_MS);
      await t1.app
        .get(GameSessionsService)
        .submitAction(match.first.playerId, match.matchId, randomUUID(), 0, {
          type: 'DROP_TOKEN',
          column: 3,
        });
      await crash(t1, recorded);

      const t2 = await boot({ clockOffsetMs: 10 * SECOND_MS + MINUTE_MS });
      const view = await viewOf(t2, match.second, match.matchId);

      expect(view.activeSeats).toEqual([1]);
      expectNear(view.players[1]?.clockRemainingMs ?? 0, FIVE_MINUTES_MS);
      const [session] = await query<{ turn_started_at: Date }>(
        'select turn_started_at from game_sessions where match_id = $1',
        [match.matchId],
      );
      expect(session?.turn_started_at.getTime()).toBeLessThanOrEqual(t2.clock.now().getTime());
    });

    it('la primera vez que arranca, sin anotación, no ajusta nada', async () => {
      const t1 = await boot();
      const match = await startMatch(t1);
      await shutDown(t1);
      await query('delete from server_liveness');

      const t2 = await boot({ clockOffsetMs: MINUTE_MS });
      const view = await viewOf(t2, match.first, match.matchId);

      expectNear(view.players[0]?.clockRemainingMs ?? 0, FIVE_MINUTES_MS - MINUTE_MS);
      const [row] = await query<{ started_at: Date; last_alive_at: Date }>(
        'select started_at, last_alive_at from server_liveness',
      );
      expect(row?.started_at).toEqual(row?.last_alive_at);
    });

    it('si el ajuste falla, el servidor no arranca', async () => {
      await query('alter table server_liveness rename to server_liveness_aparte');
      try {
        await expect(createTestApp({ engines: [fourInARowEngine] })).rejects.toThrow();
      } finally {
        await query('alter table server_liveness_aparte rename to server_liveness');
      }
    });
  });

  // --- Abandono (V1, V2, V3, V5) --------------------------------------------

  describe('abandono', () => {
    let t: TestApp;
    let server: string;
    let sessions: GameSessionsService;

    beforeEach(async () => {
      t = await boot();
      server = await t.listen();
      sessions = t.app.get(GameSessionsService);
    });

    /** Una partida con los dos jugadores conectados y siguiéndola. */
    async function followedMatch(): Promise<
      StartedMatch & { ownerSocket: TestSocket; guestSocket: TestSocket }
    > {
      const match = await startMatch(t);
      const ownerSocket = await follow(server, match.owner, match.matchId);
      const guestSocket = await follow(server, match.guest, match.matchId);
      await Promise.all([ownerSocket.quiet(), guestSocket.quiet()]);
      return { ...match, ownerSocket, guestSocket };
    }

    function seatOf(match: StartedMatch, player: TestPlayer): number {
      return player === match.first ? 0 : 1;
    }

    it('quien pasa 2 minutos sin conexión pierde por abandono y sale de la sala', async () => {
      const match = await followedMatch();
      const guestSeat = seatOf(match, match.guest);

      await match.guestSocket.close();
      const left = await match.ownerSocket.nextOfType('MATCH_UPDATED');
      const absent = left.payload.match.players[guestSeat];
      expect(absent?.connected).toBe(false);
      expect(absent?.abandonAt).not.toBeNull();

      // Un instante antes del plazo, todavía no pierde.
      t.clock.advance(ABANDON_MS - SECOND_MS);
      expect(await sessions.abandonIfDue(match.matchId)).toBe(false);

      t.clock.advance(SECOND_MS);
      expect(await sessions.abandonIfDue(match.matchId)).toBe(true);
      const ended = await match.ownerSocket.next<MatchUpdated>(
        (message) =>
          message.type === 'MATCH_UPDATED' && message.payload.match.status !== 'IN_PROGRESS',
      );
      expect(ended.payload.match).toMatchObject({
        status: 'FINISHED',
        result: { reason: 'ABANDONMENT' },
      });
      expect(ended.payload.match.result?.seats[1 - guestSeat]?.outcome).toBe('WIN');
      expect(ended.payload.match.players[guestSeat]?.abandonAt).toBeNull();

      // Quien abandonó sale de la sala; la sala vuelve a la espera con el resto (regla 7.32).
      const room = await roomOf(t, match.owner, match.roomId);
      expect(room.status).toBe('WAITING');
      expect(room.members.map((member) => member.playerId)).toEqual([match.owner.playerId]);
    });

    it('la revisión periódica aplica un abandono cuyo aviso no llegó', async () => {
      const match = await followedMatch();
      await match.guestSocket.close();
      await match.ownerSocket.nextOfType('MATCH_UPDATED');

      expect(await sessions.abandonDueMatches()).toBe(0);
      t.clock.advance(ABANDON_MS);
      expect(await sessions.abandonDueMatches()).toBe(1);
      expect((await viewOf(t, match.owner, match.matchId)).result?.reason).toBe('ABANDONMENT');
      expect(await sessions.abandonDueMatches()).toBe(0);
    });

    it('si quien abandona es el anfitrión, la sala se cierra', async () => {
      const match = await followedMatch();
      await match.ownerSocket.close();
      await match.guestSocket.nextOfType('MATCH_UPDATED');

      t.clock.advance(ABANDON_MS);
      expect(await sessions.abandonIfDue(match.matchId)).toBe(true);

      const room = await roomOf(t, match.guest, match.roomId);
      expect(room).toMatchObject({ status: 'CLOSED', closeReason: 'OWNER_LEFT' });
    });

    it('quien vuelve a tiempo no pierde', async () => {
      const match = await followedMatch();
      const guestSeat = seatOf(match, match.guest);
      await match.guestSocket.close();
      await match.ownerSocket.nextOfType('MATCH_UPDATED');

      t.clock.advance(MINUTE_MS);
      await connect(server, match.guest);
      const back = await match.ownerSocket.nextOfType('MATCH_UPDATED');
      expect(back.payload.match.players[guestSeat]).toMatchObject({
        connected: true,
        abandonAt: null,
      });

      t.clock.advance(ABANDON_MS);
      expect(await sessions.abandonIfDue(match.matchId)).toBe(false);
      expect((await viewOf(t, match.owner, match.matchId)).status).toBe('IN_PROGRESS');
    });

    it('si no queda nadie conectado no pierde nadie, hasta que vuelve uno de los dos', async () => {
      const match = await followedMatch();
      await match.guestSocket.close();
      await match.ownerSocket.nextOfType('MATCH_UPDATED');
      await match.ownerSocket.close();

      t.clock.advance(3 * MINUTE_MS);
      expect(await sessions.abandonIfDue(match.matchId)).toBe(false);
      expect((await viewOf(t, match.owner, match.matchId)).status).toBe('IN_PROGRESS');

      // Vuelve el anfitrión: pierde quien sigue sin volver (ADR-015, decisión V2).
      const ownerSocket = await connect(server, match.owner);
      const notice = await ownerSocket.nextOfType('PLAYER_MATCH_UPDATED');
      expect(notice.payload.match.status).toBe('FINISHED');

      const view = await viewOf(t, match.owner, match.matchId);
      expect(view.result?.reason).toBe('ABANDONMENT');
      expect(view.result?.seats[seatOf(match, match.owner)]?.outcome).toBe('WIN');
    });

    it('si a quien falta ya se le había agotado el reloj, pierde por tiempo y sigue en la sala', async () => {
      const match = await followedMatch();
      // El asiento 0 tiene el turno.
      const absentSocket = match.first === match.owner ? match.ownerSocket : match.guestSocket;
      const presentSocket = match.first === match.owner ? match.guestSocket : match.ownerSocket;
      await absentSocket.close();
      await presentSocket.nextOfType('MATCH_UPDATED');

      t.clock.advance(FIVE_MINUTES_MS + SECOND_MS);
      expect(await sessions.abandonIfDue(match.matchId)).toBe(true);

      const view = await viewOf(t, match.second, match.matchId);
      expect(view.result?.reason).toBe('TIMEOUT');
      const room = await roomOf(t, match.second, match.roomId);
      expect(room.members.map((member) => member.playerId)).toContain(match.first.playerId);
    });
  });

  describe('abandono tras un reinicio', () => {
    it('el plazo de todos empieza de nuevo al arrancar, y pierde quien no vuelve', async () => {
      const t1 = await boot();
      const match = await startMatch(t1);
      await shutDown(t1);

      const t2 = await boot({ clockOffsetMs: 30 * SECOND_MS });
      const server = await t2.listen();
      const bootedAt = t2.clock.now().getTime();
      const view = await viewOf(t2, match.owner, match.matchId);
      for (const player of view.players) {
        expectNear(Date.parse(player.abandonAt ?? ''), bootedAt + ABANDON_MS);
      }

      await connect(server, match.owner);
      // Se deja que el servidor anote la vuelta.
      await new Promise((resolve) => setTimeout(resolve, 100));
      t2.clock.advance(ABANDON_MS);
      expect(await t2.app.get(GameSessionsService).abandonIfDue(match.matchId)).toBe(true);

      const ended = await viewOf(t2, match.owner, match.matchId);
      expect(ended.result?.reason).toBe('ABANDONMENT');
      expect(ended.result?.seats[match.owner === match.first ? 0 : 1]?.outcome).toBe('WIN');
    });
  });

  describe('margen de desconexión', () => {
    it('quien recarga la página no aparece desconectado; quien se va, pasado el margen', async () => {
      const t = await boot({ env: { REALTIME_DISCONNECT_GRACE_SECONDS: '0.3' } });
      const server = await t.listen();
      const match = await startMatch(t);
      const ownerSocket = await follow(server, match.owner, match.matchId);
      const guestSocket = await connect(server, match.guest);
      await ownerSocket.nextOfType('MATCH_UPDATED');
      await ownerSocket.quiet();

      // Cerrar y volver a abrir dentro del margen no cambia nada para el rival.
      await guestSocket.close();
      const again = await connect(server, match.guest);
      expect(await ownerSocket.quiet(500)).toEqual([]);

      await again.close();
      expect(await ownerSocket.quiet(100)).toEqual([]);
      const left = await ownerSocket.nextOfType('MATCH_UPDATED');
      const guestSeat = match.guest === match.first ? 0 : 1;
      expect(left.payload.match.players[guestSeat]?.connected).toBe(false);
    });
  });
});
