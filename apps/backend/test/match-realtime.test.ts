import { randomUUID } from 'node:crypto';
import type { MatchView, Notification } from '@gameboard/contracts';
import { fourInARowEngine } from '@gameboard/game-engine';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GameSessionsService } from '../src/modules/game-sessions/game-sessions.service.js';
import { createTestApp, type TestApp } from './app.js';
import { query, resetDatabase } from './database.js';
import { MINUTE_MS, seedFourInARow, type StartedMatch, startMatch } from './match-setup.js';
import { signUp, type TestPlayer } from './players.js';
import { TestSocket } from './realtime-client.js';

type MatchUpdated = Extract<Notification, { type: 'MATCH_UPDATED' }>;
type MatchSubscribed = Extract<Notification, { type: 'MATCH_SUBSCRIBED' }>;

describe('partidas por el canal de tiempo real', () => {
  let t: TestApp;
  let server: string;
  let sockets: TestSocket[];
  let sessions: GameSessionsService;

  beforeAll(async () => {
    await resetDatabase();
    t = await createTestApp({ engines: [fourInARowEngine] });
    sessions = t.app.get(GameSessionsService);
    server = await t.listen();
  });
  afterAll(async () => {
    await t.close();
    await resetDatabase();
  });
  beforeEach(async () => {
    t.clock.reset();
    sockets = [];
    await resetDatabase();
    await seedFourInARow();
  });
  afterEach(async () => {
    await Promise.all(sockets.map((socket) => socket.close()));
  });

  // --- Ayudas --------------------------------------------------------------

  /** Abre una conexión con la sesión de ese jugador y consume el mensaje de bienvenida. */
  async function connect(player: TestPlayer): Promise<TestSocket> {
    const socket = await TestSocket.open(server, { cookie: player.cookie });
    sockets.push(socket);
    await socket.nextOfType('CONNECTION_ESTABLISHED');
    return socket;
  }

  /** Abre una conexión y la suscribe a la partida. */
  async function follow(player: TestPlayer, matchId: string): Promise<TestSocket> {
    const socket = await connect(player);
    const response = await socket.command({ type: 'SUBSCRIBE_MATCH', matchId });
    expect(response.type).toBe('MATCH_SUBSCRIBED');
    return socket;
  }

  /** Una partida empezada con sus dos jugadores conectados y suscritos. */
  async function startFollowedMatch(): Promise<
    StartedMatch & { firstSocket: TestSocket; secondSocket: TestSocket }
  > {
    const match = await startMatch(t);
    const firstSocket = await follow(match.first, match.matchId);
    const secondSocket = await follow(match.second, match.matchId);
    // Al conectarse cada uno, los suscritos ven cambiar su presencia: se deja pasar.
    await Promise.all([firstSocket.quiet(), secondSocket.quiet()]);
    return { ...match, firstSocket, secondSocket };
  }

  function drop(socket: TestSocket, matchId: string, column: number, stateVersion: number) {
    return socket.command({
      type: 'SUBMIT_ACTION',
      matchId,
      payload: { stateVersion, action: { type: 'DROP_TOKEN', column } },
    });
  }

  // --- Suscripción ---------------------------------------------------------

  describe('suscripción', () => {
    it('responde con la partida completa, desde el asiento de quien se suscribe', async () => {
      const match = await startMatch(t);
      const first = await connect(match.first);
      const second = await connect(match.second);

      const toFirst = (await first.command({
        type: 'SUBSCRIBE_MATCH',
        matchId: match.matchId,
      })) as MatchSubscribed;
      const toSecond = (await second.command({
        type: 'SUBSCRIBE_MATCH',
        matchId: match.matchId,
      })) as MatchSubscribed;

      expect(toFirst).toMatchObject({
        type: 'MATCH_SUBSCRIBED',
        matchId: match.matchId,
        payload: {
          match: {
            matchId: match.matchId,
            status: 'IN_PROGRESS',
            stateVersion: 0,
            yourSeat: 0,
            activeSeats: [0],
          },
        },
      });
      expect(toSecond.payload.match.yourSeat).toBe(1);
      expect(toSecond.payload.match.players.map((player) => player.connected)).toEqual([
        true,
        true,
      ]);
    });

    it('los relojes van medidos en la hora del mensaje', async () => {
      const match = await startMatch(t);
      const socket = await connect(match.second);
      t.clock.advance(30 * 1000);

      const response = (await socket.command({
        type: 'SUBSCRIBE_MATCH',
        matchId: match.matchId,
      })) as MatchSubscribed;

      const { players, turnDeadlineAt } = response.payload.match;
      const remaining = players[0]?.clockRemainingMs ?? 0;
      // Lo que le queda a quien juega es lo que falta hasta la fecha límite.
      expect(Date.parse(turnDeadlineAt as string) - Date.parse(response.serverTime)).toBe(
        remaining,
      );
      expect(remaining).toBeLessThanOrEqual(5 * MINUTE_MS - 30 * 1000);
    });

    it('rechaza a quien no participa y la partida que no existe', async () => {
      const match = await startMatch(t);
      const outsider = await connect(await signUp(t));

      expect(
        await outsider.command({ type: 'SUBSCRIBE_MATCH', matchId: match.matchId }),
      ).toMatchObject({
        type: 'COMMAND_REJECTED',
        payload: { code: 'PLAYER_NOT_IN_MATCH', commandType: 'SUBSCRIBE_MATCH' },
      });
      expect(
        await outsider.command({ type: 'SUBSCRIBE_MATCH', matchId: randomUUID() }),
      ).toMatchObject({
        type: 'COMMAND_REJECTED',
        payload: { code: 'MATCH_NOT_FOUND', commandType: 'SUBSCRIBE_MATCH' },
      });
    });

    it('quien deja de seguir la partida ya no recibe sus cambios', async () => {
      const { matchId, firstSocket, secondSocket } = await startFollowedMatch();

      expect(await secondSocket.command({ type: 'UNSUBSCRIBE_MATCH', matchId })).toMatchObject({
        type: 'MATCH_UNSUBSCRIBED',
        matchId,
      });
      await drop(firstSocket, matchId, 3, 0);

      // Solo le llega su aviso personal, que no necesita suscripción.
      const received = await secondSocket.quiet();
      expect(received.map((message) => message.type)).toEqual(['PLAYER_MATCH_UPDATED']);
    });

    it('una partida terminada se responde con su estado final y no deja suscripción', async () => {
      const match = await startMatch(t);
      await sessions.resign(match.first.playerId, match.matchId, randomUUID());
      const socket = await connect(match.second);

      const response = (await socket.command({
        type: 'SUBSCRIBE_MATCH',
        matchId: match.matchId,
      })) as MatchSubscribed;

      expect(response).toMatchObject({
        type: 'MATCH_SUBSCRIBED',
        payload: { match: { status: 'FINISHED', result: { reason: 'RESIGNATION' } } },
      });
      // Si hubiera suscripción, vería conectarse a su rival.
      await connect(match.first);
      expect(await socket.quiet()).toEqual([]);
    });
  });

  // --- Jugadas -------------------------------------------------------------

  describe('jugadas', () => {
    it('quien juega recibe la respuesta con su petición, y su rival, el mismo aviso sin ella', async () => {
      const { matchId, firstSocket, secondSocket } = await startFollowedMatch();

      const response = (await drop(firstSocket, matchId, 3, 0)) as MatchUpdated;
      const notice = await secondSocket.nextOfType('MATCH_UPDATED');

      expect(response).toMatchObject({
        type: 'MATCH_UPDATED',
        matchId,
        payload: {
          match: { stateVersion: 1, yourSeat: 0, activeSeats: [1] },
          events: [{ type: 'TOKEN_DROPPED', seat: 0, column: 3, row: 0 }],
        },
      });
      expect(notice.requestId).toBeUndefined();
      expect(notice.payload.events).toEqual(response.payload.events);
      expect(notice.payload.match).toMatchObject({ stateVersion: 1, yourSeat: 1 });
      expect((notice.payload.match.view as { lastToken: unknown }).lastToken).toEqual({
        seat: 0,
        column: 3,
        row: 0,
      });
    });

    it('cada orden recibe una sola respuesta', async () => {
      const { matchId, firstSocket } = await startFollowedMatch();

      await drop(firstSocket, matchId, 3, 0);

      const rest = await firstSocket.quiet();
      expect(rest.map((message) => message.type)).toEqual(['PLAYER_MATCH_UPDATED']);
    });

    it('quien juega sin estar suscrito también recibe su respuesta', async () => {
      const match = await startMatch(t);
      const socket = await connect(match.first);

      const response = await drop(socket, match.matchId, 3, 0);

      expect(response).toMatchObject({
        type: 'MATCH_UPDATED',
        payload: { match: { stateVersion: 1, yourSeat: 0 } },
      });
    });

    it('las demás conexiones de quien juega reciben el aviso sin la petición', async () => {
      const { matchId, first, firstSocket } = await startFollowedMatch();
      const otherTab = await follow(first, matchId);

      const response = (await drop(firstSocket, matchId, 3, 0)) as MatchUpdated;
      const notice = await otherTab.nextOfType('MATCH_UPDATED');

      expect(response.requestId).toBeDefined();
      expect(notice.requestId).toBeUndefined();
      expect(notice.payload.match.stateVersion).toBe(1);
    });

    it('nadie puede jugar por otro: quien actúa es siempre el de la sesión', async () => {
      const { matchId, secondSocket } = await startFollowedMatch();

      // Le toca al asiento 0. El asiento 1 no puede jugar su turno.
      expect(await drop(secondSocket, matchId, 3, 0)).toMatchObject({
        type: 'COMMAND_REJECTED',
        payload: { code: 'NOT_YOUR_TURN', commandType: 'SUBMIT_ACTION' },
      });
      expect(await query('select sequence from match_actions')).toEqual([]);
    });

    it('rechaza con el motivo del juego y con la versión actual del estado', async () => {
      const { matchId, firstSocket, secondSocket } = await startFollowedMatch();

      expect(await drop(firstSocket, matchId, 9, 0)).toMatchObject({
        type: 'COMMAND_REJECTED',
        payload: {
          code: 'INVALID_ACTION',
          commandType: 'SUBMIT_ACTION',
          reason: 'COLUMN_OUT_OF_RANGE',
        },
      });

      await drop(firstSocket, matchId, 3, 0);
      const stale = await drop(secondSocket, matchId, 3, 0);
      expect(stale).toMatchObject({
        type: 'COMMAND_REJECTED',
        payload: {
          code: 'STALE_STATE_VERSION',
          commandType: 'SUBMIT_ACTION',
          currentStateVersion: 1,
        },
      });
      expect((stale as { payload: object }).payload).not.toHaveProperty('reason');
    });

    it('rechaza una orden de juego mal formada', async () => {
      const { matchId, firstSocket } = await startFollowedMatch();
      const requestId = randomUUID();

      firstSocket.sendRaw(
        JSON.stringify({ type: 'SUBMIT_ACTION', requestId, matchId, payload: { action: {} } }),
      );

      expect(await firstSocket.nextOfType('COMMAND_REJECTED')).toMatchObject({
        requestId,
        payload: { code: 'INVALID_MESSAGE', commandType: 'SUBMIT_ACTION' },
      });
    });

    it('una petición repetida se responde con la partida tal como está, sin avisar a nadie', async () => {
      const { matchId, firstSocket, secondSocket } = await startFollowedMatch();
      const requestId = randomUUID();
      const order = JSON.stringify({
        type: 'SUBMIT_ACTION',
        requestId,
        matchId,
        payload: { stateVersion: 0, action: { type: 'DROP_TOKEN', column: 3 } },
      });
      firstSocket.sendRaw(order);
      await firstSocket.nextOfType('MATCH_UPDATED');
      await secondSocket.nextOfType('PLAYER_MATCH_UPDATED');
      await firstSocket.quiet();

      firstSocket.sendRaw(order);

      const repeated = await firstSocket.nextOfType('MATCH_UPDATED');
      expect(repeated).toMatchObject({
        requestId,
        payload: { match: { stateVersion: 1 }, events: [] },
      });
      expect(await secondSocket.quiet()).toEqual([]);
      expect(await query('select sequence from match_actions')).toHaveLength(1);
    });
  });

  // --- Final ---------------------------------------------------------------

  describe('final de partida', () => {
    it('la última jugada llega con el resultado, y la suscripción termina', async () => {
      const { matchId, first, firstSocket, secondSocket } = await startFollowedMatch();
      for (const [index, column] of [0, 1, 0, 1, 0, 1].entries()) {
        await drop(index % 2 === 0 ? firstSocket : secondSocket, matchId, column, index);
      }
      await firstSocket.quiet();
      await secondSocket.quiet();

      const response = (await drop(firstSocket, matchId, 0, 6)) as MatchUpdated;
      const notice = await secondSocket.nextOfType('MATCH_UPDATED');

      for (const message of [response, notice]) {
        expect(message.payload.match).toMatchObject({
          status: 'FINISHED',
          stateVersion: 7,
          activeSeats: [],
          result: {
            reason: 'COMPLETED',
            seats: [
              { seat: 0, outcome: 'WIN' },
              { seat: 1, outcome: 'LOSS' },
            ],
          },
        });
      }

      // La suscripción terminó: otra conexión de un jugador ya no cambia nada para su rival.
      await secondSocket.quiet();
      await connect(first);
      expect(await secondSocket.quiet()).toEqual([]);
    });

    it('rendirse responde con la partida terminada', async () => {
      const { matchId, firstSocket, secondSocket } = await startFollowedMatch();

      const response = await secondSocket.command({ type: 'RESIGN_MATCH', matchId });
      const notice = await firstSocket.nextOfType('MATCH_UPDATED');

      expect(response).toMatchObject({
        type: 'MATCH_UPDATED',
        payload: { match: { status: 'FINISHED', result: { reason: 'RESIGNATION' } }, events: [] },
      });
      expect(notice.requestId).toBeUndefined();
      expect(notice.payload.match.result?.seats).toEqual([
        { seat: 0, outcome: 'WIN' },
        { seat: 1, outcome: 'LOSS' },
      ]);

      expect(await secondSocket.command({ type: 'RESIGN_MATCH', matchId })).toMatchObject({
        type: 'COMMAND_REJECTED',
        payload: { code: 'MATCH_NOT_IN_PROGRESS', commandType: 'RESIGN_MATCH' },
      });
    });

    it('cuando se agota un reloj, los dos jugadores reciben el final', async () => {
      const { matchId, firstSocket, secondSocket } = await startFollowedMatch();
      t.clock.advance(5 * MINUTE_MS + 1);

      await sessions.expireIfDue(matchId);

      for (const socket of [firstSocket, secondSocket]) {
        const notice = await socket.nextOfType('MATCH_UPDATED');
        expect(notice.requestId).toBeUndefined();
        expect(notice.payload.match).toMatchObject({
          status: 'FINISHED',
          result: { reason: 'TIMEOUT' },
        });
        expect(notice.payload.match.players[0]?.clockRemainingMs).toBe(0);
      }
    });

    it('una jugada con el reloj vencido se rechaza, y el final llega como aviso', async () => {
      const { matchId, firstSocket, secondSocket } = await startFollowedMatch();
      t.clock.advance(5 * MINUTE_MS + 1);

      const response = await drop(firstSocket, matchId, 3, 0);

      expect(response).toMatchObject({
        type: 'COMMAND_REJECTED',
        payload: { code: 'CLOCK_EXPIRED', commandType: 'SUBMIT_ACTION' },
      });
      const notice = await secondSocket.nextOfType('MATCH_UPDATED');
      expect(notice.payload.match).toMatchObject({
        status: 'FINISHED',
        result: { reason: 'TIMEOUT' },
      });
    });

    it('una partida anulada llega como último aviso', async () => {
      const { matchId, firstSocket, secondSocket } = await startFollowedMatch();
      await query(`update game_sessions set state = '[]' where match_id = $1`, [matchId]);

      const response = await drop(firstSocket, matchId, 3, 0);

      expect(response).toMatchObject({
        type: 'COMMAND_REJECTED',
        payload: { code: 'MATCH_NOT_IN_PROGRESS' },
      });
      const notice = await secondSocket.nextOfType('MATCH_UPDATED');
      expect(notice.payload.match).toMatchObject({
        status: 'ABORTED',
        abortReason: 'FAILURE',
        result: null,
        view: null,
      });
    });
  });

  // --- Presencia y aviso personal -------------------------------------------

  describe('presencia y aviso personal', () => {
    it('los suscritos ven conectarse y desconectarse a su rival', async () => {
      const match = await startMatch(t);
      const firstSocket = await follow(match.first, match.matchId);
      // Su propia llegada también se anuncia: se deja pasar.
      await firstSocket.quiet();

      const secondSocket = await connect(match.second);
      const arrived = await firstSocket.nextOfType('MATCH_UPDATED');
      expect(arrived.payload.events).toEqual([]);
      expect(arrived.payload.match.players.map((player) => player.connected)).toEqual([true, true]);
      // La presencia no cambia la versión del estado.
      expect(arrived.payload.match.stateVersion).toBe(0);

      await secondSocket.close();
      const left = await firstSocket.nextOfType('MATCH_UPDATED');
      expect(left.payload.match.players.map((player) => player.connected)).toEqual([true, false]);
      expect(left.payload.match.players[1]?.abandonAt).toBeNull();
    });

    it('al empezar la partida, cada jugador recibe su aviso personal sin suscribirse', async () => {
      const owner = await signUp(t);
      const guest = await signUp(t);
      const { roomId } = (
        await owner.post('/rooms', {
          gameSlug: 'four-in-a-row',
          mode: 'REALTIME',
          timeControl: { type: 'TOTAL_PER_PLAYER', totalMs: 5 * MINUTE_MS },
          maxPlayers: 2,
        })
      ).body.data as { roomId: string };
      await guest.put(`/rooms/${roomId}/members/me`);
      const ownerSocket = await connect(owner);
      const guestSocket = await connect(guest);

      await owner.put(`/rooms/${roomId}/members/me/ready`, { ready: true });
      await guest.put(`/rooms/${roomId}/members/me/ready`, { ready: true });

      const toOwner = await ownerSocket.nextOfType('PLAYER_MATCH_UPDATED');
      const toGuest = await guestSocket.nextOfType('PLAYER_MATCH_UPDATED');
      expect(toOwner.matchId).toBe(toGuest.matchId);
      expect(toOwner.payload.match).toMatchObject({
        roomId,
        gameSlug: 'four-in-a-row',
        status: 'IN_PROGRESS',
        opponents: [{ playerId: guest.playerId }],
        yourOutcome: null,
      });
      // Le toca a uno de los dos, y solo a uno.
      expect([toOwner.payload.match.yourTurn, toGuest.payload.match.yourTurn].sort()).toEqual([
        false,
        true,
      ]);
    });

    it('con cada cambio de turno y al final llega el aviso personal a todas las conexiones', async () => {
      const { matchId, second, firstSocket, secondSocket } = await startFollowedMatch();
      const otherTab = await connect(second);
      await firstSocket.quiet();

      await drop(firstSocket, matchId, 3, 0);
      for (const socket of [secondSocket, otherTab]) {
        const notice = await socket.nextOfType('PLAYER_MATCH_UPDATED');
        expect(notice.payload.match).toMatchObject({ matchId, yourTurn: true });
      }
      expect((await firstSocket.nextOfType('PLAYER_MATCH_UPDATED')).payload.match.yourTurn).toBe(
        false,
      );

      await firstSocket.command({ type: 'RESIGN_MATCH', matchId });
      const final = await otherTab.nextOfType('PLAYER_MATCH_UPDATED');
      expect(final.payload.match).toMatchObject({
        status: 'FINISHED',
        yourTurn: false,
        turnDeadlineAt: null,
        yourOutcome: 'WIN',
        endReason: 'RESIGNATION',
      });
    });

    it('la vista del juego que recibe cada uno es la de su asiento', async () => {
      const { matchId, firstSocket, secondSocket } = await startFollowedMatch();

      const response = (await drop(firstSocket, matchId, 3, 0)) as MatchUpdated;
      const notice = await secondSocket.nextOfType('MATCH_UPDATED');

      const views = [response, notice].map((message) => message.payload.match as MatchView);
      expect(views.map((view) => view.yourSeat)).toEqual([0, 1]);
      // Cuatro en raya no oculta nada: los dos ven el mismo tablero.
      expect(views[0]?.view).toEqual(views[1]?.view);
    });
  });
});
