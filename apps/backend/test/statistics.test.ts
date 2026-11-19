import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { RoomView } from '@gameboard/contracts';
import { fourInARowEngine } from '@gameboard/game-engine';
import { createFakeEngine } from '@gameboard/game-engine/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GameSessionsService } from '../src/modules/game-sessions/game-sessions.service.js';
import { API, createTestApp, FRONTEND_ORIGIN, type TestApp } from './app.js';
import { expectMatchesContract } from './contract.js';
import { query, resetDatabase } from './database.js';
import {
  FIVE_MINUTES,
  seedFourInARow,
  type StartedMatch,
  startMatch,
  startMatchIn,
  stateVersionOf,
} from './match-setup.js';
import { signUp } from './players.js';
import { seedGame } from './seed.js';

/** Un juego que termina en empate tras tres jugadas. */
const counterEngine = createFakeEngine('counter', '1.0.0');
const COUNTER = { gameSlug: 'counter', mode: 'REALTIME', timeControl: FIVE_MINUTES, maxPlayers: 2 };

/** Perfiles públicos y estadísticas por juego (ADR-017, U8 y U15). */
describe('jugadores', () => {
  let t: TestApp;
  let sessions: GameSessionsService;

  beforeAll(async () => {
    await resetDatabase();
    t = await createTestApp({ engines: [fourInARowEngine, counterEngine] });
    sessions = t.app.get(GameSessionsService);
  });
  afterAll(async () => {
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
  });

  /** Termina en empate una partida de Contador: tres jugadas, alternando asientos. */
  async function drawCounter(match: StartedMatch): Promise<void> {
    for (let turn = 0; turn < 3; turn += 1) {
      const stateVersion = await stateVersionOf(match.matchId);
      const player = turn % 2 === 0 ? match.first : match.second;
      await sessions.submitAction(player.playerId, match.matchId, randomUUID(), stateVersion, {
        type: 'INCREMENT',
      });
    }
  }

  describe('perfil público', () => {
    it('muestra el perfil por el nombre de usuario, sin distinguir mayúsculas', async () => {
      const ana = await signUp(t, { username: 'Ana_Lopez', displayName: 'Ana' });
      await ana.patch('/me', { biography: 'Me gustan los juegos de mesa.' });
      const bea = await signUp(t);

      const response = await bea.get('/players/ana_lopez');

      expect(response.status, response.text).toBe(200);
      expectMatchesContract('GET', '/players/{username}', response);
      expect(response.body.data).toEqual({
        playerId: ana.playerId,
        username: 'Ana_Lopez',
        displayName: 'Ana',
        avatarUrl: null,
        biography: 'Me gustan los juegos de mesa.',
      });
    });

    it('no existe un perfil con ese nombre: PLAYER_NOT_FOUND', async () => {
      const bea = await signUp(t);

      for (const path of ['/players/nadie', '/players/nadie/statistics']) {
        const response = await bea.get(path);
        expect(response.status).toBe(404);
        expectMatchesContract(
          'GET',
          path.endsWith('statistics') ? '/players/{username}/statistics' : '/players/{username}',
          response,
        );
        expect(response.body.error.code).toBe('PLAYER_NOT_FOUND');
      }
    });

    it('el perfil y las estadísticas de una cuenta suspendida no se muestran (U15)', async () => {
      const ana = await signUp(t, { username: 'ana' });
      const bea = await signUp(t);
      await query(`update users set status = 'SUSPENDED' where id = $1`, [ana.me.userId]);

      expect((await bea.get('/players/ana')).body.error.code).toBe('PLAYER_NOT_FOUND');
      expect((await bea.get('/players/ana/statistics')).body.error.code).toBe('PLAYER_NOT_FOUND');
    });

    it('sin sesión responde UNAUTHENTICATED', async () => {
      await signUp(t, { username: 'ana' });

      const response = await t.request().get(`${API}/players/ana`).set('Origin', FRONTEND_ORIGIN);

      expect(response.status).toBe(401);
      expectMatchesContract('GET', '/players/{username}', response);
    });
  });

  describe('estadísticas', () => {
    it('sin partidas terminadas, la lista está vacía', async () => {
      const ana = await signUp(t, { username: 'ana' });

      const response = await ana.get('/players/ana/statistics');

      expect(response.status).toBe(200);
      expectMatchesContract('GET', '/players/{username}/statistics', response);
      expect(response.body.data).toEqual({ items: [] });
    });

    it('cuentan cada partida terminada, por juego, al terminarla', async () => {
      const match = await startMatch(t);
      await sessions.resign(match.second.playerId, match.matchId, randomUUID());
      const rematch = await startMatchIn(match.roomId, match.owner, match.guest);
      await sessions.resign(rematch.second.playerId, rematch.matchId, randomUUID());

      // Solo se puede estar en una sala: se sale de la de Cuatro en raya, que se cierra.
      await match.owner.delete(`/rooms/${match.roomId}/members/me`);
      const created = await match.owner.post('/rooms', COUNTER);
      expect(created.status, created.text).toBe(201);
      const { roomId } = created.body.data as RoomView;
      await match.guest.put(`/rooms/${roomId}/members/me`);
      await drawCounter(await startMatchIn(roomId, match.owner, match.guest));

      const winsBoth = rematch.first.playerId === match.first.playerId;
      const response = await match.guest.get(`/players/${match.first.me.username}/statistics`);

      expect(response.status).toBe(200);
      expectMatchesContract('GET', '/players/{username}/statistics', response);
      expect(response.body.data.items).toEqual([
        { gameSlug: 'counter', played: 1, wins: 0, losses: 0, draws: 1 },
        {
          gameSlug: 'four-in-a-row',
          played: 2,
          wins: winsBoth ? 2 : 1,
          losses: winsBoth ? 0 : 1,
          draws: 0,
        },
      ]);
      const other = await match.first.get(`/players/${match.second.me.username}/statistics`);
      expect(other.body.data.items).toEqual([
        { gameSlug: 'counter', played: 1, wins: 0, losses: 0, draws: 1 },
        {
          gameSlug: 'four-in-a-row',
          played: 2,
          wins: winsBoth ? 0 : 1,
          losses: winsBoth ? 2 : 1,
          draws: 0,
        },
      ]);
    });

    it('una partida en curso no cuenta todavía', async () => {
      const match = await startMatch(t);

      const response = await match.first.get(`/players/${match.first.me.username}/statistics`);

      expect(response.body.data.items).toEqual([]);
    });
  });
});
