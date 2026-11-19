import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { MatchSummaryView, MatchView, Page, RoomView } from '@gameboard/contracts';
import { fourInARowEngine } from '@gameboard/game-engine';
import { createFakeEngine } from '@gameboard/game-engine/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MatchSnapshot } from '../src/modules/broadcast/match-snapshot.js';
import { type RealtimeEvent, RealtimeEvents } from '../src/modules/broadcast/realtime-events.js';
import { DatabaseService } from '../src/database/database.service.js';
import { GameSessionsRepository } from '../src/modules/game-sessions/game-sessions.repository.js';
import { GameSessionsService } from '../src/modules/game-sessions/game-sessions.service.js';
import { Randomness } from '../src/modules/game-sessions/randomness.js';
import { TurnTimers } from '../src/modules/game-sessions/turn-timers.js';
import { API, createTestApp, type TestApp } from './app.js';
import { expectMatchesContract } from './contract.js';
import { query, resetDatabase } from './database.js';
import {
  FIVE_MINUTES,
  FOUR_IN_A_ROW,
  MINUTE_MS,
  seedFourInARow,
  type StartedMatch,
  startMatch,
  startMatchIn,
  stateVersionOf,
} from './match-setup.js';
import { signUp, type TestPlayer } from './players.js';
import { seedGame } from './seed.js';

const HOUR_MS = 60 * MINUTE_MS;
const ONE_DAY = { type: 'TOTAL_PER_PLAYER', totalMs: 24 * HOUR_MS } as const;

const engines = [
  fourInARowEngine,
  // Un juego cualquiera que admite partidas por turnos: termina en empate tras tres jugadas.
  createFakeEngine('counter', '1.0.0', {
    timeControls: { REALTIME: [FIVE_MINUTES], TURN_BASED: [ONE_DAY] },
  }),
];

const COUNTER_BY_TURNS = {
  gameSlug: 'counter',
  mode: 'TURN_BASED',
  timeControl: ONE_DAY,
  maxPlayers: 2,
};

/** Las 42 jugadas de una partida que llena el tablero sin que nadie alinee cuatro. */
const DRAW_GAME = [
  0, 1, 0, 1, 0, 1, 2, 3, 2, 3, 2, 3, 1, 0, 1, 0, 1, 0, 3, 2, 3, 2, 3, 2, 4, 5, 4, 5, 4, 5, 5, 4, 5,
  4, 5, 4, 6, 6, 6, 6, 6, 6,
];

/** El asiento 0 gana en vertical por la columna 0: juega 0, 0, 0 y 0; el otro, 1, 1 y 1. */
const FIRST_WINS = [0, 1, 0, 1, 0, 1, 0];

