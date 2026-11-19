import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameEngineRegistry, GAME_ENGINES } from '@gameboard/game-engine';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_FOLDER, runMigrations } from '../src/database/migrations.js';
import { query, TEST_DATABASE_URL } from './database.js';

/**
 * Las migraciones, aplicadas desde cero a una base de datos recién creada.
 * Las demás pruebas vacían las tablas, así que lo que las migraciones dan
 * de alta, como los juegos del catálogo, solo se ve aquí.
 */
describe('migraciones', () => {
  const name = `gameboard_migrations_${process.pid}`;
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;

  async function fresh<Row extends pg.QueryResultRow>(text: string): Promise<Row[]> {
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    try {
      return (await client.query<Row>(text)).rows;
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    await query(`drop database if exists ${name}`);
    await query(`create database ${name}`);
    await runMigrations(url.toString());
  });
  afterAll(async () => {
    await query(`drop database if exists ${name}`);
  });

  it('dan de alta Cuatro en raya con su versión vigente', async () => {
    const rows = await fresh(
      `select games.slug, games.name, games.status, game_versions.version,
              game_versions.status as version_status, game_versions.is_current
       from games join game_versions on game_versions.game_id = games.id`,
    );

    expect(rows).toEqual([
      {
        slug: 'four-in-a-row',
        name: 'Cuatro en raya',
        status: 'ACTIVE',
        version: '1.0.0',
        version_status: 'ACTIVE',
        is_current: true,
      },
    ]);
  });

  it('cada versión que dan de alta tiene su motor registrado', async () => {
    const registry = createGameEngineRegistry(GAME_ENGINES);
    const rows = await fresh<{ slug: string; version: string }>(
      `select games.slug, game_versions.version
       from games join game_versions on game_versions.game_id = games.id
       where game_versions.status = 'ACTIVE'`,
    );

    // Es lo mismo que comprueba el servidor al arrancar: si faltara un motor, no arrancaría.
    for (const { slug, version } of rows) {
      expect(registry.resolve(slug, version), `${slug}@${version}`).toBeDefined();
    }
  });

  it('aplicarlas otra vez no cambia nada', async () => {
    await runMigrations(url.toString());

    expect(await fresh('select slug from games')).toHaveLength(1);
  });
});

/**
 * Una base de datos con las migraciones anteriores a `migration` ya
 * aplicadas, para meter datos y comprobar después cómo los trata esa
 * migración al aplicarla con las siguientes.
 */
function migrationSandbox(migration: string, suffix: string) {
  const name = `gameboard_${suffix}_${process.pid}`;
  const url = new URL(TEST_DATABASE_URL);
  url.pathname = `/${name}`;
  let earlier = '';

  async function migrateFrom(folder: string): Promise<void> {
    const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
    try {
      await migrate(drizzle({ client: pool }), { migrationsFolder: folder });
    } finally {
      await pool.end();
    }
  }

  async function run<Row extends pg.QueryResultRow>(
    text: string,
    values: unknown[] = [],
  ): Promise<Row[]> {
    const client = new pg.Client({ connectionString: url.toString() });
    await client.connect();
    try {
      return (await client.query<Row>(text, values)).rows;
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    await query(`drop database if exists ${name}`);
    await query(`create database ${name}`);
    // Una copia de la carpeta de migraciones sin esa ni las siguientes.
    earlier = await mkdtemp(join(tmpdir(), 'gameboard-migraciones-'));
    for (const entry of await readdir(MIGRATIONS_FOLDER)) {
      if (entry >= migration) continue;
      await cp(join(MIGRATIONS_FOLDER, entry), join(earlier, entry), { recursive: true });
    }
  });
  afterAll(async () => {
    await query(`drop database if exists ${name}`);
    await rm(earlier, { recursive: true, force: true });
  });

  return {
    run,
    /** Aplica las migraciones anteriores a la que se prueba. */
    migrateEarlier: () => migrateFrom(earlier),
    /** Aplica todas las que faltan. */
    migrateAll: () => migrateFrom(MIGRATIONS_FOLDER),
  };
}

/**
 * La migración de las estadísticas las rellena con las partidas que ya
 * habían terminado (ADR-017, U8). Se comprueba aplicando primero todas las
 * anteriores, metiendo partidas y aplicando después las que faltan.
 */
