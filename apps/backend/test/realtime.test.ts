import { randomUUID } from 'node:crypto';
import type { RoomView } from '@gameboard/contracts';
import { createFakeEngine } from '@gameboard/game-engine/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway.js';
import { RoomsService } from '../src/modules/rooms/rooms.service.js';
import { createTestApp, type TestApp } from './app.js';
import { query, resetDatabase } from './database.js';
import { signUp, type TestPlayer } from './players.js';
import { HandshakeRejected, type OpenOptions, TestSocket } from './realtime-client.js';
import { seedGame } from './seed.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const FIVE_MINUTES = { type: 'TOTAL_PER_PLAYER', totalMs: 5 * MINUTE_MS } as const;
const ONE_DAY = { type: 'TOTAL_PER_PLAYER', totalMs: DAY_MS } as const;

const engines = [
  createFakeEngine('party', '1.0.0', {
    minPlayers: 2,
    maxPlayers: 4,
    timeControls: { REALTIME: [FIVE_MINUTES], TURN_BASED: [ONE_DAY] },
  }),
];

const PARTY = { gameSlug: 'party', mode: 'REALTIME', timeControl: FIVE_MINUTES, maxPlayers: 3 };
const PARTY_BY_TURNS = {
  gameSlug: 'party',
  mode: 'TURN_BASED',
  timeControl: ONE_DAY,
  maxPlayers: 3,
};

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('canal de tiempo real', () => {
  let t: TestApp;
  let server: string;
  let sockets: TestSocket[];

  beforeAll(async () => {
    await resetDatabase();
    t = await createTestApp({
      engines,
      env: {
        REALTIME_MAX_CONNECTIONS_PER_PLAYER: '3',
        REALTIME_MAX_SUBSCRIPTIONS_PER_CONNECTION: '2',
      },
    });
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
    await seedGame({
      slug: 'party',
      name: 'Party',
      versions: [{ version: '1.0.0', isCurrent: true }],
    });
  });
  afterEach(async () => {
    await Promise.all(sockets.map((socket) => socket.close()));
  });

  /** Abre una conexión con la sesión de ese jugador y consume el mensaje de bienvenida. */
  async function connect(player: TestPlayer, options: OpenOptions = {}): Promise<TestSocket> {
    const socket = await TestSocket.open(server, { cookie: player.cookie, ...options });
    sockets.push(socket);
    await socket.nextOfType('CONNECTION_ESTABLISHED');
    return socket;
  }

  async function createRoom(owner: TestPlayer, body: object = PARTY): Promise<RoomView> {
    const response = await owner.post('/rooms', body);
    expect(response.status, response.text).toBe(201);
    return response.body.data as RoomView;
  }

  async function join(player: TestPlayer, room: RoomView): Promise<void> {
    const response = await player.put(`/rooms/${room.roomId}/members/me`);
    expect(response.status, response.text).toBe(200);
  }

  const gateway = () => t.app.get(RealtimeGateway);

  describe('apertura', () => {
    it('acepta la conexión de una sesión válida y envía el mensaje de bienvenida', async () => {
      const ana = await signUp(t);

      const socket = await TestSocket.open(server, { cookie: ana.cookie });
      sockets.push(socket);
      const first = await socket.next();

      expect(first).toEqual({
        type: 'CONNECTION_ESTABLISHED',
        serverTime: expect.stringMatching(ISO_DATE_TIME),
        payload: {
          protocolVersion: 1,
          playerId: ana.playerId,
          heartbeatIntervalMs: 25_000,
          maxMessageBytes: 16 * 1024,
        },
      });
    });

    it('rechaza la apertura sin sesión válida', async () => {
      const withoutCookie = TestSocket.open(server);
      const unknownSession = TestSocket.open(server, { cookie: `session=${'a'.repeat(43)}` });

      await expect(withoutCookie).rejects.toMatchObject({ status: 401 });
      await expect(unknownSession).rejects.toMatchObject({ status: 401 });
    });

    it('rechaza la apertura de una sesión ya cerrada', async () => {
      const ana = await signUp(t);
      await ana.post('/auth/logout');

      await expect(TestSocket.open(server, { cookie: ana.cookie })).rejects.toBeInstanceOf(
        HandshakeRejected,
      );
    });

    it('rechaza la apertura desde otro origen, aunque traiga una sesión válida', async () => {
      const ana = await signUp(t);

      const otherOrigin = TestSocket.open(server, {
        cookie: ana.cookie,
        origin: 'https://otro-sitio.example',
      });
      const noOrigin = TestSocket.open(server, { cookie: ana.cookie, origin: null });

      await expect(otherOrigin).rejects.toMatchObject({ status: 403 });
      await expect(noOrigin).rejects.toMatchObject({ status: 403 });
    });

    it.each([['2'], ['uno'], [null]])(
      'con una versión del protocolo no admitida (%s) acepta la conexión y la cierra con 4002',
      async (protocolVersion) => {
        const ana = await signUp(t);

        const socket = await TestSocket.open(server, { cookie: ana.cookie, protocolVersion });

        expect(await socket.closed).toEqual({ code: 4002 });
        expect(await socket.quiet(0)).toEqual([]);
      },
    );

    it('cierra con 4003 la conexión que supera el máximo por jugador', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const first = await connect(ana);
      await connect(ana);
      await connect(ana);

      const fourth = await TestSocket.open(server, { cookie: ana.cookie });

      expect(await fourth.closed).toEqual({ code: 4003 });
      // El límite es por jugador: otro jugador sí puede conectarse.
      await connect(bea);
      // Al cerrar una, vuelve a haber sitio.
      await first.close();
      await expect.poll(() => connect(ana).then(() => true)).toBe(true);
    });
  });

  describe('mensajes del cliente', () => {
    it('cierra con 1009 la conexión que envía un mensaje demasiado grande', async () => {
      const ana = await signUp(t);
      const socket = await connect(ana);

      socket.sendRaw(JSON.stringify({ type: 'SUBSCRIBE_ROOM', padding: 'x'.repeat(17 * 1024) }));

      expect(await socket.closed).toEqual({ code: 1009 });
    });

    it('rechaza lo que no es una orden del protocolo, con lo que pudo leer de ella', async () => {
      const ana = await signUp(t);
      const socket = await connect(ana);
      const requestId = randomUUID();
      const rejection = (extra: object) => ({
        type: 'COMMAND_REJECTED',
        serverTime: expect.stringMatching(ISO_DATE_TIME),
        ...extra,
      });

      socket.sendRaw('esto no es JSON');
      expect(await socket.next()).toEqual(
        rejection({ payload: { code: 'INVALID_MESSAGE', commandType: null } }),
      );

      socket.sendRaw(Buffer.from([1, 2, 3]));
      expect(await socket.next()).toEqual(
        rejection({ payload: { code: 'INVALID_MESSAGE', commandType: null } }),
      );

      socket.sendRaw(JSON.stringify({ type: 'DANCE', requestId }));
      expect(await socket.next()).toEqual(
        rejection({ requestId, payload: { code: 'INVALID_MESSAGE', commandType: null } }),
      );

      // Le falta `roomId`.
      socket.sendRaw(JSON.stringify({ type: 'SUBSCRIBE_ROOM', requestId }));
      expect(await socket.next()).toEqual(
        rejection({
          requestId,
          payload: { code: 'INVALID_MESSAGE', commandType: 'SUBSCRIBE_ROOM' },
        }),
      );

      // Trae un campo que no es de la orden.
      socket.sendRaw(
        JSON.stringify({ type: 'SUBSCRIBE_ROOM', requestId, roomId: randomUUID(), playerId: 'x' }),
      );
      expect(await socket.next()).toMatchObject({ payload: { code: 'INVALID_MESSAGE' } });
    });

    it('responde a las órdenes de partida que la partida no existe', async () => {
      const ana = await signUp(t);
      const socket = await connect(ana);
      const matchId = randomUUID();

      const responses = [
        await socket.command({ type: 'SUBSCRIBE_MATCH', matchId }),
        await socket.command({ type: 'RESIGN_MATCH', matchId }),
        await socket.command({
          type: 'SUBMIT_ACTION',
          matchId,
          payload: { stateVersion: 0, action: { type: 'INCREMENT' } },
        }),
      ];

      expect(responses).toMatchObject([
        {
          type: 'COMMAND_REJECTED',
          payload: { code: 'MATCH_NOT_FOUND', commandType: 'SUBSCRIBE_MATCH' },
        },
        {
          type: 'COMMAND_REJECTED',
          payload: { code: 'MATCH_NOT_FOUND', commandType: 'RESIGN_MATCH' },
        },
        {
          type: 'COMMAND_REJECTED',
          payload: { code: 'MATCH_NOT_FOUND', commandType: 'SUBMIT_ACTION' },
        },
      ]);
      expect(await socket.command({ type: 'UNSUBSCRIBE_MATCH', matchId })).toMatchObject({
        type: 'MATCH_UNSUBSCRIBED',
        matchId,
      });
    });
  });

  describe('suscripción a una sala', () => {
    it('un miembro recibe el estado completo de la sala, igual que por la API', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana);
      await join(bea, room);
      const socket = await connect(bea);

      const response = await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: room.roomId });

      const fromApi = await bea.get(`/rooms/${room.roomId}`);
      expect(response).toEqual({
        type: 'ROOM_SUBSCRIBED',
        serverTime: expect.stringMatching(ISO_DATE_TIME),
        requestId: expect.any(String),
        roomId: room.roomId,
        payload: { room: fromApi.body.data },
      });
      expect(fromApi.body.data.members).toMatchObject([
        { playerId: ana.playerId, connected: false },
        { playerId: bea.playerId, connected: true },
      ]);
    });

    it('rechaza a quien no es miembro', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana);
      const socket = await connect(bea);

      const response = await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: room.roomId });

      expect(response).toMatchObject({
        type: 'COMMAND_REJECTED',
        payload: { code: 'PLAYER_NOT_IN_ROOM', commandType: 'SUBSCRIBE_ROOM' },
      });
    });

    it('responde que la sala no existe si no existe o ya está cerrada', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const closed = await createRoom(ana);
      await join(bea, closed);
      await ana.delete(`/rooms/${closed.roomId}/members/me`);
      const socket = await connect(bea);

      for (const roomId of [randomUUID(), closed.roomId]) {
        expect(await socket.command({ type: 'SUBSCRIBE_ROOM', roomId })).toMatchObject({
          type: 'COMMAND_REJECTED',
          payload: { code: 'ROOM_NOT_FOUND', commandType: 'SUBSCRIBE_ROOM' },
        });
      }
    });

    it('limita las suscripciones de una conexión', async () => {
      const ana = await signUp(t);
      const rooms = [
        await createRoom(ana, PARTY_BY_TURNS),
        await createRoom(ana, PARTY_BY_TURNS),
        await createRoom(ana, PARTY_BY_TURNS),
      ] as const;
      const socket = await connect(ana);
      await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: rooms[0].roomId });
      await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: rooms[1].roomId });

      const third = await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: rooms[2].roomId });
      // Repetir una suscripción que ya se tiene no cuenta de nuevo.
      const again = await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: rooms[0].roomId });

      expect(third).toMatchObject({
        type: 'COMMAND_REJECTED',
        payload: { code: 'RATE_LIMITED', commandType: 'SUBSCRIBE_ROOM' },
      });
      expect(again).toMatchObject({ type: 'ROOM_SUBSCRIBED' });

      // Al dejar una, cabe otra.
      await socket.command({ type: 'UNSUBSCRIBE_ROOM', roomId: rooms[1].roomId });
      expect(
        await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: rooms[2].roomId }),
      ).toMatchObject({ type: 'ROOM_SUBSCRIBED' });
    });
  });

  describe('avisos de una sala', () => {
    it('los suscritos reciben el estado completo cuando alguien entra, se marca listo o sale', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana);
      const socket = await connect(ana);
      await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: room.roomId });

      await join(bea, room);
      const joined = await socket.nextOfType('ROOM_UPDATED');
      expect(joined).toEqual({
        type: 'ROOM_UPDATED',
        serverTime: expect.stringMatching(ISO_DATE_TIME),
        roomId: room.roomId,
        payload: { room: expect.objectContaining({ roomId: room.roomId, status: 'WAITING' }) },
      });
      expect(joined.payload.room.members).toMatchObject([
        { playerId: ana.playerId, ready: false, connected: true },
        { playerId: bea.playerId, ready: false, connected: false },
      ]);

      await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });
      const ready = await socket.nextOfType('ROOM_UPDATED');
      expect(ready.payload.room.members).toMatchObject([{ ready: false }, { ready: true }]);

      await bea.delete(`/rooms/${room.roomId}/members/me`);
      const left = await socket.nextOfType('ROOM_UPDATED');
      expect(left.payload.room.members).toMatchObject([{ playerId: ana.playerId }]);
    });

    it('llegan a todas las conexiones suscritas, y solo a ellas', async () => {
      const [ana, bea, carla] = [await signUp(t), await signUp(t), await signUp(t)];
      const room = await createRoom(ana);
      await join(bea, room);
      const [first, second, unsubscribed, other] = [
        await connect(ana),
        await connect(ana),
        await connect(bea),
        await connect(carla),
      ];
      await first.command({ type: 'SUBSCRIBE_ROOM', roomId: room.roomId });
      await second.command({ type: 'SUBSCRIBE_ROOM', roomId: room.roomId });
      // Las conexiones de Bea y de Carla hicieron llegar avisos de presencia.
      await first.quiet();
      await second.quiet();

      await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });

      expect(await first.nextOfType('ROOM_UPDATED')).toMatchObject({ roomId: room.roomId });
      expect(await second.nextOfType('ROOM_UPDATED')).toMatchObject({ roomId: room.roomId });
      expect(await unsubscribed.quiet()).toEqual([]);
      expect(await other.quiet(0)).toEqual([]);
    });

    it('quien sale de la sala deja de recibir sus cambios', async () => {
      const [ana, bea, carla] = [await signUp(t), await signUp(t), await signUp(t)];
      const room = await createRoom(ana);
      await join(bea, room);
      const socket = await connect(bea);
      await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: room.roomId });

      await bea.delete(`/rooms/${room.roomId}/members/me`);
      await join(carla, room);

      expect(await socket.quiet()).toEqual([]);
    });

    it('tras dejar la suscripción no llegan más avisos', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana);
      const socket = await connect(ana);
      await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: room.roomId });

      const response = await socket.command({ type: 'UNSUBSCRIBE_ROOM', roomId: room.roomId });
      await join(bea, room);

      expect(response).toEqual({
        type: 'ROOM_UNSUBSCRIBED',
        serverTime: expect.stringMatching(ISO_DATE_TIME),
        requestId: expect.any(String),
        roomId: room.roomId,
      });
      expect(await socket.quiet()).toEqual([]);
      // Dejar una suscripción que no se tiene no es un error.
      expect(
        await socket.command({ type: 'UNSUBSCRIBE_ROOM', roomId: randomUUID() }),
      ).toMatchObject({ type: 'ROOM_UNSUBSCRIBED' });
    });

    it('si el anfitrión sale, los suscritos reciben el cierre y la suscripción termina', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana);
      await join(bea, room);
      const socket = await connect(bea);
      await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: room.roomId });

      await ana.delete(`/rooms/${room.roomId}/members/me`);

      expect(await socket.next()).toEqual({
        type: 'ROOM_CLOSED',
        serverTime: expect.stringMatching(ISO_DATE_TIME),
        roomId: room.roomId,
        payload: { closeReason: 'OWNER_LEFT' },
      });
      // Bea ya no está suscrita: puede suscribirse a dos salas más.
      const others = [await createRoom(bea, PARTY_BY_TURNS), await createRoom(bea, PARTY_BY_TURNS)];
      for (const other of others) {
        expect(
          await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: other.roomId }),
        ).toMatchObject({
          type: 'ROOM_SUBSCRIBED',
        });
      }
    });

    it('una sala que se cierra por inactividad avisa a los suscritos', async () => {
      const ana = await signUp(t);
      const room = await createRoom(ana);
      const socket = await connect(ana);
      await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: room.roomId });

      t.clock.advance(31 * MINUTE_MS);
      await t.app.get(RoomsService).closeIdleRooms();

      expect(await socket.nextOfType('ROOM_CLOSED')).toMatchObject({
        roomId: room.roomId,
        payload: { closeReason: 'IDLE' },
      });
    });

    it('varios cambios seguidos acaban con el estado más reciente', async () => {
      const [ana, bea, carla] = [await signUp(t), await signUp(t), await signUp(t)];
      const room = await createRoom(ana);
      const socket = await connect(ana);
      await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: room.roomId });

      await Promise.all([
        join(bea, room),
        join(carla, room),
        ana.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true }),
      ]);

      const updates = (await socket.quiet(400)).filter((one) => one.type === 'ROOM_UPDATED');
      const last = updates.at(-1);
      const current = await ana.get(`/rooms/${room.roomId}`);
      expect(updates.length).toBeGreaterThanOrEqual(1);
      expect(last?.payload.room).toEqual(current.body.data);
      expect(current.body.data.members).toHaveLength(3);
    });
  });

  describe('presencia', () => {
    it('los suscritos ven cuándo un miembro se conecta y se desconecta', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana);
      await join(bea, room);
      const socket = await connect(ana);
      await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: room.roomId });

      const first = await connect(bea);
      const connected = await socket.nextOfType('ROOM_UPDATED');
      expect(connected.payload.room.members).toMatchObject([
        { playerId: ana.playerId, connected: true },
        { playerId: bea.playerId, connected: true },
      ]);

      // Una segunda conexión del mismo jugador no cambia su presencia.
      const second = await connect(bea);
      await first.close();
      expect(await socket.quiet()).toEqual([]);

      await second.close();
      const disconnected = await socket.nextOfType('ROOM_UPDATED');
      expect(disconnected.payload.room.members).toMatchObject([
        { playerId: ana.playerId, connected: true },
        { playerId: bea.playerId, connected: false },
      ]);
    });

    it('la conexión de alguien que no es miembro no avisa a nadie', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana);
      const socket = await connect(ana);
      await socket.command({ type: 'SUBSCRIBE_ROOM', roomId: room.roomId });

      await connect(bea);

      expect(await socket.quiet()).toEqual([]);
    });
  });

  describe('latidos', () => {
    it('envía un latido a cada conexión', async () => {
      const ana = await signUp(t);
      const socket = await connect(ana);

      gateway().sendHeartbeats();

      expect(await socket.next()).toEqual({
        type: 'SERVER_HEARTBEAT',
        serverTime: expect.stringMatching(ISO_DATE_TIME),
      });
    });

    it('mantiene la conexión que responde a los pings y corta la que no responde', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const alive = await connect(ana);
      const dead = await connect(bea, { autoPong: false });
      let deadClosed = false;
      void dead.closed.then(() => (deadClosed = true));

      gateway().sendHeartbeats();
      await alive.nextOfType('SERVER_HEARTBEAT');
      await dead.nextOfType('SERVER_HEARTBEAT');
      await alive.quiet(50);
      gateway().sendHeartbeats();

      // Un corte sin aviso de cierre: el cliente lo ve como una caída de la red.
      expect(await dead.closed).toEqual({ code: 1006 });
      expect(deadClosed).toBe(true);
      expect(await alive.nextOfType('SERVER_HEARTBEAT')).toBeDefined();
    });
  });

  describe('fin de la sesión', () => {
    it('al cerrar la sesión, sus conexiones se cierran con 4001', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const [first, second, other] = [await connect(ana), await connect(ana), await connect(bea)];

      await ana.post('/auth/logout');

      expect(await first.closed).toEqual({ code: 4001 });
      expect(await second.closed).toEqual({ code: 4001 });
      expect(await other.quiet()).toEqual([]);
    });

    it('la revalidación periódica cierra las conexiones de una sesión caducada', async () => {
      const ana = await signUp(t);
      const socket = await connect(ana);

      await gateway().revalidateSessions();
      expect(await socket.quiet(50)).toEqual([]);

      t.clock.advance(31 * DAY_MS);
      await gateway().revalidateSessions();

      expect(await socket.closed).toEqual({ code: 4001 });
    });

    it('la revalidación periódica cierra las conexiones de una cuenta suspendida', async () => {
      const ana = await signUp(t);
      const socket = await connect(ana);

      await query(`update users set status = 'SUSPENDED' where id = $1`, [ana.me.userId]);
      await gateway().revalidateSessions();

      expect(await socket.closed).toEqual({ code: 4001 });
    });

    it('una conexión abierta mantiene viva la sesión', async () => {
      const ana = await signUp(t);
      await connect(ana);

      // Veinte días con la conexión abierta, revalidando, y otros veinte después.
      for (let day = 0; day < 20; day += 1) {
        t.clock.advance(DAY_MS);
        await gateway().revalidateSessions();
      }
      t.clock.advance(20 * DAY_MS);

      const response = await ana.get('/me');
      expect(response.status).toBe(200);
    });
  });

  describe('apagado', () => {
    it('al apagar el servidor, las conexiones se cierran con 1012', async () => {
      const other = await createTestApp({ engines });
      const address = await other.listen();
      const ana = await signUp(other);
      const socket = await TestSocket.open(address, { cookie: ana.cookie });

      await other.close();

      expect(await socket.closed).toEqual({ code: 1012 });
    });
  });
});
