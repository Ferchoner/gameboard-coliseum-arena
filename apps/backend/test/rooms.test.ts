import { randomUUID } from 'node:crypto';
import type { RoomView } from '@gameboard/contracts';
import { createFakeEngine } from '@gameboard/game-engine/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Transaction } from '../src/database/database.service.js';
import { type RealtimeEvent, RealtimeEvents } from '../src/modules/broadcast/realtime-events.js';
import {
  type MatchStarter,
  MatchStarterSlot,
  NO_MATCHES_YET,
  type RoomMatches,
  type RoomReadyToStart,
} from '../src/modules/rooms/match-starter.js';
import { RoomsService } from '../src/modules/rooms/rooms.service.js';
import { createTestApp, type TestApp } from './app.js';
import { expectMatchesContract } from './contract.js';
import { query, resetDatabase } from './database.js';
import { signUp, type TestPlayer } from './players.js';
import { seedGame } from './seed.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const FIVE_MINUTES = { type: 'TOTAL_PER_PLAYER', totalMs: 5 * MINUTE_MS } as const;
const TEN_MINUTES = { type: 'TOTAL_PER_PLAYER', totalMs: 10 * MINUTE_MS } as const;
const HALF_DAY = { type: 'TOTAL_PER_PLAYER', totalMs: 12 * HOUR_MS } as const;
const ONE_DAY = { type: 'TOTAL_PER_PLAYER', totalMs: 24 * HOUR_MS } as const;

const engines = [
  // Dos jugadores, las dos modalidades.
  createFakeEngine('duel', '1.0.0', {
    timeControls: { REALTIME: [FIVE_MINUTES], TURN_BASED: [HALF_DAY, ONE_DAY] },
  }),
  // De dos a cuatro jugadores.
  createFakeEngine('party', '1.0.0', {
    minPlayers: 2,
    maxPlayers: 4,
    timeControls: { REALTIME: [TEN_MINUTES], TURN_BASED: [ONE_DAY] },
  }),
  // Solo tiempo real.
  createFakeEngine('blitz', '1.0.0'),
  // Rechaza cualquier opción.
  {
    ...createFakeEngine('picky', '1.0.0'),
    parseSettings: () =>
      ({ ok: false, code: 'INVALID_SETTINGS', reason: 'BOARD_TOO_BIG' }) as const,
  },
  // Devuelve las opciones con sus valores por defecto.
  {
    ...createFakeEngine('tuned', '1.0.0'),
    parseSettings: (input: unknown) =>
      ({ ok: true, value: { boardSize: 7, ...(input as object) } }) as const,
  },
];

const DUEL = { gameSlug: 'duel', mode: 'REALTIME', timeControl: FIVE_MINUTES, maxPlayers: 2 };
const DUEL_BY_TURNS = { gameSlug: 'duel', mode: 'TURN_BASED', timeControl: ONE_DAY, maxPlayers: 2 };
const PARTY = { gameSlug: 'party', mode: 'REALTIME', timeControl: TEN_MINUTES, maxPlayers: 4 };

/** Un iniciador de partidas de prueba: anota cuándo lo llaman y con qué (ADR-013, decisión H2). */
class FakeMatchStarter implements MatchStarter {
  readonly calls: RoomReadyToStart[] = [];
  /** Miembros que la transacción recibida veía en la sala, en cada llamada. */
  readonly membersSeenInTransaction: number[] = [];
  readonly currentMatches = new Map<string, string>();
  readonly played = new Set<string>();
  failing = false;

  async startMatch(room: RoomReadyToStart, tx: Transaction): Promise<string | null> {
    if (this.failing) throw new Error('No se pudo iniciar la partida');
    const result = await tx.execute<{ members: number }>(
      sql`select count(*)::int as members from room_players where room_id = ${room.roomId}`,
    );
    this.membersSeenInTransaction.push(result.rows[0]?.members ?? -1);
    this.calls.push(room);

    const matchId = randomUUID();
    this.currentMatches.set(room.roomId, matchId);
    this.played.add(room.roomId);
    return matchId;
  }

  describeRoom(roomId: string): Promise<RoomMatches> {
    return Promise.resolve({
      currentMatchId: this.currentMatches.get(roomId) ?? null,
      hasPlayed: this.played.has(roomId),
    });
  }
}