describe('migración de las estadísticas', () => {
  const { run, migrateEarlier, migrateAll } = migrationSandbox(
    '20261119052221_estadisticas_y_recuperacion',
    'backfill',
  );

  it('cuenta las partidas terminadas de antes y no las anuladas', async () => {
    await migrateEarlier();
    expect(await run(`select to_regclass('game_statistics') as name`)).toEqual([{ name: null }]);

    const [found] = await run<{ id: string; game_id: string }>(
      `select game_versions.id, game_versions.game_id from game_versions
       join games on games.id = game_versions.game_id where games.slug = 'four-in-a-row'`,
    );
    if (!found) throw new Error('Falta Cuatro en raya');
    const version = found;
    const [ana, bea] = [randomUUID(), randomUUID()];
    for (const player of [ana, bea]) {
      await run(`insert into players (id, user_id, created_at) values ($1, null, now())`, [player]);
    }
    const roomId = randomUUID();
    await run(
      `insert into rooms (id, game_id, owner_player_id, mode, time_control, max_players,
         rematch_enabled, settings, status, created_at, last_activity_at)
       values ($1, $2, $3, 'REALTIME', '{}', 2, true, '{}', 'WAITING', now(), now())`,
      [roomId, version.game_id, ana],
    );

    /** Una partida de Ana contra Bea, con su resultado si terminó. */
    async function match(
      status: 'FINISHED' | 'ABORTED' | 'IN_PROGRESS',
      outcomes?: readonly [string, string],
    ): Promise<void> {
      const matchId = randomUUID();
      await run(
        `insert into matches (id, room_id, game_version_id, mode, time_control, status,
           abort_reason, started_at, ended_at)
         values ($1, $2, $3, 'REALTIME', '{}', $4, $5, now(), $6)`,
        [
          matchId,
          roomId,
          version.id,
          status,
          status === 'ABORTED' ? 'ADMIN' : null,
          status === 'IN_PROGRESS' ? null : new Date(),
        ],
      );
      await run(
        `insert into match_players (match_id, player_id, seat) values ($1, $2, 0), ($1, $3, 1)`,
        [matchId, ana, bea],
      );
      if (!outcomes) return;
      await run(
        `insert into match_results (match_id, reason, created_at) values ($1, 'COMPLETED', now())`,
        [matchId],
      );
      await run(
        `insert into player_results (match_id, player_id, outcome) values ($1, $2, $3), ($1, $4, $5)`,
        [matchId, ana, outcomes[0], bea, outcomes[1]],
      );
    }
    await match('FINISHED', ['WIN', 'LOSS']);
    await match('FINISHED', ['WIN', 'LOSS']);
    await match('FINISHED', ['DRAW', 'DRAW']);
    await match('FINISHED', ['LOSS', 'WIN']);
    await match('ABORTED');
    await match('IN_PROGRESS');

    await migrateAll();

    const rows = await run(
      `select player_id, game_id, played, wins, losses, draws from game_statistics
       order by wins desc`,
    );
    expect(rows).toEqual([
      { player_id: ana, game_id: version.game_id, played: 4, wins: 2, losses: 1, draws: 1 },
      { player_id: bea, game_id: version.game_id, played: 4, wins: 1, losses: 2, draws: 1 },
    ]);
  });
});

/**
 * La migración de la semilla, las opciones y las retiradas (ADR-018, Z1 y
 * Z2): las partidas anteriores reciben las opciones de su sala, y las que
 * terminaron por una retirada, la suya.
 */
