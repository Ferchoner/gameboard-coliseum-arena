import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { AdminGame, AdminUser, MatchView, RoomView } from '@gameboard/contracts';
import { fourInARowEngine } from '@gameboard/game-engine';
import { createFakeEngine } from '@gameboard/game-engine/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type RealtimeEvent, RealtimeEvents } from '../src/modules/broadcast/realtime-events.js';
import { GameSessionsService } from '../src/modules/game-sessions/game-sessions.service.js';
import { API, createTestApp, FRONTEND_ORIGIN, type TestApp } from './app.js';
import { expectMatchesContract } from './contract.js';
import { query, resetDatabase } from './database.js';
import {
  FIVE_MINUTES,
  FOUR_IN_A_ROW,
  MINUTE_MS,
  seedFourInARow,
  startMatch,
  startMatchIn,
} from './match-setup.js';
import { signUp, type TestPlayer } from './players.js';
import { TestSocket } from './realtime-client.js';
import { seedGame } from './seed.js';

const TEN_MINUTES = { type: 'TOTAL_PER_PLAYER', totalMs: 10 * MINUTE_MS } as const;

/**
 * Contador 1.0.0 admite cinco minutos; la 2.0.0, solo diez. La 3.0.0 está
 * dada de alta pero su motor no está en el servidor.
 */
const engines = [
  fourInARowEngine,
  createFakeEngine('counter', '1.0.0'),
  createFakeEngine('counter', '2.0.0', {
    timeControls: { REALTIME: [TEN_MINUTES], TURN_BASED: [] },
  }),
];
const COUNTER = { gameSlug: 'counter', mode: 'REALTIME', timeControl: FIVE_MINUTES, maxPlayers: 2 };

