import pg from 'pg';

/**
 * Base de datos de las pruebas. Es distinta de la de desarrollo para que
 * ejecutar las pruebas no borre los datos con los que se trabaja.
 */
export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgres://gameboard:gameboard@localhost:5432/gameboard_test';

const TABLES = [
  'game_statistics',
  'password_reset_tokens',
  'server_liveness',
  'match_actions',
  'game_sessions',
  'player_results',
  'match_results',
  'match_players',
  'matches',
  'room_players',
  'rooms',
  'auth_sessions',
  'players',
  'profiles',
  'users',
  'game_versions',
  'games',
];

/** Deja vacías todas las tablas. */
export async function resetDatabase(): Promise<void> {
  await query(`truncate table ${TABLES.join(', ')} cascade`);
}

/** Ejecuta una consulta suelta contra la base de datos de pruebas. */
export async function query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<Row[]> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<Row>(text, values);
    return result.rows;
  } finally {
    await client.end();
  }
}