describe('migración de la semilla, las opciones y las retiradas', () => {
  const { run, migrateEarlier, migrateAll } = migrationSandbox(
    '20261119171159_semilla_opciones_y_retiradas',
    'retirements',
  );

  it('rellena las opciones y una retirada por partida terminada por tiempo, rendición o abandono', async () => {
    await migrateEarlier();
    const [found] = await run<{ id: string; game_id: string }>(
      `select game_versions.id, game_versions.game_id from game_versions
       join games on games.id = game_versions.game_id where games.slug = 'four-in-a-row'`,
    );
    if (!found) throw new Error('Falta Cuatro en raya');
    const version = found;
    const [ana, bea] = [randomUUID(), randomUUID()];
    for (const player of [ana, bea]) {
      await run(`insert into players (id, user_id, created_at) values ($1, null, now())`, [player]);
    }
    const roomId = randomUUID();
    await run(
      `insert into rooms (id, game_id, owner_player_id, mode, time_control, max_players,
         rematch_enabled, settings, status, created_at, last_activity_at)
       values ($1, $2, $3, 'REALTIME', '{}', 2, true, '{"tablero": 7}', 'WAITING', now(), now())`,
      [roomId, version.game_id, ana],
    );

    /** Una partida de Ana contra Bea con `stateVersion` cambios; si terminó, Bea pierde. */
    async function match(reason: string | null, stateVersion: number): Promise<string> {
      const matchId = randomUUID();
      await run(
        `insert into matches (id, room_id, game_version_id, mode, time_control, status,
           abort_reason, started_at, ended_at)
         values ($1, $2, $3, 'REALTIME', '{}', $4, null, now(), $5)`,
        [
          matchId,
          roomId,
          version.id,
          reason ? 'FINISHED' : 'IN_PROGRESS',
          reason ? new Date() : null,
        ],
      );
      await run(
        `insert into match_players (match_id, player_id, seat) values ($1, $2, 0), ($1, $3, 1)`,
        [matchId, ana, bea],
      );
      await run(
        `insert into game_sessions (match_id, status, state, state_version, active_seats, clocks,
           turn_started_at, turn_deadline_at, created_at, updated_at)
         values ($1, $2, '{}', $3, '{}', '{}', now(), now(), now(), now())`,
        [matchId, reason ? 'CLOSED' : 'ACTIVE', stateVersion],
      );
      if (!reason) return matchId;
      await run(`insert into match_results (match_id, reason, created_at) values ($1, $2, now())`, [
        matchId,
        reason,
      ]);
      await run(
        `insert into player_results (match_id, player_id, outcome) values ($1, $2, 'WIN'), ($1, $3, 'LOSS')`,
        [matchId, ana, bea],
      );
      return matchId;
    }
    const resigned = await match('RESIGNATION', 5);
    const timedOut = await match('TIMEOUT', 8);
    await match('COMPLETED', 7);
    await match(null, 3);

    await migrateAll();

    expect(await run(`select distinct settings, seed from matches`)).toEqual([
      { settings: { tablero: 7 }, seed: null },
    ]);
    const rows = await run(
      `select match_id, sequence, player_id, reason from match_retirements order by sequence`,
    );
    expect(rows).toEqual([
      { match_id: resigned, sequence: 5, player_id: bea, reason: 'RESIGNATION' },
      { match_id: timedOut, sequence: 8, player_id: bea, reason: 'TIMEOUT' },
    ]);
  });
});

/**
 * La migración de las jugadas simultáneas (ADR-019, decisión X15): cada
 * sesión activa tiene su único asiento activo desde su versión actual; las
 * cerradas, ninguno.
 */
describe('migración de las jugadas simultáneas', () => {
  const { run, migrateEarlier, migrateAll } = migrationSandbox(
    '20261119184458_jugadas_simultaneas',
    'simultaneous',
  );

  it('rellena desde qué versión está activo cada asiento', async () => {
    await migrateEarlier();
    const [found] = await run<{ id: string; game_id: string }>(
      `select game_versions.id, game_versions.game_id from game_versions
       join games on games.id = game_versions.game_id where games.slug = 'four-in-a-row'`,
    );
    if (!found) throw new Error('Falta Cuatro en raya');
    const version = found;
    const [ana, bea] = [randomUUID(), randomUUID()];
    for (const player of [ana, bea]) {
      await run(`insert into players (id, user_id, created_at) values ($1, null, now())`, [player]);
    }
    const roomId = randomUUID();
    await run(
      `insert into rooms (id, game_id, owner_player_id, mode, time_control, max_players,
         rematch_enabled, settings, status, created_at, last_activity_at)
       values ($1, $2, $3, 'REALTIME', '{}', 2, true, '{}', 'WAITING', now(), now())`,
      [roomId, version.game_id, ana],
    );

    async function session(activeSeats: string, stateVersion: number): Promise<string> {
      const matchId = randomUUID();
      const active = activeSeats !== '{}';
      await run(
        `insert into matches (id, room_id, game_version_id, mode, time_control, status,
           abort_reason, started_at, ended_at, settings)
         values ($1, $2, $3, 'REALTIME', '{}', $4, null, now(), $5, '{}')`,
        [
          matchId,
          roomId,
          version.id,
          active ? 'IN_PROGRESS' : 'FINISHED',
          active ? null : new Date(),
        ],
      );
      await run(
        `insert into game_sessions (match_id, status, state, state_version, active_seats, clocks,
           turn_started_at, turn_deadline_at, created_at, updated_at)
         values ($1, $2, '{}', $3, $4, '{}', now(), now(), now(), now())`,
        [matchId, active ? 'ACTIVE' : 'CLOSED', stateVersion, activeSeats],
      );
      return matchId;
    }
    const playing = await session('{1}', 7);
    const closed = await session('{}', 12);

    await migrateAll();

    const rows = await run<{ match_id: string; active_since: unknown }>(
      `select match_id, active_since from game_sessions`,
    );
    expect(new Map(rows.map((row) => [row.match_id, row.active_since]))).toEqual(
      new Map([
        [playing, { '1': 7 }],
        [closed, {}],
      ]),
    );
  });
});
