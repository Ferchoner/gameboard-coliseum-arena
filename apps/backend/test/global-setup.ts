import { runMigrations } from '../src/database/migrations.js';
import { TEST_DATABASE_URL } from './database.js';

/** Antes de la primera prueba, aplica las migraciones a la base de datos de pruebas. */
export default async function setup(): Promise<void> {
  try {
    await runMigrations(TEST_DATABASE_URL);
  } catch (error) {
    throw new Error(
      'No se pudo preparar la base de datos de pruebas. Comprueba que PostgreSQL está en marcha ' +
        `("pnpm db:up") y que existe la base de datos de TEST_DATABASE_URL (${TEST_DATABASE_URL}).`,
      { cause: error },
    );
  }
}