describe('salas', () => {
  let t: TestApp;
  let events: RealtimeEvent[];
  let stopListening: () => void;

  beforeAll(async () => {
    await resetDatabase();
    t = await createTestApp({ engines, env: { MAX_TURN_BASED_MATCHES_PER_PLAYER: '3' } });
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
    // Estas pruebas son las de las salas: las partidas las inicia un sustituto.
    t.app.get(MatchStarterSlot).register(NO_MATCHES_YET);
    await resetDatabase();
    for (const slug of ['duel', 'party', 'blitz', 'picky', 'tuned']) {
      await seedGame({ slug, name: slug, versions: [{ version: '1.0.0', isCurrent: true }] });
    }
    events = [];
  });

  async function createRoom(owner: TestPlayer, body: object = DUEL): Promise<RoomView> {
    const response = await owner.post('/rooms', body);
    expect(response.status, response.text).toBe(201);
    return response.body.data as RoomView;
  }

  function useFakeStarter(): FakeMatchStarter {
    const starter = new FakeMatchStarter();
    t.app.get(MatchStarterSlot).register(starter);
    return starter;
  }

  describe('crear', () => {
    it('crea la sala en espera, con quien la crea como anfitrión y único miembro', async () => {
      const ana = await signUp(t, { displayName: 'Ana' });

      const response = await ana.post('/rooms', DUEL);

      expect(response.status).toBe(201);
      expectMatchesContract('POST', '/rooms', response);
      expect(response.body.data).toMatchObject({
        gameSlug: 'duel',
        mode: 'REALTIME',
        timeControl: FIVE_MINUTES,
        maxPlayers: 2,
        settings: {},
        status: 'WAITING',
        closeReason: null,
        ownerPlayerId: ana.playerId,
        currentMatchId: null,
        members: [
          {
            playerId: ana.playerId,
            username: ana.me.username,
            displayName: 'Ana',
            ready: false,
            connected: false,
          },
        ],
      });
    });

    it('exige sesión', async () => {
      const response = await t.request().post('/api/v1/rooms').send(DUEL);

      expect(response.status).toBe(401);
      expectMatchesContract('POST', '/rooms', response);
    });

    it('en tiempo real la revancha está siempre activada', async () => {
      const ana = await signUp(t);

      const room = await createRoom(ana, { ...DUEL, rematchEnabled: false });

      expect(room.rematchEnabled).toBe(true);
    });

    it('por turnos la revancha la elige el anfitrión y por defecto está desactivada', async () => {
      const ana = await signUp(t);

      const byDefault = await createRoom(ana, DUEL_BY_TURNS);
      const chosen = await createRoom(ana, { ...DUEL_BY_TURNS, rematchEnabled: true });

      expect(byDefault.rematchEnabled).toBe(false);
      expect(chosen.rematchEnabled).toBe(true);
    });

    it('guarda las opciones del juego tal como las devuelve su motor', async () => {
      const ana = await signUp(t);

      const room = await createRoom(ana, {
        gameSlug: 'tuned',
        mode: 'REALTIME',
        timeControl: { type: 'TOTAL_PER_PLAYER', totalMs: 300_000 },
        maxPlayers: 2,
        settings: { handicap: 2 },
      });

      expect(room.settings).toEqual({ boardSize: 7, handicap: 2 });
    });

    it('rechaza un cuerpo que no cumple el formato e indica qué campos fallan', async () => {
      const ana = await signUp(t);

      const response = await ana.post('/rooms', { gameSlug: 'duel', mode: 'FAST', extra: 1 });

      expect(response.status).toBe(400);
      expectMatchesContract('POST', '/rooms', response);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.fields).toEqual(
        expect.arrayContaining([
          { field: 'mode', rule: 'INVALID_FORMAT' },
          { field: 'timeControl', rule: 'REQUIRED' },
          { field: 'maxPlayers', rule: 'REQUIRED' },
          { field: 'extra', rule: 'INVALID_FORMAT' },
        ]),
      );
    });

    it('rechaza un juego que no existe o no está activo', async () => {
      const ana = await signUp(t);
      await seedGame({
        slug: 'retired',
        name: 'Retirado',
        status: 'INACTIVE',
        versions: [{ version: '1.0.0', isCurrent: true }],
      });

      for (const gameSlug of ['unknown', 'retired']) {
        const response = await ana.post('/rooms', { ...DUEL, gameSlug });

        expect(response.status).toBe(404);
        expectMatchesContract('POST', '/rooms', response);
        expect(response.body.error.code).toBe('GAME_NOT_FOUND');
      }
    });

    it.each([
      ['mode', { gameSlug: 'blitz', mode: 'TURN_BASED', timeControl: ONE_DAY, maxPlayers: 2 }],
      ['timeControl', { ...DUEL, timeControl: TEN_MINUTES }],
      ['timeControl', { ...DUEL_BY_TURNS, timeControl: FIVE_MINUTES }],
      ['maxPlayers', { ...DUEL, maxPlayers: 3 }],
      ['maxPlayers', { ...PARTY, maxPlayers: 1 }],
      ['maxPlayers', { ...PARTY, maxPlayers: 5 }],
    ])('rechaza lo que el juego no admite: %s', async (option, body) => {
      const ana = await signUp(t);

      const response = await ana.post('/rooms', body);

      expect(response.status).toBe(400);
      expectMatchesContract('POST', '/rooms', response);
      expect(response.body.error).toMatchObject({
        code: 'UNSUPPORTED_ROOM_OPTIONS',
        details: { option },
      });
    });

    it('rechaza las opciones que el motor del juego no acepta, con su motivo', async () => {
      const ana = await signUp(t);

      const response = await ana.post('/rooms', {
        gameSlug: 'picky',
        mode: 'REALTIME',
        timeControl: { type: 'TOTAL_PER_PLAYER', totalMs: 300_000 },
        maxPlayers: 2,
        settings: { boardSize: 99 },
      });

      expect(response.status).toBe(400);
      expectMatchesContract('POST', '/rooms', response);
      expect(response.body.error).toMatchObject({
        code: 'INVALID_SETTINGS',
        details: { reason: 'BOARD_TOO_BIG' },
      });
      expect(await query('select 1 from rooms')).toHaveLength(0);
    });
  });

  describe('límite de partidas simultáneas', () => {
    it('solo permite una sala en tiempo real a la vez', async () => {
      const ana = await signUp(t);
      await createRoom(ana, DUEL);

      const response = await ana.post('/rooms', PARTY);

      expect(response.status).toBe(409);
      expectMatchesContract('POST', '/rooms', response);
      expect(response.body.error).toMatchObject({
        code: 'MATCH_LIMIT_REACHED',
        details: { mode: 'REALTIME', limit: 1 },
      });
    });

    it('cuenta cada modalidad por separado, con su propio máximo', async () => {
      const ana = await signUp(t);
      await createRoom(ana, DUEL);
      await createRoom(ana, DUEL_BY_TURNS);
      await createRoom(ana, DUEL_BY_TURNS);
      await createRoom(ana, DUEL_BY_TURNS);

      const response = await ana.post('/rooms', DUEL_BY_TURNS);

      expect(response.status).toBe(409);
      expect(response.body.error).toMatchObject({
        code: 'MATCH_LIMIT_REACHED',
        details: { mode: 'TURN_BASED', limit: 3 },
      });
    });

    it('cuenta también la sala en la que se espera como invitado', async () => {
      const [ana, bea, carla] = [await signUp(t), await signUp(t), await signUp(t)];
      const first = await createRoom(ana, PARTY);
      const second = await createRoom(bea, PARTY);
      await carla.put(`/rooms/${first.roomId}/members/me`);

      const joining = await carla.put(`/rooms/${second.roomId}/members/me`);
      const creating = await carla.post('/rooms', DUEL);

      for (const response of [joining, creating]) {
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('MATCH_LIMIT_REACHED');
      }
      expectMatchesContract('PUT', '/rooms/{roomId}/members/me', joining);
    });

    it('deja de contar una sala cuando se cierra o cuando se sale de ella', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);
      await bea.put(`/rooms/${room.roomId}/members/me`);

      // Bea sale; después Ana, que es la anfitriona, cierra la sala al salir.
      await bea.delete(`/rooms/${room.roomId}/members/me`);
      await createRoom(bea, DUEL);
      await ana.delete(`/rooms/${room.roomId}/members/me`);
      await createRoom(ana, DUEL);
    });

    it('dos peticiones simultáneas del mismo jugador no superan el límite entre las dos', async () => {
      const [ana, bea, carla] = [await signUp(t), await signUp(t), await signUp(t)];
      const first = await createRoom(ana, PARTY);
      const second = await createRoom(bea, PARTY);

      const responses = await Promise.all([
        carla.put(`/rooms/${first.roomId}/members/me`),
        carla.put(`/rooms/${second.roomId}/members/me`),
        carla.post('/rooms', DUEL),
        carla.post('/rooms', PARTY),
      ]);

      const accepted = responses.filter((response) => response.status < 300);
      const rejected = responses.filter((response) => response.status === 409);
      expect(accepted).toHaveLength(1);
      expect(rejected).toHaveLength(3);
      for (const response of rejected) {
        expect(response.body.error.code).toBe('MATCH_LIMIT_REACHED');
      }
      const memberships = await query('select 1 from room_players where player_id = $1', [
        carla.playerId,
      ]);
      expect(memberships).toHaveLength(1);
    });
  });

  describe('listar', () => {
    it('devuelve las salas en espera, de la más reciente a la más antigua', async () => {
      const [ana, bea, carla] = [await signUp(t), await signUp(t), await signUp(t)];
      const oldest = await createRoom(ana, DUEL);
      t.clock.advance(1000);
      const middle = await createRoom(bea, PARTY);
      t.clock.advance(1000);
      const newest = await createRoom(carla, DUEL_BY_TURNS);
      await carla.put(`/rooms/${middle.roomId}/members/me`);

      const response = await ana.get('/rooms');

      expect(response.status).toBe(200);
      expectMatchesContract('GET', '/rooms', response);
      expect(response.body.data.nextCursor).toBeNull();
      expect(response.body.data.items).toMatchObject([
        { roomId: newest.roomId, gameSlug: 'duel', mode: 'TURN_BASED', memberCount: 1 },
        {
          roomId: middle.roomId,
          gameSlug: 'party',
          mode: 'REALTIME',
          maxPlayers: 4,
          memberCount: 2,
          status: 'WAITING',
          owner: { playerId: bea.playerId, username: bea.me.username },
        },
        { roomId: oldest.roomId, memberCount: 1 },
      ]);
    });

    it('exige sesión', async () => {
      const response = await t.request().get('/api/v1/rooms');

      expect(response.status).toBe(401);
      expectMatchesContract('GET', '/rooms', response);
    });

    it('no incluye las salas cerradas', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const closed = await createRoom(ana, DUEL);
      const open = await createRoom(bea, DUEL);
      await ana.delete(`/rooms/${closed.roomId}/members/me`);

      const response = await ana.get('/rooms');

      expect(response.body.data.items.map((room: { roomId: string }) => room.roomId)).toEqual([
        open.roomId,
      ]);
    });

    it('filtra por juego y por modalidad', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const duel = await createRoom(ana, DUEL);
      const duelByTurns = await createRoom(ana, DUEL_BY_TURNS);
      const party = await createRoom(bea, PARTY);
      const ids = (response: { body: { data: { items: { roomId: string }[] } } }) =>
        response.body.data.items.map((room) => room.roomId).sort();

      expect(ids(await ana.get('/rooms?gameSlug=duel'))).toEqual(
        [duel.roomId, duelByTurns.roomId].sort(),
      );
      expect(ids(await ana.get('/rooms?mode=REALTIME'))).toEqual(
        [duel.roomId, party.roomId].sort(),
      );
      expect(ids(await ana.get('/rooms?gameSlug=duel&mode=TURN_BASED'))).toEqual([
        duelByTurns.roomId,
      ]);
      expect(ids(await ana.get('/rooms?gameSlug=unknown'))).toEqual([]);
    });

    it('pagina con un cursor, sin repetir ni saltarse salas', async () => {
      const owners = await Promise.all(Array.from({ length: 5 }, () => signUp(t)));
      const created: string[] = [];
      for (const owner of owners) {
        // Dos de ellas se crean en el mismo instante: el cursor desempata por identificador.
        if (created.length !== 3) t.clock.advance(1000);
        created.push((await createRoom(owner, DUEL)).roomId);
      }
      const reader = owners[0] as TestPlayer;

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const path = `/rooms?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
        const response = await reader.get(path);
        expect(response.status).toBe(200);
        expectMatchesContract('GET', '/rooms', response);
        expect(response.body.data.items.length).toBeLessThanOrEqual(2);
        seen.push(...response.body.data.items.map((room: { roomId: string }) => room.roomId));
        cursor = response.body.data.nextCursor as string | null;
        pages += 1;
      } while (cursor !== null && pages < 10);

      expect(pages).toBe(3);
      expect([...seen].sort()).toEqual([...created].sort());
      expect(new Set(seen).size).toBe(5);
      expect(seen[0]).toBe(created[4]);
      expect(seen[4]).toBe(created[0]);
    });

    it.each([
      ['limit=0', { field: 'limit', rule: 'OUT_OF_RANGE' }],
      ['limit=51', { field: 'limit', rule: 'OUT_OF_RANGE' }],
      ['limit=muchas', { field: 'limit', rule: 'INVALID_FORMAT' }],
      ['mode=FAST', { field: 'mode', rule: 'INVALID_FORMAT' }],
      ['cursor=no-es-un-cursor', { field: 'cursor', rule: 'INVALID_FORMAT' }],
    ])('rechaza parámetros que no cumplen el formato: %s', async (queryString, field) => {
      const ana = await signUp(t);

      const response = await ana.get(`/rooms?${queryString}`);

      expect(response.status).toBe(400);
      expectMatchesContract('GET', '/rooms', response);
      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { fields: [field] },
      });
    });
  });

  describe('consultar', () => {
    it('cualquier jugador con sesión puede ver una sala, sea miembro o no', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);

      const response = await bea.get(`/rooms/${room.roomId}`);

      expect(response.status).toBe(200);
      expectMatchesContract('GET', '/rooms/{roomId}', response);
      expect(response.body.data).toEqual(room);
    });

    it('responde que no existe si el identificador no es de ninguna sala', async () => {
      const ana = await signUp(t);

      for (const roomId of [randomUUID(), 'no-es-un-identificador']) {
        const response = await ana.get(`/rooms/${roomId}`);

        expect(response.status).toBe(404);
        expectMatchesContract('GET', '/rooms/{roomId}', response);
        expect(response.body.error.code).toBe('ROOM_NOT_FOUND');
      }
    });

    it('exige sesión', async () => {
      const response = await t.request().get(`/api/v1/rooms/${randomUUID()}`);

      expect(response.status).toBe(401);
    });
  });

  describe('entrar', () => {
    it('añade a quien llama como miembro y avisa del cambio', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);
      events = [];

      const response = await bea.put(`/rooms/${room.roomId}/members/me`);

      expect(response.status).toBe(200);
      expectMatchesContract('PUT', '/rooms/{roomId}/members/me', response);
      expect(response.body.data.members).toMatchObject([
        { playerId: ana.playerId, ready: false },
        { playerId: bea.playerId, ready: false },
      ]);
      expect(events).toEqual([{ type: 'ROOM_CHANGED', roomId: room.roomId }]);
    });

    it('repetir la petición no cambia nada', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);
      const first = await bea.put(`/rooms/${room.roomId}/members/me`);
      events = [];

      const again = await bea.put(`/rooms/${room.roomId}/members/me`);
      const owner = await ana.put(`/rooms/${room.roomId}/members/me`);

      expect(again.status).toBe(200);
      expect(again.body.data).toEqual(first.body.data);
      expect(owner.status).toBe(200);
      expect(owner.body.data.members).toHaveLength(2);
      expect(events).toEqual([]);
    });

    it('rechaza entrar a una sala completa', async () => {
      const [ana, bea, carla] = [await signUp(t), await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);
      await bea.put(`/rooms/${room.roomId}/members/me`);

      const response = await carla.put(`/rooms/${room.roomId}/members/me`);

      expect(response.status).toBe(409);
      expectMatchesContract('PUT', '/rooms/{roomId}/members/me', response);
      expect(response.body.error.code).toBe('ROOM_FULL');
    });

    it('rechaza entrar a una sala cerrada', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);
      await ana.delete(`/rooms/${room.roomId}/members/me`);

      const response = await bea.put(`/rooms/${room.roomId}/members/me`);

      expect(response.status).toBe(409);
      expectMatchesContract('PUT', '/rooms/{roomId}/members/me', response);
      expect(response.body.error.code).toBe('ROOM_NOT_WAITING');
    });

    it('responde que no existe si la sala no existe', async () => {
      const ana = await signUp(t);

      const response = await ana.put(`/rooms/${randomUUID()}/members/me`);

      expect(response.status).toBe(404);
      expectMatchesContract('PUT', '/rooms/{roomId}/members/me', response);
      expect(response.body.error.code).toBe('ROOM_NOT_FOUND');
    });

    it('la última plaza solo la ocupa uno, aunque lleguen varios a la vez', async () => {
      const owner = await signUp(t);
      const room = await createRoom(owner, DUEL);
      const candidates = await Promise.all(Array.from({ length: 8 }, () => signUp(t)));

      const responses = await Promise.all(
        candidates.map((candidate) => candidate.put(`/rooms/${room.roomId}/members/me`)),
      );

      expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
      const rejected = responses.filter((response) => response.status === 409);
      expect(rejected).toHaveLength(7);
      for (const response of rejected) expect(response.body.error.code).toBe('ROOM_FULL');
      expect(
        await query('select 1 from room_players where room_id = $1', [room.roomId]),
      ).toHaveLength(2);
    });

    it('una sala de cuatro plazas nunca pasa de cuatro miembros', async () => {
      const owner = await signUp(t);
      const room = await createRoom(owner, PARTY);
      const candidates = await Promise.all(Array.from({ length: 9 }, () => signUp(t)));

      const responses = await Promise.all(
        candidates.map((candidate) => candidate.put(`/rooms/${room.roomId}/members/me`)),
      );

      expect(responses.filter((response) => response.status === 200)).toHaveLength(3);
      expect(responses.filter((response) => response.status === 409)).toHaveLength(6);
      const view = await owner.get(`/rooms/${room.roomId}`);
      expect(view.body.data.members).toHaveLength(4);
    });
  });

  describe('salir', () => {
    it('un miembro que sale deja su plaza libre', async () => {
      const [ana, bea, carla] = [await signUp(t), await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);
      await bea.put(`/rooms/${room.roomId}/members/me`);
      events = [];

      const response = await bea.delete(`/rooms/${room.roomId}/members/me`);

      expect(response.status).toBe(204);
      expectMatchesContract('DELETE', '/rooms/{roomId}/members/me', response);
      expect(events).toEqual([{ type: 'ROOM_CHANGED', roomId: room.roomId }]);
      const joining = await carla.put(`/rooms/${room.roomId}/members/me`);
      expect(joining.status).toBe(200);
      expect(
        joining.body.data.members.map((member: { playerId: string }) => member.playerId),
      ).toEqual([ana.playerId, carla.playerId]);
    });

    it('si sale el anfitrión, la sala se cierra', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);
      await bea.put(`/rooms/${room.roomId}/members/me`);
      events = [];

      const response = await ana.delete(`/rooms/${room.roomId}/members/me`);

      expect(response.status).toBe(204);
      expect(events).toEqual([
        { type: 'ROOM_CLOSED', roomId: room.roomId, closeReason: 'OWNER_LEFT' },
      ]);
      const view = await bea.get(`/rooms/${room.roomId}`);
      expectMatchesContract('GET', '/rooms/{roomId}', view);
      expect(view.body.data).toMatchObject({ status: 'CLOSED', closeReason: 'OWNER_LEFT' });
    });

    it('quien no es miembro recibe la misma respuesta, sin cambiar nada', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);
      events = [];

      const response = await bea.delete(`/rooms/${room.roomId}/members/me`);

      expect(response.status).toBe(204);
      expect(events).toEqual([]);
      const view = await ana.get(`/rooms/${room.roomId}`);
      expect(view.body.data).toMatchObject({ status: 'WAITING' });
    });

    it('responde que no existe si la sala no existe', async () => {
      const ana = await signUp(t);

      const response = await ana.delete(`/rooms/${randomUUID()}/members/me`);

      expect(response.status).toBe(404);
      expectMatchesContract('DELETE', '/rooms/{roomId}/members/me', response);
    });
  });

  describe('marcarse listo', () => {
    it('pone y quita la marca, y avisa del cambio', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);
      await bea.put(`/rooms/${room.roomId}/members/me`);
      events = [];

      const ready = await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });

      expect(ready.status).toBe(200);
      expectMatchesContract('PUT', '/rooms/{roomId}/members/me/ready', ready);
      expect(ready.body.data.members).toMatchObject([
        { playerId: ana.playerId, ready: false },
        { playerId: bea.playerId, ready: true },
      ]);

      const notReady = await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: false });

      expect(notReady.body.data.members).toMatchObject([{ ready: false }, { ready: false }]);
      expect(events).toEqual([
        { type: 'ROOM_CHANGED', roomId: room.roomId },
        { type: 'ROOM_CHANGED', roomId: room.roomId },
      ]);
    });

    it('repetir la misma marca no cambia nada ni avisa', async () => {
      const ana = await signUp(t);
      const room = await createRoom(ana, DUEL);
      await ana.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });
      events = [];

      const response = await ana.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });

      expect(response.status).toBe(200);
      expect(response.body.data.members).toMatchObject([{ ready: true }]);
      expect(events).toEqual([]);
    });

    it('rechaza a quien no es miembro', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);

      const response = await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });

      expect(response.status).toBe(403);
      expectMatchesContract('PUT', '/rooms/{roomId}/members/me/ready', response);
      expect(response.body.error.code).toBe('PLAYER_NOT_IN_ROOM');
    });

    it('rechaza la marca en una sala que ya no está en espera', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);
      await bea.put(`/rooms/${room.roomId}/members/me`);
      await ana.delete(`/rooms/${room.roomId}/members/me`);

      const response = await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });

      expect(response.status).toBe(409);
      expectMatchesContract('PUT', '/rooms/{roomId}/members/me/ready', response);
      expect(response.body.error.code).toBe('ROOM_NOT_WAITING');
    });

    it('rechaza un cuerpo que no cumple el formato', async () => {
      const ana = await signUp(t);
      const room = await createRoom(ana, DUEL);

      const response = await ana.put(`/rooms/${room.roomId}/members/me/ready`, { ready: 'yes' });

      expect(response.status).toBe(400);
      expectMatchesContract('PUT', '/rooms/{roomId}/members/me/ready', response);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('responde que no existe si la sala no existe', async () => {
      const ana = await signUp(t);

      const response = await ana.put(`/rooms/${randomUUID()}/members/me/ready`, { ready: true });

      expect(response.status).toBe(404);
      expectMatchesContract('PUT', '/rooms/{roomId}/members/me/ready', response);
    });
  });

  describe('condición de inicio', () => {
    it('mientras nadie inicie partidas, una sala completa y con todos listos sigue en espera', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);
      await bea.put(`/rooms/${room.roomId}/members/me`);
      await ana.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });

      const response = await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });

      expect(response.body.data).toMatchObject({ status: 'WAITING', currentMatchId: null });
    });

    it('en tiempo real pide el inicio cuando la sala está completa y todos están listos', async () => {
      const starter = useFakeStarter();
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);

      await ana.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });
      await bea.put(`/rooms/${room.roomId}/members/me`);
      expect(starter.calls).toHaveLength(0);

      const response = await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });

      expect(starter.calls).toEqual([
        {
          roomId: room.roomId,
          gameId: expect.any(String),
          mode: 'REALTIME',
          timeControl: FIVE_MINUTES,
          settings: {},
          playerIds: [ana.playerId, bea.playerId],
        },
      ]);
      expect(response.status).toBe(200);
      expectMatchesContract('PUT', '/rooms/{roomId}/members/me/ready', response);
      expect(response.body.data).toMatchObject({
        status: 'IN_MATCH',
        currentMatchId: starter.currentMatches.get(room.roomId),
      });
    });

    it('no pide el inicio si falta alguien por entrar o por marcarse listo', async () => {
      const starter = useFakeStarter();
      const [ana, bea, carla] = [await signUp(t), await signUp(t), await signUp(t)];
      const room = await createRoom(ana, { ...PARTY, maxPlayers: 3 });
      await bea.put(`/rooms/${room.roomId}/members/me`);
      await ana.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });
      await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });
      await carla.put(`/rooms/${room.roomId}/members/me`);

      expect(starter.calls).toHaveLength(0);

      await carla.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });

      expect(starter.calls).toHaveLength(1);
      expect(starter.calls[0]?.playerIds).toEqual([ana.playerId, bea.playerId, carla.playerId]);
    });

    it('por turnos pide el inicio de la primera partida en cuanto la sala se completa', async () => {
      const starter = useFakeStarter();
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL_BY_TURNS);

      const response = await bea.put(`/rooms/${room.roomId}/members/me`);

      expect(starter.calls).toHaveLength(1);
      expect(response.status).toBe(200);
      expectMatchesContract('PUT', '/rooms/{roomId}/members/me', response);
      expect(response.body.data).toMatchObject({ status: 'IN_MATCH' });
      expect(response.body.data.currentMatchId).toEqual(expect.any(String));
    });

    it('por turnos, la revancha espera a que todos estén listos', async () => {
      const starter = useFakeStarter();
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, { ...DUEL_BY_TURNS, rematchEnabled: true });
      // La sala ya albergó una partida y volvió a la espera con una plaza libre.
      starter.played.add(room.roomId);

      await bea.put(`/rooms/${room.roomId}/members/me`);
      await ana.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });
      expect(starter.calls).toHaveLength(0);

      await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });
      expect(starter.calls).toHaveLength(1);
    });

    it('el inicio ocurre dentro de la misma transacción que completa la sala', async () => {
      const starter = useFakeStarter();
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL_BY_TURNS);

      await bea.put(`/rooms/${room.roomId}/members/me`);

      // Quien inicia la partida ya ve al miembro que acaba de entrar.
      expect(starter.membersSeenInTransaction).toEqual([2]);
    });

    it('si el inicio falla, la entrada tampoco se guarda y no se avisa de nada', async () => {
      const starter = useFakeStarter();
      starter.failing = true;
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL_BY_TURNS);
      events = [];

      const response = await bea.put(`/rooms/${room.roomId}/members/me`);

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(events).toEqual([]);
      const view = await ana.get(`/rooms/${room.roomId}`);
      expect(view.body.data.status).toBe('WAITING');
      expect(view.body.data.members).toHaveLength(1);
    });

    it('con una partida en curso no se puede entrar ni salir, ni cambiar la marca', async () => {
      useFakeStarter();
      const [ana, bea, carla] = [await signUp(t), await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL_BY_TURNS);
      await bea.put(`/rooms/${room.roomId}/members/me`);

      const joining = await carla.put(`/rooms/${room.roomId}/members/me`);
      const leaving = await bea.delete(`/rooms/${room.roomId}/members/me`);
      const ready = await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });
      const rejoining = await bea.put(`/rooms/${room.roomId}/members/me`);

      expect(joining.status).toBe(409);
      expect(joining.body.error.code).toBe('ROOM_NOT_WAITING');
      expect(leaving.status).toBe(409);
      expectMatchesContract('DELETE', '/rooms/{roomId}/members/me', leaving);
      expect(leaving.body.error.code).toBe('ROOM_IN_MATCH');
      expect(ready.status).toBe(409);
      expect(ready.body.error.code).toBe('ROOM_NOT_WAITING');
      // Quien ya es miembro recibe la sala tal como está.
      expect(rejoining.status).toBe(200);
      expect(rejoining.body.data.status).toBe('IN_MATCH');
    });
  });

  describe('cierre por inactividad', () => {
    const closeIdleRooms = () => t.app.get(RoomsService).closeIdleRooms();

    it('cierra una sala en tiempo real tras 30 minutos sin actividad', async () => {
      const ana = await signUp(t);
      const room = await createRoom(ana, DUEL);

      t.clock.advance(29 * MINUTE_MS);
      expect(await closeIdleRooms()).toBe(0);

      t.clock.advance(2 * MINUTE_MS);
      events = [];
      expect(await closeIdleRooms()).toBe(1);

      expect(events).toEqual([{ type: 'ROOM_CLOSED', roomId: room.roomId, closeReason: 'IDLE' }]);
      const view = await ana.get(`/rooms/${room.roomId}`);
      expect(view.body.data).toMatchObject({ status: 'CLOSED', closeReason: 'IDLE' });
      // La sala cerrada ya no cuenta para el límite.
      await createRoom(ana, DUEL);
    });

    it('cierra una sala por turnos tras 7 días, no antes', async () => {
      const ana = await signUp(t);
      const room = await createRoom(ana, DUEL_BY_TURNS);

      t.clock.advance(7 * DAY_MS - MINUTE_MS);
      expect(await closeIdleRooms()).toBe(0);

      t.clock.advance(2 * MINUTE_MS);
      expect(await closeIdleRooms()).toBe(1);
      const view = await ana.get(`/rooms/${room.roomId}`);
      expect(view.body.data.closeReason).toBe('IDLE');
    });

    it('entrar, salir y marcarse listo cuentan como actividad', async () => {
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL);

      t.clock.advance(20 * MINUTE_MS);
      await bea.put(`/rooms/${room.roomId}/members/me`);
      t.clock.advance(20 * MINUTE_MS);
      expect(await closeIdleRooms()).toBe(0);

      await bea.put(`/rooms/${room.roomId}/members/me/ready`, { ready: true });
      t.clock.advance(20 * MINUTE_MS);
      expect(await closeIdleRooms()).toBe(0);

      await bea.delete(`/rooms/${room.roomId}/members/me`);
      t.clock.advance(20 * MINUTE_MS);
      expect(await closeIdleRooms()).toBe(0);

      // Consultar la sala no cuenta.
      await ana.get(`/rooms/${room.roomId}`);
      t.clock.advance(11 * MINUTE_MS);
      expect(await closeIdleRooms()).toBe(1);
    });

    it('no cierra una sala con una partida en curso', async () => {
      useFakeStarter();
      const [ana, bea] = [await signUp(t), await signUp(t)];
      const room = await createRoom(ana, DUEL_BY_TURNS);
      await bea.put(`/rooms/${room.roomId}/members/me`);

      t.clock.advance(20 * DAY_MS);

      expect(await closeIdleRooms()).toBe(0);
      const view = await ana.get(`/rooms/${room.roomId}`);
      expect(view.body.data.status).toBe('IN_MATCH');
    });
  });
});