describe('partidas', () => {
  let t: TestApp;
  let sessions: GameSessionsService;
  let events: RealtimeEvent[];
  let stopListening: () => void;

  beforeAll(async () => {
    await resetDatabase();
    t = await createTestApp({ engines });
    sessions = t.app.get(GameSessionsService);
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
      versions: [{ version: '1.0.0', isCurrent: true }],
    });
    events = [];
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Ayudas --------------------------------------------------------------

  function drop(
    player: TestPlayer,
    matchId: string,
    column: number,
    stateVersion: number,
    requestId: string = randomUUID(),
  ): Promise<MatchSnapshot> {
    return sessions.submitAction(player.playerId, matchId, requestId, stateVersion, {
      type: 'DROP_TOKEN',
      column,
    });
  }

  /** Juega esas columnas, alternando los asientos desde el que le toca. */
  async function play(match: StartedMatch, columns: readonly number[]): Promise<MatchSnapshot> {
    let snapshot: MatchSnapshot | undefined;
    let stateVersion = await stateVersionOf(match.matchId);
    for (const column of columns) {
      const player = stateVersion % 2 === 0 ? match.first : match.second;
      snapshot = await drop(player, match.matchId, column, stateVersion);
      stateVersion = snapshot.stateVersion;
    }
    if (!snapshot) throw new Error('No se jugó ninguna columna');
    return snapshot;
  }

  async function getMatch(player: TestPlayer, matchId: string): Promise<MatchView> {
    const response = await player.get(`/matches/${matchId}`);
    expect(response.status, response.text).toBe(200);
    expectMatchesContract('GET', '/matches/{matchId}', response);
    return response.body.data as MatchView;
  }

  async function getRoom(player: TestPlayer, roomId: string): Promise<RoomView> {
    return (await player.get(`/rooms/${roomId}`)).body.data as RoomView;
  }

  async function listMatches(player: TestPlayer, params = ''): Promise<Page<MatchSummaryView>> {
    const response = await player.get(`/me/matches${params}`);
    expect(response.status, response.text).toBe(200);
    expectMatchesContract('GET', '/me/matches', response);
    return response.body.data as Page<MatchSummaryView>;
  }

  async function sessionRow(matchId: string) {
    const [row] = await query<{
      status: string;
      state_version: number;
      active_seats: number[];
      clocks: Record<string, number>;
      turn_started_at: Date | null;
      turn_deadline_at: Date | null;
    }>('select * from game_sessions where match_id = $1', [matchId]);
    if (!row) throw new Error('La partida no tiene sesión');
    return row;
  }

  function matchChanges(): Extract<RealtimeEvent, { type: 'MATCH_CHANGED' }>[] {
    return events.filter((event) => event.type === 'MATCH_CHANGED');
  }

  // --- Inicio --------------------------------------------------------------

  describe('inicio', () => {
    it('empieza cuando la sala está completa y todos están listos', async () => {
      const match = await startMatch(t);

      const [row] = await query('select * from matches where id = $1', [match.matchId]);
      expect(row).toMatchObject({
        room_id: match.roomId,
        mode: 'REALTIME',
        time_control: FIVE_MINUTES,
        status: 'IN_PROGRESS',
        abort_reason: null,
        ended_at: null,
      });
      expect(
        await query('select player_id, seat from match_players where match_id = $1 order by seat', [
          match.matchId,
        ]),
      ).toEqual([
        { player_id: match.first.playerId, seat: 0 },
        { player_id: match.second.playerId, seat: 1 },
      ]);

      const session = await sessionRow(match.matchId);
      expect(session).toMatchObject({
        status: 'ACTIVE',
        state_version: 0,
        active_seats: [0],
        clocks: { '0': 5 * MINUTE_MS, '1': 5 * MINUTE_MS },
      });
      // La fecha límite es el instante en que se agota el reloj de quien empieza.
      expect(session.turn_deadline_at?.getTime()).toBe(
        (session.turn_started_at?.getTime() ?? 0) + 5 * MINUTE_MS,
      );

      const room = await getRoom(match.owner, match.roomId);
      expect(room).toMatchObject({ status: 'IN_MATCH', currentMatchId: match.matchId });
    });

    it('guarda con la partida la semilla y las opciones con las que empezó (ADR-018, Z1)', async () => {
      const seed = vi.spyOn(t.app.get(Randomness), 'seed');
      await startMatch(t);

      const rows = await query<{ settings: unknown; seed: string }>(
        'select settings, seed from matches',
      );
      expect(rows).toEqual([{ settings: {}, seed: seed.mock.results[0]?.value }]);
      expect(rows[0]?.seed).toMatch(/.{16,}/);
    });

    it('la partida toma la versión vigente del juego y la conserva', async () => {
      const match = await startMatch(t);

      const view = await getMatch(match.first, match.matchId);
      expect(view).toMatchObject({ gameSlug: 'four-in-a-row', gameVersion: '1.0.0' });
    });

    it('anuncia la partida que empieza, con lo que ve cada asiento', async () => {
      const match = await startMatch(t);

      const [change] = matchChanges();
      expect(matchChanges()).toHaveLength(1);
      expect(change).toMatchObject({
        events: [],
        origin: null,
        snapshot: { matchId: match.matchId, status: 'IN_PROGRESS', stateVersion: 0 },
      });
      expect(change?.snapshot.players.map((player) => player.playerId)).toEqual([
        match.first.playerId,
        match.second.playerId,
      ]);
      expect(change?.snapshot.views).toHaveLength(2);
    });

    it('sortea los asientos en la primera partida de una sala', async () => {
      const shuffle = vi.spyOn(t.app.get(Randomness), 'shuffle');
      // El sorteo deja en el asiento 0 a quien llegó el último.
      shuffle.mockImplementation((items) => [...items].reverse());

      const match = await startMatch(t);

      expect(shuffle).toHaveBeenCalledTimes(1);
      expect(match.first.playerId).toBe(match.guest.playerId);
      expect(match.second.playerId).toBe(match.owner.playerId);
    });

    it('si no se puede iniciar la partida, nadie queda listo a medias', async () => {
      const owner = await signUp(t);
      const guest = await signUp(t);
      const { roomId } = (await owner.post('/rooms', FOUR_IN_A_ROW)).body.data as RoomView;
      await guest.put(`/rooms/${roomId}/members/me`);
      await owner.put(`/rooms/${roomId}/members/me/ready`, { ready: true });
      vi.spyOn(t.app.get(Randomness), 'seed').mockImplementation(() => {
        throw new Error('Sin azar');
      });

      const response = await guest.put(`/rooms/${roomId}/members/me/ready`, { ready: true });

      expect(response.status).toBe(500);
      const room = await getRoom(owner, roomId);
      expect(room.status).toBe('WAITING');
      expect(room.members.map((member) => member.ready)).toEqual([true, false]);
      expect(await query('select id from matches')).toEqual([]);
      expect(matchChanges()).toEqual([]);
    });
  });

  // --- Consulta ------------------------------------------------------------

  describe('consultar una partida', () => {
    it('cada participante la ve desde su asiento', async () => {
      const match = await startMatch(t);

      const first = await getMatch(match.first, match.matchId);
      const second = await getMatch(match.second, match.matchId);

      expect(first).toMatchObject({
        matchId: match.matchId,
        roomId: match.roomId,
        mode: 'REALTIME',
        timeControl: FIVE_MINUTES,
        status: 'IN_PROGRESS',
        stateVersion: 0,
        yourSeat: 0,
        activeSeats: [0],
        result: null,
        abortReason: null,
        endedAt: null,
      });
      expect(second.yourSeat).toBe(1);
      expect(first.players).toMatchObject([
        { seat: 0, playerId: match.first.playerId, connected: false },
        { seat: 1, playerId: match.second.playerId, connected: false },
      ]);
      // Nadie está conectado al canal: los dos cuentan ya su plazo de abandono (regla 7.26).
      for (const player of first.players) {
        const delay = Date.parse(player.abandonAt ?? '') - Date.parse(first.startedAt);
        expect(delay).toBeGreaterThanOrEqual(2 * MINUTE_MS);
        expect(delay).toBeLessThan(2 * MINUTE_MS + 1000);
      }
      expect(first.view).toMatchObject({
        columnCount: 7,
        rowCount: 6,
        playableColumns: [0, 1, 2, 3, 4, 5, 6],
        lastToken: null,
        winningLine: null,
      });
    });

    it('el reloj de quien tiene el turno corre y el del otro no', async () => {
      const match = await startMatch(t);
      t.clock.advance(40 * 1000);

      const view = await getMatch(match.second, match.matchId);

      const [first, second] = view.players;
      expect(first?.clockRemainingMs).toBeLessThanOrEqual(5 * MINUTE_MS - 40 * 1000);
      expect(first?.clockRemainingMs).toBeGreaterThan(5 * MINUTE_MS - 45 * 1000);
      expect(second?.clockRemainingMs).toBe(5 * MINUTE_MS);
    });

    it('solo la ven sus participantes', async () => {
      const match = await startMatch(t);
      const outsider = await signUp(t);

      const response = await outsider.get(`/matches/${match.matchId}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PLAYER_NOT_IN_MATCH');
      expectMatchesContract('GET', '/matches/{matchId}', response);
    });

    it('responde que no existe si el identificador no nombra ninguna partida', async () => {
      const player = await signUp(t);

      for (const matchId of [randomUUID(), 'no-es-un-identificador']) {
        const response = await player.get(`/matches/${matchId}`);
        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('MATCH_NOT_FOUND');
        expectMatchesContract('GET', '/matches/{matchId}', response);
      }
    });

    it('exige sesión', async () => {
      const match = await startMatch(t);

      const response = await t.request().get(`${API}/matches/${match.matchId}`);

      expect(response.status).toBe(401);
      expectMatchesContract('GET', '/matches/{matchId}', response);
    });
  });

  // --- Jugadas -------------------------------------------------------------

  describe('jugadas', () => {
    it('aplica la jugada, pasa el turno y la anota en el registro', async () => {
      const match = await startMatch(t);
      t.clock.advance(20 * 1000);
      const requestId = randomUUID();

      const snapshot = await drop(match.first, match.matchId, 3, 0, requestId);

      expect(snapshot).toMatchObject({ status: 'IN_PROGRESS', stateVersion: 1, activeSeats: [1] });
      expect(snapshot.views[1]).toMatchObject({ lastToken: { seat: 0, column: 3, row: 0 } });

      const actions = await query('select * from match_actions where match_id = $1', [
        match.matchId,
      ]);
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        sequence: 1,
        player_id: match.first.playerId,
        request_id: requestId,
        action: { type: 'DROP_TOKEN', column: 3 },
      });
      // A quien jugó se le descuenta el tiempo que tardó.
      expect(actions[0]?.['clock_remaining_ms']).toBeLessThanOrEqual(5 * MINUTE_MS - 20 * 1000);
      expect(actions[0]?.['clock_remaining_ms']).toBeGreaterThan(5 * MINUTE_MS - 25 * 1000);

      const session = await sessionRow(match.matchId);
      expect(session).toMatchObject({ status: 'ACTIVE', state_version: 1, active_seats: [1] });
      expect(session.clocks['0']).toBe(actions[0]?.['clock_remaining_ms']);
      expect(session.clocks['1']).toBe(5 * MINUTE_MS);
      // Ahora corre el reloj del otro asiento, desde el instante de la jugada.
      expect(session.turn_deadline_at?.getTime()).toBe(
        (session.turn_started_at?.getTime() ?? 0) + 5 * MINUTE_MS,
      );
    });

    it('anuncia la jugada con sus eventos de juego y con la orden que la provocó', async () => {
      const match = await startMatch(t);
      events = [];
      const requestId = randomUUID();

      await drop(match.first, match.matchId, 3, 0, requestId);

      expect(matchChanges()).toHaveLength(1);
      expect(matchChanges()[0]).toMatchObject({
        events: [{ type: 'TOKEN_DROPPED', seat: 0, column: 3, row: 0 }],
        origin: { playerId: match.first.playerId, requestId },
        snapshot: { stateVersion: 1 },
      });
    });

    it('rechaza la jugada de quien no participa y la de una partida que no existe', async () => {
      const match = await startMatch(t);
      const outsider = await signUp(t);

      await expect(drop(outsider, match.matchId, 3, 0)).rejects.toMatchObject({
        code: 'PLAYER_NOT_IN_MATCH',
      });
      await expect(drop(match.first, randomUUID(), 3, 0)).rejects.toMatchObject({
        code: 'MATCH_NOT_FOUND',
      });
      expect(await stateVersionOf(match.matchId)).toBe(0);
    });

    it('rechaza la jugada hecha sobre un estado que ya cambió, y dice la versión actual', async () => {
      const match = await startMatch(t);
      await drop(match.first, match.matchId, 3, 0);

      // El asiento 1 juega creyendo que la partida sigue en la versión 0.
      await expect(drop(match.second, match.matchId, 3, 0)).rejects.toMatchObject({
        code: 'STALE_STATE_VERSION',
        details: { currentStateVersion: 1 },
      });
      expect(await stateVersionOf(match.matchId)).toBe(1);
    });

    it('rechaza la jugada de quien no tiene el turno', async () => {
      const match = await startMatch(t);

      await expect(drop(match.second, match.matchId, 3, 0)).rejects.toMatchObject({
        code: 'NOT_YOUR_TURN',
      });
      expect(await stateVersionOf(match.matchId)).toBe(0);
    });

    it('rechaza la jugada que el juego no permite, con el motivo del juego', async () => {
      const match = await startMatch(t);
      // Se llena la columna 0 con seis fichas.
      await play(match, [0, 0, 0, 0, 0, 0]);

      await expect(drop(match.first, match.matchId, 0, 6)).rejects.toMatchObject({
        code: 'INVALID_ACTION',
        details: { reason: 'COLUMN_FULL' },
      });
      await expect(drop(match.first, match.matchId, 7, 6)).rejects.toMatchObject({
        code: 'INVALID_ACTION',
        details: { reason: 'COLUMN_OUT_OF_RANGE' },
      });
      await expect(
        sessions.submitAction(match.first.playerId, match.matchId, randomUUID(), 6, {
          type: 'MOVE',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_ACTION', details: { reason: 'MALFORMED_ACTION' } });

      expect(await stateVersionOf(match.matchId)).toBe(6);
      expect(await query('select sequence from match_actions')).toHaveLength(6);
    });

    it('repetir una petición ya aplicada no la aplica otra vez', async () => {
      const match = await startMatch(t);
      const requestId = randomUUID();
      await drop(match.first, match.matchId, 3, 0, requestId);
      events = [];

      // La misma petición llega de nuevo, por ejemplo tras reconectar.
      const repeated = await drop(match.first, match.matchId, 3, 0, requestId);

      expect(repeated).toMatchObject({ stateVersion: 1, activeSeats: [1] });
      expect(await query('select sequence from match_actions')).toHaveLength(1);
      expect(matchChanges()).toEqual([]);
    });

    it('la misma petición de otro jugador es otra petición', async () => {
      const match = await startMatch(t);
      const requestId = randomUUID();
      await drop(match.first, match.matchId, 3, 0, requestId);

      const snapshot = await drop(match.second, match.matchId, 3, 1, requestId);

      expect(snapshot.stateVersion).toBe(2);
    });

    it('de dos jugadas simultáneas sobre el mismo estado solo se aplica una', async () => {
      const match = await startMatch(t);

      const results = await Promise.allSettled([
        drop(match.first, match.matchId, 2, 0),
        drop(match.first, match.matchId, 4, 0),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected).toMatchObject({
        reason: { code: 'STALE_STATE_VERSION', details: { currentStateVersion: 1 } },
      });
      expect(await stateVersionOf(match.matchId)).toBe(1);
      expect(await query('select sequence from match_actions')).toHaveLength(1);
    });

    it('la misma petición enviada dos veces a la vez se aplica una sola vez', async () => {
      const match = await startMatch(t);
      const requestId = randomUUID();

      const [one, other] = await Promise.all([
        drop(match.first, match.matchId, 3, 0, requestId),
        drop(match.first, match.matchId, 3, 0, requestId),
      ]);

      expect(one.stateVersion).toBe(1);
      expect(other.stateVersion).toBe(1);
      expect(await query('select sequence from match_actions')).toHaveLength(1);
    });
  });

  // --- Carreras entre operaciones distintas (análisis del 2026-11-19, T-13) -

  describe('operaciones distintas a la vez', () => {
    it('una rendición y una jugada simultáneas dejan un solo resultado: la rendición', async () => {
      const match = await startMatch(t);

      const [move, resigned] = await Promise.allSettled([
        drop(match.first, match.matchId, 3, 0),
        sessions.resign(match.second.playerId, match.matchId, randomUUID()),
      ]);

      expect(resigned.status).toBe('fulfilled');
      if (move.status === 'rejected') {
        expect(move.reason).toMatchObject({ code: 'MATCH_NOT_IN_PROGRESS' });
      }
      expect(await query('select reason from match_results')).toEqual([{ reason: 'RESIGNATION' }]);
      expect(await query('select match_id from player_results')).toHaveLength(2);
      expect((await getRoom(match.owner, match.roomId)).status).toBe('WAITING');
    });

    it('una anulación del administrador y una jugada simultáneas dejan la partida anulada y sin resultado', async () => {
      const match = await startMatch(t);

      const [move, aborted] = await Promise.allSettled([
        drop(match.first, match.matchId, 3, 0),
        sessions.abortByAdmin(match.matchId, { closeRoom: false }),
      ]);

      expect(aborted).toEqual({ status: 'fulfilled', value: true });
      if (move.status === 'rejected') {
        expect(move.reason).toMatchObject({ code: 'MATCH_NOT_IN_PROGRESS' });
      }
      expect(await query('select status, abort_reason from matches')).toEqual([
        { status: 'ABORTED', abort_reason: 'ADMIN' },
      ]);
      expect(await query('select match_id from match_results')).toEqual([]);
      expect(await query('select match_id from player_results')).toEqual([]);
      expect((await getRoom(match.owner, match.roomId)).status).toBe('WAITING');
    });

    it('dos marcas de listo simultáneas que completan la sala empiezan una sola partida', async () => {
      const owner = await signUp(t);
      const guest = await signUp(t);
      const { roomId } = (await owner.post('/rooms', FOUR_IN_A_ROW)).body.data as RoomView;
      await guest.put(`/rooms/${roomId}/members/me`);

      const responses = await Promise.all([
        owner.put(`/rooms/${roomId}/members/me/ready`, { ready: true }),
        guest.put(`/rooms/${roomId}/members/me/ready`, { ready: true }),
      ]);

      // La segunda llega con la sala ya en partida, o la completa ella.
      for (const response of responses) {
        expect([200, 409], response.text).toContain(response.status);
        if (response.status === 409) expect(response.body.error.code).toBe('ROOM_NOT_WAITING');
      }
      expect(await query('select id from matches')).toHaveLength(1);
      expect(await query('select match_id from game_sessions')).toHaveLength(1);
      const room = await getRoom(owner, roomId);
      expect(room.status).toBe('IN_MATCH');
    });

    it('la segunda barrera: el estado no se guarda si su versión ya no es la esperada (8.8)', async () => {
      const match = await startMatch(t);
      await drop(match.first, match.matchId, 3, 0);
      const repository = t.app.get(GameSessionsRepository);

      // Con la fila bloqueada, se intenta guardar sobre la versión 0, que ya no es la actual.
      const updated = await t.app.get(DatabaseService).transaction(async (tx) => {
        const current = await repository.lockSession(match.matchId, tx);
        if (!current) throw new Error('La partida no tiene sesión');
        const { status, activeSeats, activeSince, clocks, turnStartedAt, turnDeadlineAt } = current;
        return repository.updateSession(
          match.matchId,
          0,
          {
            status,
            state: { roto: true },
            stateVersion: 1,
            activeSeats,
            activeSince,
            clocks,
            turnStartedAt,
            turnDeadlineAt,
            updatedAt: new Date(),
          },
          tx,
        );
      });

      expect(updated).toBe(false);
      const row = await sessionRow(match.matchId);
      expect(row.state_version).toBe(1);
      expect(row).not.toMatchObject({ state: { roto: true } });
    });
  });

  // --- Final ---------------------------------------------------------------

  describe('final de partida', () => {
    it('quien alinea cuatro gana, y todo queda guardado a la vez', async () => {
      const match = await startMatch(t);

      const snapshot = await play(match, FIRST_WINS);

      expect(snapshot).toMatchObject({
        status: 'FINISHED',
        stateVersion: 7,
        activeSeats: [],
        turnDeadlineAt: null,
        result: {
          reason: 'COMPLETED',
          seats: [
            { seat: 0, outcome: 'WIN' },
            { seat: 1, outcome: 'LOSS' },
          ],
        },
      });
      expect(snapshot.endedAt).toBeInstanceOf(Date);

      expect(await query('select status, abort_reason from matches')).toEqual([
        { status: 'FINISHED', abort_reason: null },
      ]);
      expect(await query('select reason from match_results')).toEqual([{ reason: 'COMPLETED' }]);
      expect(
        await query('select player_id, outcome, score from player_results order by outcome desc'),
      ).toEqual([
        { player_id: match.first.playerId, outcome: 'WIN', score: null },
        { player_id: match.second.playerId, outcome: 'LOSS', score: null },
      ]);
      expect(await sessionRow(match.matchId)).toMatchObject({
        status: 'CLOSED',
        state_version: 7,
        active_seats: [],
        turn_deadline_at: null,
      });
      expect(await query('select sequence from match_actions')).toHaveLength(7);
    });

    it('la vista final enseña la línea ganadora y el resultado', async () => {
      const match = await startMatch(t);
      await play(match, FIRST_WINS);

      const view = await getMatch(match.second, match.matchId);

      expect(view).toMatchObject({
        status: 'FINISHED',
        yourSeat: 1,
        activeSeats: [],
        turnDeadlineAt: null,
        result: { reason: 'COMPLETED' },
      });
      expect(view.endedAt).not.toBeNull();
      expect(view.view).toMatchObject({
        playableColumns: [],
        winningLine: [
          { column: 0, row: 0 },
          { column: 0, row: 1 },
          { column: 0, row: 2 },
          { column: 0, row: 3 },
        ],
      });
    });

    it('la sala vuelve a la espera, sin marcas de listo', async () => {
      const match = await startMatch(t);
      events = [];

      await play(match, FIRST_WINS);

      const room = await getRoom(match.owner, match.roomId);
      expect(room).toMatchObject({ status: 'WAITING', currentMatchId: null, closeReason: null });
      expect(room.members.map((member) => member.ready)).toEqual([false, false]);
      expect(events).toContainEqual({ type: 'ROOM_CHANGED', roomId: match.roomId });
    });

    it('si el tablero se llena sin cuatro en línea, es empate', async () => {
      const match = await startMatch(t);

      const snapshot = await play(match, DRAW_GAME);

      expect(snapshot).toMatchObject({
        status: 'FINISHED',
        stateVersion: 42,
        result: {
          reason: 'COMPLETED',
          seats: [
            { seat: 0, outcome: 'DRAW' },
            { seat: 1, outcome: 'DRAW' },
          ],
        },
      });
    });

    it('una partida terminada no admite más jugadas', async () => {
      const match = await startMatch(t);
      await play(match, FIRST_WINS);

      await expect(drop(match.second, match.matchId, 5, 7)).rejects.toMatchObject({
        code: 'MATCH_NOT_IN_PROGRESS',
      });
      expect(await query('select sequence from match_actions')).toHaveLength(7);
    });

    it('si el final no se puede guardar entero, no se guarda nada', async () => {
      const match = await startMatch(t);
      await play(match, FIRST_WINS.slice(0, -1));
      // Un resultado que ya existe impide anotar el de esta partida.
      await query(
        `insert into match_results (match_id, reason, created_at) values ($1, 'COMPLETED', now())`,
        [match.matchId],
      );
      events = [];

      await expect(drop(match.first, match.matchId, 0, 6)).rejects.toThrow();

      expect(await query('select status from matches')).toEqual([{ status: 'IN_PROGRESS' }]);
      expect(await sessionRow(match.matchId)).toMatchObject({ status: 'ACTIVE', state_version: 6 });
      expect(await query('select sequence from match_actions')).toHaveLength(6);
      expect((await getRoom(match.owner, match.roomId)).status).toBe('IN_MATCH');
      expect(events).toEqual([]);
    });
  });

  // --- Relojes -------------------------------------------------------------

  describe('relojes', () => {
    it('mientras queda tiempo, comprobar el reloj no cambia nada', async () => {
      const match = await startMatch(t);
      t.clock.advance(5 * MINUTE_MS - 1000);

      expect(await sessions.expireIfDue(match.matchId)).toBe(false);
      expect(await sessions.expireDueMatches()).toBe(0);
      expect(await query('select status from matches')).toEqual([{ status: 'IN_PROGRESS' }]);
    });

    it('un aviso que llega antes de tiempo vuelve a poner el temporizador a la fecha límite', async () => {
      const match = await startMatch(t);
      const { turn_deadline_at: deadline } = await sessionRow(match.matchId);
      const arm = vi.spyOn(t.app.get(TurnTimers), 'arm');
      t.clock.advance(5 * MINUTE_MS - 1000);

      expect(await sessions.expireIfDue(match.matchId)).toBe(false);

      expect(arm).toHaveBeenCalledExactlyOnceWith(match.matchId, deadline);
    });

    it('quien agota su tiempo pierde la partida', async () => {
      const match = await startMatch(t);
      await drop(match.first, match.matchId, 3, 0);
      events = [];
      t.clock.advance(5 * MINUTE_MS + 1);

      expect(await sessions.expireIfDue(match.matchId)).toBe(true);

      const view = await getMatch(match.first, match.matchId);
      expect(view).toMatchObject({
        status: 'FINISHED',
        stateVersion: 2,
        result: {
          reason: 'TIMEOUT',
          seats: [
            { seat: 0, outcome: 'WIN' },
            { seat: 1, outcome: 'LOSS' },
          ],
        },
      });
      // A quien se le acabó el tiempo le queda cero.
      expect(view.players[1]?.clockRemainingMs).toBe(0);
      expect(await query('select reason from match_results')).toEqual([{ reason: 'TIMEOUT' }]);
      expect((await getRoom(match.owner, match.roomId)).status).toBe('WAITING');
      expect(matchChanges()).toHaveLength(1);
      expect(matchChanges()[0]).toMatchObject({ origin: null, snapshot: { status: 'FINISHED' } });
    });

    it('la revisión periódica encuentra los relojes vencidos', async () => {
      const match = await startMatch(t);
      t.clock.advance(5 * MINUTE_MS + 1);

      expect(await sessions.expireDueMatches()).toBe(1);

      expect(await query('select reason from match_results')).toEqual([{ reason: 'TIMEOUT' }]);
      expect(
        await query('select outcome from player_results where player_id = $1', [
          match.first.playerId,
        ]),
      ).toEqual([{ outcome: 'LOSS' }]);
      // Una segunda revisión ya no encuentra nada.
      expect(await sessions.expireDueMatches()).toBe(0);
    });

    it('una jugada que llega con el reloj vencido se rechaza y la partida termina por tiempo', async () => {
      const match = await startMatch(t);
      events = [];
      t.clock.advance(5 * MINUTE_MS + 1);

      await expect(drop(match.first, match.matchId, 3, 0)).rejects.toMatchObject({
        code: 'CLOCK_EXPIRED',
      });

      expect(await query('select sequence from match_actions')).toEqual([]);
      expect(await query('select status from matches')).toEqual([{ status: 'FINISHED' }]);
      expect(await query('select reason from match_results')).toEqual([{ reason: 'TIMEOUT' }]);
      // El final se anuncia aunque la orden se rechace.
      expect(matchChanges()).toHaveLength(1);
      expect(matchChanges()[0]).toMatchObject({ origin: null, snapshot: { status: 'FINISHED' } });
    });

    it('el vencimiento y una jugada simultáneos no se aplican los dos', async () => {
      const match = await startMatch(t);
      t.clock.advance(5 * MINUTE_MS + 1);

      const [expired, move] = await Promise.allSettled([
        sessions.expireIfDue(match.matchId),
        drop(match.first, match.matchId, 3, 0),
      ]);

      expect(move.status).toBe('rejected');
      expect(expired.status).toBe('fulfilled');
      expect(await query('select reason from match_results')).toEqual([{ reason: 'TIMEOUT' }]);
      expect(await query('select sequence from match_actions')).toEqual([]);
    });
  });

  // --- Rendición -----------------------------------------------------------

  describe('rendición', () => {
    it('quien se rinde pierde, le toque o no', async () => {
      const match = await startMatch(t);
      events = [];
      const requestId = randomUUID();

      // Le toca al asiento 0 y se rinde el asiento 1.
      const snapshot = await sessions.resign(match.second.playerId, match.matchId, requestId);

      expect(snapshot).toMatchObject({
        status: 'FINISHED',
        stateVersion: 1,
        result: {
          reason: 'RESIGNATION',
          seats: [
            { seat: 0, outcome: 'WIN' },
            { seat: 1, outcome: 'LOSS' },
          ],
        },
      });
      expect(await query('select reason from match_results')).toEqual([{ reason: 'RESIGNATION' }]);
      expect((await getRoom(match.owner, match.roomId)).status).toBe('WAITING');
      expect(matchChanges()[0]).toMatchObject({
        origin: { playerId: match.second.playerId, requestId },
      });
    });

    it('la rendición queda en el registro con la numeración de las jugadas (ADR-018, Z2)', async () => {
      const match = await startMatch(t);
      await play(match, [3, 4]);

      await sessions.resign(match.first.playerId, match.matchId, randomUUID());

      expect(await query('select sequence from match_actions order by sequence')).toEqual([
        { sequence: 1 },
        { sequence: 2 },
      ]);
      expect(await query('select sequence, player_id, reason from match_retirements')).toEqual([
        { sequence: 3, player_id: match.first.playerId, reason: 'RESIGNATION' },
      ]);
      expect((await sessionRow(match.matchId)).state_version).toBe(3);
    });

    it('si el reloj ya se había agotado, se anota solo esa retirada', async () => {
      const match = await startMatch(t);
      t.clock.advance(5 * MINUTE_MS + 1);

      await sessions.resign(match.second.playerId, match.matchId, randomUUID());

      expect(await query('select sequence, player_id, reason from match_retirements')).toEqual([
        { sequence: 1, player_id: match.first.playerId, reason: 'TIMEOUT' },
      ]);
    });

    it('solo se rinde un participante de una partida en curso', async () => {
      const match = await startMatch(t);
      const outsider = await signUp(t);

      await expect(
        sessions.resign(outsider.playerId, match.matchId, randomUUID()),
      ).rejects.toMatchObject({ code: 'PLAYER_NOT_IN_MATCH' });
      await expect(
        sessions.resign(match.first.playerId, randomUUID(), randomUUID()),
      ).rejects.toMatchObject({ code: 'MATCH_NOT_FOUND' });

      await sessions.resign(match.first.playerId, match.matchId, randomUUID());
      await expect(
        sessions.resign(match.second.playerId, match.matchId, randomUUID()),
      ).rejects.toMatchObject({ code: 'MATCH_NOT_IN_PROGRESS' });
      expect(await query('select reason from match_results')).toHaveLength(1);
    });

    it('si su rival ya había agotado el tiempo, gana quien iba a rendirse', async () => {
      const match = await startMatch(t);
      t.clock.advance(5 * MINUTE_MS + 1);

      // El asiento 0 agotó su reloj antes de que el asiento 1 se rindiera.
      const snapshot = await sessions.resign(match.second.playerId, match.matchId, randomUUID());

      expect(snapshot.result).toEqual({
        reason: 'TIMEOUT',
        seats: [
          { seat: 0, outcome: 'LOSS' },
          { seat: 1, outcome: 'WIN' },
        ],
      });
    });
  });

  // --- Revancha ------------------------------------------------------------

  describe('revancha', () => {
    it('con los mismos jugadores, los asientos se alternan sin sortear de nuevo', async () => {
      const match = await startMatch(t);
      await sessions.resign(match.first.playerId, match.matchId, randomUUID());
      const shuffle = vi.spyOn(t.app.get(Randomness), 'shuffle');

      const rematch = await startMatchIn(match.roomId, match.owner, match.guest);

      expect(rematch.matchId).not.toBe(match.matchId);
      expect(rematch.first.playerId).toBe(match.second.playerId);
      expect(rematch.second.playerId).toBe(match.first.playerId);
      expect(shuffle).not.toHaveBeenCalled();

      // Y en la tercera partida vuelven a alternarse.
      await sessions.resign(rematch.first.playerId, rematch.matchId, randomUUID());
      const third = await startMatchIn(match.roomId, match.owner, match.guest);
      expect(third.first.playerId).toBe(match.first.playerId);
    });

    it('si cambia un jugador, los asientos se sortean de nuevo', async () => {
      const match = await startMatch(t);
      await sessions.resign(match.first.playerId, match.matchId, randomUUID());
      const leaving = await match.guest.delete(`/rooms/${match.roomId}/members/me`);
      expect(leaving.status).toBe(204);
      const newcomer = await signUp(t, { displayName: 'Cleo' });
      await newcomer.put(`/rooms/${match.roomId}/members/me`);
      const shuffle = vi.spyOn(t.app.get(Randomness), 'shuffle');
      shuffle.mockImplementation((items) => [...items]);

      const rematch = await startMatchIn(match.roomId, match.owner, newcomer);

      expect(shuffle).toHaveBeenCalledTimes(1);
      expect(rematch.first.playerId).toBe(match.owner.playerId);
      expect(rematch.second.playerId).toBe(newcomer.playerId);
    });

    it('no se puede salir de la sala con la partida en curso, y sí al terminar', async () => {
      const match = await startMatch(t);

      const during = await match.guest.delete(`/rooms/${match.roomId}/members/me`);
      expect(during.status).toBe(409);
      expect(during.body.error.code).toBe('ROOM_IN_MATCH');

      await sessions.resign(match.guest.playerId, match.matchId, randomUUID());
      const after = await match.guest.delete(`/rooms/${match.roomId}/members/me`);
      expect(after.status).toBe(204);
    });
  });

  // --- Otros juegos y modalidades ------------------------------------------

  describe('otros juegos', () => {
    it('la plataforma dirige igual una partida de otro juego', async () => {
      const match = await startMatch(t, { ...FOUR_IN_A_ROW, gameSlug: 'counter' });
      const increment = { type: 'INCREMENT' };

      await sessions.submitAction(match.first.playerId, match.matchId, randomUUID(), 0, increment);
      await sessions.submitAction(match.second.playerId, match.matchId, randomUUID(), 1, increment);
      const snapshot = await sessions.submitAction(
        match.first.playerId,
        match.matchId,
        randomUUID(),
        2,
        increment,
      );

      expect(snapshot).toMatchObject({
        gameSlug: 'counter',
        status: 'FINISHED',
        result: {
          reason: 'COMPLETED',
          seats: [
            { seat: 0, outcome: 'DRAW' },
            { seat: 1, outcome: 'DRAW' },
          ],
        },
      });
    });

    it('una sala por turnos sin revancha se cierra al terminar su partida', async () => {
      const owner = await signUp(t);
      const guest = await signUp(t);
      const created = await owner.post('/rooms', { ...COUNTER_BY_TURNS, rematchEnabled: false });
      const { roomId } = created.body.data as RoomView;
      // La primera partida de una sala por turnos empieza al completarse la sala.
      const joined = await guest.put(`/rooms/${roomId}/members/me`);
      const { currentMatchId } = joined.body.data as RoomView;
      expect(currentMatchId).not.toBeNull();
      events = [];

      await sessions.resign(owner.playerId, currentMatchId as string, randomUUID());

      const room = await getRoom(owner, roomId);
      expect(room).toMatchObject({ status: 'CLOSED', closeReason: 'MATCH_ENDED' });
      expect(events).toContainEqual({ type: 'ROOM_CLOSED', roomId, closeReason: 'MATCH_ENDED' });
    });
  });

  // --- Cuatro en raya por turnos (Hito 5) ----------------------------------

  describe('Cuatro en raya por turnos', () => {
    const TWELVE_HOURS = { type: 'TOTAL_PER_PLAYER', totalMs: 12 * HOUR_MS } as const;
    const BY_TURNS = { ...FOUR_IN_A_ROW, mode: 'TURN_BASED', timeControl: TWELVE_HOURS };

    /** Ana crea la sala y Bea la completa, con lo que empieza la partida (regla 7.10). */
    async function startByTurns(rematchEnabled: boolean): Promise<StartedMatch> {
      const owner = await signUp(t, { displayName: 'Ana' });
      const guest = await signUp(t, { displayName: 'Bea' });
      const created = await owner.post('/rooms', { ...BY_TURNS, rematchEnabled });
      expect(created.status, created.text).toBe(201);
      const { roomId } = created.body.data as RoomView;
      const joined = await guest.put(`/rooms/${roomId}/members/me`);
      expect(joined.status, joined.text).toBe(200);
      const room = joined.body.data as RoomView;
      expect(room.status).toBe('IN_MATCH');
      const matchId = room.currentMatchId as string;
      const view = await getMatch(owner, matchId);
      const [first, second] = view.yourSeat === 0 ? [owner, guest] : [guest, owner];
      return { roomId, matchId, first, second, owner, guest };
    }

    it('el catálogo ofrece 12, 24 y 36 horas (ADR-016, decisión N1)', async () => {
      const response = await t.request().get(`${API}/games/four-in-a-row`);
      expect(response.status).toBe(200);
      expect(response.body.data.timeControls.TURN_BASED).toEqual(
        [12, 24, 36].map((hours) => ({ type: 'TOTAL_PER_PLAYER', totalMs: hours * HOUR_MS })),
      );
    });

    it('no admite un control de tiempo que el juego no declara', async () => {
      const owner = await signUp(t);
      const response = await owner.post('/rooms', {
        ...BY_TURNS,
        timeControl: { type: 'TOTAL_PER_PLAYER', totalMs: 6 * HOUR_MS },
      });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: 'UNSUPPORTED_ROOM_OPTIONS',
        details: { option: 'timeControl' },
      });
    });

    it('empieza al completarse la sala, y la lista dice a quién le toca y hasta cuándo', async () => {
      const match = await startByTurns(false);

      const [mine] = (await listMatches(match.first, '?status=IN_PROGRESS')).items;
      expect(mine).toMatchObject({ matchId: match.matchId, mode: 'TURN_BASED', yourTurn: true });
      const deadline = new Date(mine?.turnDeadlineAt as string).getTime();
      expect(deadline).toBe(new Date(mine?.startedAt as string).getTime() + 12 * HOUR_MS);
      const [theirs] = (await listMatches(match.second, '?status=IN_PROGRESS')).items;
      expect(theirs).toMatchObject({ matchId: match.matchId, yourTurn: false });

      // Tras la jugada, le toca a la otra, con su propio reloj completo.
      t.clock.advance(3 * HOUR_MS);
      await drop(match.first, match.matchId, 3, 0);
      const [next] = (await listMatches(match.second, '?status=IN_PROGRESS')).items;
      expect(next).toMatchObject({ yourTurn: true });
      // La jugada llegó unas 3 horas después del inicio: el plazo nuevo es 3 horas más tarde.
      const nextDeadline = new Date(next?.turnDeadlineAt as string).getTime();
      expect(Math.abs(nextDeadline - deadline - 3 * HOUR_MS)).toBeLessThan(5000);
      const view = await getMatch(match.first, match.matchId);
      expect(Math.abs((view.players[0]?.clockRemainingMs ?? 0) - 9 * HOUR_MS)).toBeLessThan(5000);
    });

    it('el reloj de 12 horas se agota a las 12 horas, no antes', async () => {
      const match = await startByTurns(false);

      t.clock.advance(12 * HOUR_MS - 1000);
      expect(await sessions.expireDueMatches()).toBe(0);

      t.clock.advance(1001);
      expect(await sessions.expireDueMatches()).toBe(1);
      const view = await getMatch(match.second, match.matchId);
      expect(view).toMatchObject({ status: 'FINISHED', result: { reason: 'TIMEOUT' } });
      expect(view.result?.seats).toEqual([
        { seat: 0, outcome: 'LOSS' },
        { seat: 1, outcome: 'WIN' },
      ]);
      // Sin revancha, la sala se cierra al terminar (regla 7.31).
      expect(await getRoom(match.owner, match.roomId)).toMatchObject({
        status: 'CLOSED',
        closeReason: 'MATCH_ENDED',
      });
    });

    it('con revancha, la sala vuelve a la espera y la siguiente partida espera a los dos', async () => {
      const match = await startByTurns(true);
      // Cuatro en vertical en la columna 0 para quien empieza.
      const final = await play(match, [0, 1, 0, 1, 0, 1, 0]);
      expect(final.status).toBe('FINISHED');

      const room = await getRoom(match.owner, match.roomId);
      expect(room).toMatchObject({ status: 'WAITING', currentMatchId: null });

      await match.owner.put(`/rooms/${match.roomId}/members/me/ready`, { ready: true });
      expect((await getRoom(match.owner, match.roomId)).status).toBe('WAITING');
      const ready = await match.guest.put(`/rooms/${match.roomId}/members/me/ready`, {
        ready: true,
      });
      expect((ready.body.data as RoomView).status).toBe('IN_MATCH');
    });
  });

  // --- Anulación -----------------------------------------------------------

  describe('anulación por fallo', () => {
    it('si el motor no reconoce el estado guardado, la partida se anula sin resultado', async () => {
      const match = await startMatch(t);
      await drop(match.first, match.matchId, 3, 0);
      await query(`update game_sessions set state = '{"roto": true}' where match_id = $1`, [
        match.matchId,
      ]);
      events = [];

      await expect(drop(match.second, match.matchId, 3, 1)).rejects.toMatchObject({
        code: 'MATCH_NOT_IN_PROGRESS',
      });

      expect(await query('select status, abort_reason from matches')).toEqual([
        { status: 'ABORTED', abort_reason: 'FAILURE' },
      ]);
      expect(await query('select match_id from match_results')).toEqual([]);
      expect(await query('select match_id from player_results')).toEqual([]);
      expect(await sessionRow(match.matchId)).toMatchObject({ status: 'CLOSED', state_version: 1 });
      expect((await getRoom(match.owner, match.roomId)).status).toBe('WAITING');
      expect(matchChanges()).toHaveLength(1);
      expect(matchChanges()[0]).toMatchObject({
        origin: null,
        snapshot: { status: 'ABORTED', abortReason: 'FAILURE', result: null },
      });

      const view = await getMatch(match.first, match.matchId);
      expect(view).toMatchObject({ status: 'ABORTED', abortReason: 'FAILURE', result: null });
      expect(view.view).toBeNull();
    });

    // ADR-014, K21; catálogo de errores, sección 9 (análisis del 2026-11-19, T-04).
    it('si el motor dice que el juego ya terminó, la jugada se rechaza y no se guarda nada', async () => {
      const match = await startMatch(t);
      vi.spyOn(fourInARowEngine, 'applyAction').mockReturnValueOnce({
        ok: false,
        code: 'GAME_ALREADY_FINISHED',
      });
      events = [];

      await expect(drop(match.first, match.matchId, 3, 0)).rejects.toMatchObject({
        code: 'MATCH_NOT_IN_PROGRESS',
      });

      expect(await sessionRow(match.matchId)).toMatchObject({ status: 'ACTIVE', state_version: 0 });
      expect(await query('select status from matches')).toEqual([{ status: 'IN_PROGRESS' }]);
      expect(await query('select sequence from match_actions')).toEqual([]);
      expect(events).toEqual([]);
    });

    it('si el motor responde INVALID_SETTINGS a una jugada, se anula como un estado que no reconoce', async () => {
      const match = await startMatch(t);
      vi.spyOn(fourInARowEngine, 'applyAction').mockReturnValueOnce({
        ok: false,
        code: 'INVALID_SETTINGS',
      });

      await expect(drop(match.first, match.matchId, 3, 0)).rejects.toMatchObject({
        code: 'MATCH_NOT_IN_PROGRESS',
      });

      expect(await query('select status, abort_reason from matches')).toEqual([
        { status: 'ABORTED', abort_reason: 'FAILURE' },
      ]);
      expect(await query('select match_id from match_results')).toEqual([]);
    });

    it('también se anula si el fallo se descubre al vencer el reloj', async () => {
      const match = await startMatch(t);
      await query(`update game_sessions set state = '[]' where match_id = $1`, [match.matchId]);
      t.clock.advance(5 * MINUTE_MS + 1);

      expect(await sessions.expireIfDue(match.matchId)).toBe(true);

      expect(await query('select status, abort_reason from matches')).toEqual([
        { status: 'ABORTED', abort_reason: 'FAILURE' },
      ]);
    });
  });

  // --- Mis partidas --------------------------------------------------------

  describe('mis partidas', () => {
    it('por defecto lista las partidas en curso y dice a quién le toca', async () => {
      const match = await startMatch(t);

      const first = await listMatches(match.first);
      const second = await listMatches(match.second);

      expect(first.nextCursor).toBeNull();
      expect(first.items).toHaveLength(1);
      expect(first.items[0]).toMatchObject({
        matchId: match.matchId,
        roomId: match.roomId,
        gameSlug: 'four-in-a-row',
        mode: 'REALTIME',
        status: 'IN_PROGRESS',
        yourTurn: true,
        opponents: [{ playerId: match.second.playerId }],
        yourOutcome: null,
        endReason: null,
        endedAt: null,
      });
      expect(first.items[0]?.turnDeadlineAt).not.toBeNull();
      expect(second.items[0]).toMatchObject({
        yourTurn: false,
        opponents: [{ playerId: match.first.playerId }],
      });
    });

    it('el historial lista las partidas terminadas, con el resultado propio', async () => {
      const match = await startMatch(t);
      await play(match, FIRST_WINS);

      const first = await listMatches(match.first, '?status=FINISHED');
      const second = await listMatches(match.second, '?status=FINISHED');

      expect(first.items).toHaveLength(1);
      expect(first.items[0]).toMatchObject({
        matchId: match.matchId,
        status: 'FINISHED',
        yourTurn: false,
        turnDeadlineAt: null,
        yourOutcome: 'WIN',
        endReason: 'COMPLETED',
      });
      expect(first.items[0]?.endedAt).not.toBeNull();
      expect(second.items[0]).toMatchObject({ yourOutcome: 'LOSS', endReason: 'COMPLETED' });
      // Ya no está entre las partidas en curso.
      expect((await listMatches(match.first)).items).toEqual([]);
    });

    it('cada jugador ve solo sus partidas', async () => {
      await startMatch(t);
      const outsider = await signUp(t);

      expect((await listMatches(outsider)).items).toEqual([]);
      expect((await listMatches(outsider, '?status=FINISHED')).items).toEqual([]);
    });

    it('pagina el historial de la más reciente a la más antigua', async () => {
      const match = await startMatch(t);
      const matchIds = [match.matchId];
      await sessions.resign(match.first.playerId, match.matchId, randomUUID());
      for (let extra = 0; extra < 2; extra += 1) {
        t.clock.advance(MINUTE_MS);
        const rematch = await startMatchIn(match.roomId, match.owner, match.guest);
        matchIds.push(rematch.matchId);
        await sessions.resign(rematch.first.playerId, rematch.matchId, randomUUID());
      }

      const firstPage = await listMatches(match.owner, '?status=FINISHED&limit=2');
      expect(firstPage.items.map((item) => item.matchId)).toEqual([matchIds[2], matchIds[1]]);
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await listMatches(
        match.owner,
        `?status=FINISHED&limit=2&cursor=${firstPage.nextCursor}`,
      );
      expect(secondPage.items.map((item) => item.matchId)).toEqual([matchIds[0]]);
      expect(secondPage.nextCursor).toBeNull();
    });

    it('filtra por juego', async () => {
      const match = await startMatch(t);
      await sessions.resign(match.first.playerId, match.matchId, randomUUID());

      const same = await listMatches(match.owner, '?status=FINISHED&gameSlug=four-in-a-row');
      const other = await listMatches(match.owner, '?status=FINISHED&gameSlug=counter');
      const unknown = await listMatches(match.owner, '?status=FINISHED&gameSlug=no-existe');

      expect(same.items).toHaveLength(1);
      expect(other.items).toEqual([]);
      expect(unknown.items).toEqual([]);
    });

    it('lista aparte las partidas anuladas', async () => {
      const match = await startMatch(t);
      await query(`update game_sessions set state = '[]' where match_id = $1`, [match.matchId]);
      await expect(drop(match.first, match.matchId, 3, 0)).rejects.toThrow();

      const aborted = await listMatches(match.first, '?status=ABORTED');

      expect(aborted.items).toHaveLength(1);
      expect(aborted.items[0]).toMatchObject({
        status: 'ABORTED',
        yourTurn: false,
        yourOutcome: null,
        endReason: null,
      });
      expect((await listMatches(match.first, '?status=FINISHED')).items).toEqual([]);
    });

    it('rechaza los parámetros que no son válidos', async () => {
      const player = await signUp(t);

      for (const params of ['?status=OTRO', '?limit=0', '?limit=51', '?cursor=no-es-un-cursor']) {
        const response = await player.get(`/me/matches${params}`);
        expect(response.status, params).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expectMatchesContract('GET', '/me/matches', response);
      }
    });

    it('exige sesión', async () => {
      const response = await t.request().get(`${API}/me/matches`);

      expect(response.status).toBe(401);
      expectMatchesContract('GET', '/me/matches', response);
    });
  });
});