/** La administración mínima por la API (ADR-017). */
describe('administración', () => {
  let t: TestApp;
  let server: string;
  let events: RealtimeEvent[];
  let stopListening: () => void;
  let admin: TestPlayer;

  beforeAll(async () => {
    await resetDatabase();
    t = await createTestApp({ engines });
    server = await t.listen();
    stopListening = t.app.get(RealtimeEvents).subscribe((event) => events.push(event));
  });
  afterAll(async () => {
    stopListening();
    await t.close();
    // Las demás pruebas arrancan sin motores: no deben encontrar estos juegos.
    await resetDatabase();
  });
  beforeEach(async () => {
    t.clock.reset();
    await resetDatabase();
    await seedFourInARow();
    await seedGame({
      slug: 'counter',
      name: 'Contador',
      status: 'INACTIVE',
      versions: [
        { version: '1.0.0', isCurrent: true },
        { version: '2.0.0', status: 'INACTIVE' },
        { version: '3.0.0', status: 'INACTIVE' },
      ],
    });
    admin = await signUp(t, { username: 'admin', displayName: 'Admin' });
    await query(`update users set role = 'ADMIN' where id = $1`, [admin.me.userId]);
    events = [];
  });

  describe('permisos', () => {
    const operations: readonly [method: 'get' | 'put' | 'post', path: string, contract: string][] =
      [
        ['get', '/admin/users', '/admin/users'],
        ['put', `/admin/users/${randomUUID()}/status`, '/admin/users/{userId}/status'],
        ['post', `/admin/rooms/${randomUUID()}/close`, '/admin/rooms/{roomId}/close'],
        ['post', `/admin/matches/${randomUUID()}/abort`, '/admin/matches/{matchId}/abort'],
        ['get', '/admin/games', '/admin/games'],
        ['put', '/admin/games/counter/status', '/admin/games/{gameSlug}/status'],
        [
          'put',
          '/admin/games/counter/versions/1.0.0/status',
          '/admin/games/{gameSlug}/versions/{gameVersion}/status',
        ],
        ['put', '/admin/games/counter/current-version', '/admin/games/{gameSlug}/current-version'],
      ];

    it('quien no es administrador recibe FORBIDDEN, y sin sesión, UNAUTHENTICATED', async () => {
      const ana = await signUp(t);
      for (const [method, path, contract] of operations) {
        const forbidden = await ana[method](path, {});
        expect(forbidden.status, `${method} ${path}`).toBe(403);
        expectMatchesContract(method.toUpperCase(), contract, forbidden);
        expect(forbidden.body.error.code).toBe('FORBIDDEN');

        const anonymous = await t
          .request()
          [method](`${API}${path}`)
          .set('Origin', FRONTEND_ORIGIN)
          .send({});
        expect(anonymous.status, `${method} ${path}`).toBe(401);
        expectMatchesContract(method.toUpperCase(), contract, anonymous);
      }
    });

    it('el rol se lee en cada petición: quitarlo surte efecto en la siguiente', async () => {
      expect((await admin.get('/admin/users')).status).toBe(200);
      await query(`update users set role = 'USER' where id = $1`, [admin.me.userId]);

      expect((await admin.get('/admin/users')).status).toBe(403);
    });
  });

  describe('cuentas', () => {
    it('busca cuentas de la más reciente a la más antigua, por páginas (U17)', async () => {
      const ana = await signUp(t, {
        username: 'ana_1',
        email: 'ana@example.com',
        displayName: 'Ana',
      });
      t.clock.advance(1000);
      const anabel = await signUp(t, { username: 'Anabel' });
      t.clock.advance(1000);
      await signUp(t, { username: 'bea' });

      const first = await admin.get('/admin/users?username=ANA&limit=1');
      expect(first.status, first.text).toBe(200);
      expectMatchesContract('GET', '/admin/users', first);
      expect(first.body.data.items.map((user: AdminUser) => user.username)).toEqual(['Anabel']);
      expect(first.body.data.nextCursor).toEqual(expect.any(String));

      const second = await admin.get(
        `/admin/users?username=ana&limit=1&cursor=${first.body.data.nextCursor}`,
      );
      expect(second.body.data.items).toEqual([
        {
          userId: ana.me.userId,
          playerId: ana.playerId,
          email: 'ana@example.com',
          username: 'ana_1',
          displayName: 'Ana',
          role: 'USER',
          status: 'ACTIVE',
          createdAt: expect.any(String),
        },
      ]);
      expect(second.body.data.nextCursor).toBeNull();

      const byEmail = await admin.get('/admin/users?email=ANA@example.com');
      expect(byEmail.body.data.items.map((user: AdminUser) => user.userId)).toEqual([
        ana.me.userId,
      ]);
      const all = await admin.get('/admin/users');
      expect(all.body.data.items).toHaveLength(4);
      expect(all.body.data.items[1].userId).toBe(anabel.me.userId);
      // Un guion bajo es un carácter más, no un comodín.
      expect((await admin.get('/admin/users?username=ana_')).body.data.items).toHaveLength(1);
    });

    it('rechaza un cursor que no es suyo', async () => {
      const response = await admin.get('/admin/users?cursor=no-es-un-cursor');

      expect(response.status).toBe(400);
      expectMatchesContract('GET', '/admin/users', response);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('suspender cierra sus sesiones y conexiones, y lo saca de sus salas en espera (U4)', async () => {
      const ana = await signUp(t);
      const socket = await TestSocket.open(server, { cookie: ana.cookie });
      // Su sala, por turnos, en la que espera sola; y la de Carla, en tiempo real, sin empezar.
      const created = await ana.post('/rooms', {
        ...FOUR_IN_A_ROW,
        mode: 'TURN_BASED',
        timeControl: { type: 'TOTAL_PER_PLAYER', totalMs: 12 * 60 * MINUTE_MS },
      });
      expect(created.status, created.text).toBe(201);
      const own = created.body.data as RoomView;
      const carla = await signUp(t);
      const other = (await carla.post('/rooms', FOUR_IN_A_ROW)).body.data as RoomView;
      const joined = await ana.put(`/rooms/${other.roomId}/members/me`);
      expect(joined.status, joined.text).toBe(200);
      events = [];

      const response = await admin.put(`/admin/users/${ana.me.userId}/status`, {
        status: 'SUSPENDED',
      });

      expect(response.status, response.text).toBe(200);
      expectMatchesContract('PUT', '/admin/users/{userId}/status', response);
      expect(response.body.data).toMatchObject({ userId: ana.me.userId, status: 'SUSPENDED' });
      expect((await ana.get('/me')).status).toBe(401);
      expect((await socket.closed).code).toBe(4001);
      expect(events).toEqual(
        expect.arrayContaining([
          { type: 'ROOM_CLOSED', roomId: own.roomId, closeReason: 'OWNER_LEFT' },
          { type: 'ROOM_CHANGED', roomId: other.roomId },
        ]),
      );
      const otherRoom = (await carla.get(`/rooms/${other.roomId}`)).body.data as RoomView;
      expect(otherRoom.members.map((member) => member.playerId)).toEqual([carla.playerId]);

      // No puede volver a entrar hasta que la reactiven.
      expect(
        (
          await t
            .request()
            .post(`${API}/auth/login`)
            .set('Origin', FRONTEND_ORIGIN)
            .send({ username: ana.me.username, password: 'una-clave-larga' })
        ).body.error.code,
      ).toBe('ACCOUNT_SUSPENDED');
      const reactivated = await admin.put(`/admin/users/${ana.me.userId}/status`, {
        status: 'ACTIVE',
      });
      expect(reactivated.body.data.status).toBe('ACTIVE');
      expect(
        (
          await t
            .request()
            .post(`${API}/auth/login`)
            .set('Origin', FRONTEND_ORIGIN)
            .send({ username: ana.me.username, password: 'una-clave-larga' })
        ).status,
      ).toBe(200);
    });

    it('la partida en curso de quien es suspendido sigue sus reglas (U4)', async () => {
      const match = await startMatch(t);

      await admin.put(`/admin/users/${match.first.me.userId}/status`, { status: 'SUSPENDED' });

      const view = (await match.second.get(`/matches/${match.matchId}`)).body.data as MatchView;
      expect(view.status).toBe('IN_PROGRESS');
    });

    it('nadie puede cambiar su propio estado, y una cuenta que no existe es USER_NOT_FOUND', async () => {
      const own = await admin.put(`/admin/users/${admin.me.userId}/status`, {
        status: 'SUSPENDED',
      });
      expect(own.status).toBe(409);
      expectMatchesContract('PUT', '/admin/users/{userId}/status', own);
      expect(own.body.error.code).toBe('CANNOT_CHANGE_OWN_STATUS');

      for (const userId of [randomUUID(), 'no-es-un-id']) {
        const missing = await admin.put(`/admin/users/${userId}/status`, { status: 'SUSPENDED' });
        expect(missing.status).toBe(404);
        expect(missing.body.error.code).toBe('USER_NOT_FOUND');
      }
    });
  });

  describe('salas y partidas', () => {
    it('cierra una sala en espera', async () => {
      const ana = await signUp(t);
      const room = (await ana.post('/rooms', FOUR_IN_A_ROW)).body.data as RoomView;
      events = [];

      const response = await admin.post(`/admin/rooms/${room.roomId}/close`);

      expect(response.status, response.text).toBe(204);
      expectMatchesContract('POST', '/admin/rooms/{roomId}/close', response);
      expect(events).toEqual([{ type: 'ROOM_CLOSED', roomId: room.roomId, closeReason: 'ADMIN' }]);
      expect((await ana.get(`/rooms/${room.roomId}`)).body.data).toMatchObject({
        status: 'CLOSED',
        closeReason: 'ADMIN',
      });
      // Otra vez no cambia nada.
      expect((await admin.post(`/admin/rooms/${room.roomId}/close`)).status).toBe(204);
      expect(events).toHaveLength(1);
    });

    it('cerrar una sala con partida la anula, sin contar en las estadísticas', async () => {
      const match = await startMatch(t);
      events = [];

      const response = await admin.post(`/admin/rooms/${match.roomId}/close`);

      expect(response.status, response.text).toBe(204);
      const view = (await match.first.get(`/matches/${match.matchId}`)).body.data as MatchView;
      expect(view).toMatchObject({ status: 'ABORTED', abortReason: 'ADMIN', result: null });
      expect((await match.first.get(`/rooms/${match.roomId}`)).body.data).toMatchObject({
        status: 'CLOSED',
        closeReason: 'ADMIN',
      });
      expect(events.map((event) => event.type).sort()).toEqual(['MATCH_CHANGED', 'ROOM_CLOSED']);
      expect(await query('select * from game_statistics')).toEqual([]);
    });

    it('anula una partida y la sala vuelve a la espera; otra vez no cambia nada', async () => {
      const match = await startMatch(t);
      const sockets = await TestSocket.open(server, { cookie: match.first.cookie });
      await sockets.command({ type: 'SUBSCRIBE_MATCH', matchId: match.matchId });

      const response = await admin.post(`/admin/matches/${match.matchId}/abort`);

      expect(response.status, response.text).toBe(204);
      expectMatchesContract('POST', '/admin/matches/{matchId}/abort', response);
      const update = await sockets.nextOfType('MATCH_UPDATED');
      expect(update.payload.match).toMatchObject({ status: 'ABORTED', abortReason: 'ADMIN' });
      expect((await match.first.get(`/rooms/${match.roomId}`)).body.data).toMatchObject({
        status: 'WAITING',
      });
      expect((await admin.post(`/admin/matches/${match.matchId}/abort`)).status).toBe(204);
      expect(await query('select * from game_statistics')).toEqual([]);
      await sockets.close();

      // La sala puede jugar otra.
      const again = await startMatchIn(match.roomId, match.owner, match.guest);
      expect(again.matchId).not.toBe(match.matchId);
    });

    it('una partida terminada no se puede anular', async () => {
      const match = await startMatch(t);
      await t.app
        .get(GameSessionsService)
        .resign(match.first.playerId, match.matchId, randomUUID());

      const response = await admin.post(`/admin/matches/${match.matchId}/abort`);

      expect(response.status).toBe(409);
      expectMatchesContract('POST', '/admin/matches/{matchId}/abort', response);
      expect(response.body.error.code).toBe('MATCH_NOT_IN_PROGRESS');
    });

    it('una sala o partida que no existe es ROOM_NOT_FOUND o MATCH_NOT_FOUND', async () => {
      const room = await admin.post(`/admin/rooms/${randomUUID()}/close`);
      expect(room.status).toBe(404);
      expectMatchesContract('POST', '/admin/rooms/{roomId}/close', room);
      expect(room.body.error.code).toBe('ROOM_NOT_FOUND');

      const match = await admin.post(`/admin/matches/${randomUUID()}/abort`);
      expect(match.status).toBe(404);
      expectMatchesContract('POST', '/admin/matches/{matchId}/abort', match);
      expect(match.body.error.code).toBe('MATCH_NOT_FOUND');
    });
  });

  describe('catálogo', () => {
    const catalogSlugs = async (player: TestPlayer) =>
      ((await player.get('/games')).body.data.items as { gameSlug: string }[]).map(
        (game) => game.gameSlug,
      );

    it('lista todos los juegos, activos o no, con sus versiones de la más nueva a la más antigua', async () => {
      const response = await admin.get('/admin/games');

      expect(response.status, response.text).toBe(200);
      expectMatchesContract('GET', '/admin/games', response);
      const items = response.body.data.items as AdminGame[];
      expect(items.map((game) => game.gameSlug)).toEqual(['counter', 'four-in-a-row']);
      expect(items[0]).toMatchObject({
        status: 'INACTIVE',
        versions: [
          { gameVersion: '3.0.0', status: 'INACTIVE', isCurrent: false, engineRegistered: false },
          { gameVersion: '2.0.0', status: 'INACTIVE', isCurrent: false, engineRegistered: true },
          { gameVersion: '1.0.0', status: 'ACTIVE', isCurrent: true, engineRegistered: true },
        ],
      });
    });

    it('un juego nuevo llega inactivo y aparece en el catálogo al activarlo', async () => {
      expect(await catalogSlugs(admin)).toEqual(['four-in-a-row']);

      const response = await admin.put('/admin/games/counter/status', { status: 'ACTIVE' });

      expect(response.status, response.text).toBe(200);
      expectMatchesContract('PUT', '/admin/games/{gameSlug}/status', response);
      expect(response.body.data).toMatchObject({ gameSlug: 'counter', status: 'ACTIVE' });
      expect(await catalogSlugs(admin)).toEqual(['counter', 'four-in-a-row']);
    });

    it('desactivar un juego cierra sus salas en espera; la de partida, al terminarla (U5)', async () => {
      const match = await startMatch(t);
      const carla = await signUp(t);
      const waiting = (await carla.post('/rooms', FOUR_IN_A_ROW)).body.data as RoomView;
      events = [];

      const response = await admin.put('/admin/games/four-in-a-row/status', { status: 'INACTIVE' });

      expect(response.status, response.text).toBe(200);
      expect(events).toEqual([
        { type: 'ROOM_CLOSED', roomId: waiting.roomId, closeReason: 'ADMIN' },
      ]);
      expect(await catalogSlugs(carla)).toEqual([]);
      expect((await carla.post('/rooms', FOUR_IN_A_ROW)).body.error.code).toBe('GAME_NOT_FOUND');

      // La partida en curso sigue y, al terminar, su sala se cierra en vez de volver a la espera.
      expect((await match.first.get(`/matches/${match.matchId}`)).body.data.status).toBe(
        'IN_PROGRESS',
      );
      await t.app
        .get(GameSessionsService)
        .resign(match.first.playerId, match.matchId, randomUUID());
      expect((await match.first.get(`/rooms/${match.roomId}`)).body.data).toMatchObject({
        status: 'CLOSED',
        closeReason: 'ADMIN',
      });
    });

    it('no activa una versión sin motor ni desactiva la vigente', async () => {
      const noEngine = await admin.put('/admin/games/counter/versions/3.0.0/status', {
        status: 'ACTIVE',
      });
      expect(noEngine.status).toBe(409);
      expectMatchesContract(
        'PUT',
        '/admin/games/{gameSlug}/versions/{gameVersion}/status',
        noEngine,
      );
      expect(noEngine.body.error.code).toBe('ENGINE_NOT_REGISTERED');

      const current = await admin.put('/admin/games/counter/versions/1.0.0/status', {
        status: 'INACTIVE',
      });
      expect(current.status).toBe(409);
      expect(current.body.error.code).toBe('GAME_VERSION_IS_CURRENT');

      const missing = await admin.put('/admin/games/counter/versions/9.9.9/status', {
        status: 'ACTIVE',
      });
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('GAME_VERSION_NOT_FOUND');
      const unknown = await admin.put('/admin/games/nada/status', { status: 'ACTIVE' });
      expect(unknown.status).toBe(404);
      expectMatchesContract('PUT', '/admin/games/{gameSlug}/status', unknown);
      expect(unknown.body.error.code).toBe('GAME_NOT_FOUND');
    });

    it('cambiar la versión vigente exige que esté activa y cierra las salas que no admite (U5)', async () => {
      await admin.put('/admin/games/counter/status', { status: 'ACTIVE' });
      const ana = await signUp(t);
      const room = (await ana.post('/rooms', COUNTER)).body.data as RoomView;

      const inactive = await admin.put('/admin/games/counter/current-version', {
        gameVersion: '2.0.0',
      });
      expect(inactive.status).toBe(409);
      expectMatchesContract('PUT', '/admin/games/{gameSlug}/current-version', inactive);
      expect(inactive.body.error.code).toBe('GAME_VERSION_NOT_ACTIVE');

      const activated = await admin.put('/admin/games/counter/versions/2.0.0/status', {
        status: 'ACTIVE',
      });
      expect(activated.status, activated.text).toBe(200);
      expectMatchesContract(
        'PUT',
        '/admin/games/{gameSlug}/versions/{gameVersion}/status',
        activated,
      );
      events = [];
      const response = await admin.put('/admin/games/counter/current-version', {
        gameVersion: '2.0.0',
      });

      expect(response.status, response.text).toBe(200);
      expectMatchesContract('PUT', '/admin/games/{gameSlug}/current-version', response);
      expect(response.body.data.versions).toMatchObject([
        { gameVersion: '3.0.0', isCurrent: false },
        { gameVersion: '2.0.0', isCurrent: true, status: 'ACTIVE' },
        { gameVersion: '1.0.0', isCurrent: false, status: 'ACTIVE' },
      ]);
      expect(events).toEqual([{ type: 'ROOM_CLOSED', roomId: room.roomId, closeReason: 'ADMIN' }]);
      const catalog = await ana.get('/games/counter');
      expect(catalog.body.data).toMatchObject({ gameVersion: '2.0.0' });

      // Ya se puede desactivar la anterior; repetir la vigente no cambia nada.
      expect(
        (await admin.put('/admin/games/counter/versions/1.0.0/status', { status: 'INACTIVE' }))
          .status,
      ).toBe(200);
      expect(
        (await admin.put('/admin/games/counter/current-version', { gameVersion: '2.0.0' })).status,
      ).toBe(200);
    });

    it('si la versión vigente cambia mientras una sala espera a empezar, la sala se cierra (U5)', async () => {
      await admin.put('/admin/games/counter/status', { status: 'ACTIVE' });
      await admin.put('/admin/games/counter/versions/2.0.0/status', { status: 'ACTIVE' });
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = (await ana.post('/rooms', COUNTER)).body.data as RoomView;
      await bea.put(`/rooms/${room.roomId}/members/me`);
      // El cambio se hace por debajo, sin pasar por la administración que cerraría la sala.
      await query(`update game_versions set is_current = (version = '2.0.0')
                   where game_id = (select id from games where slug = 'counter')`);

      await ana.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });
      const ready = await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });

      expect((await ana.get(`/rooms/${room.roomId}`)).body.data).toMatchObject({
        status: 'CLOSED',
        closeReason: 'ADMIN',
      });
      expect(await query('select * from matches')).toEqual([]);
      expect([200, 409]).toContain(ready.status);
    });
  });
});
