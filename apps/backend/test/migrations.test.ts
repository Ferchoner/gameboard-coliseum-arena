import { createGameEngineRegistry, GAME_ENGINES } from '@gameboard/game-engine';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/database/migrations.js';
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
