import { runMigrations } from '../src/database/migrations.js';
import { resetContractReport, unseenResponses } from './contract.js';
import { resetDatabase, TEST_DATABASE_URL } from './database.js';

/**
 * Antes de la primera prueba, aplica las migraciones a la base de datos de
 * pruebas y la deja vacía. Así las pruebas no dependen de los datos que
 * dan de alta las migraciones, como los juegos del catálogo: cada una
 * siembra lo que necesita.
 */
export default async function setup(): Promise<() => void> {
  resetContractReport();
  try {
    await runMigrations(TEST_DATABASE_URL);
    await resetDatabase();
  } catch (error) {
    throw new Error(
      'No se pudo preparar la base de datos de pruebas. Comprueba que PostgreSQL está en marcha ' +
        `("pnpm db:up") y que existe la base de datos de TEST_DATABASE_URL (${TEST_DATABASE_URL}).`,
      { cause: error },
    );
  }

  // Al terminar, informa de las respuestas del contrato que ninguna prueba
  // vio. De momento no hace fallar nada (análisis del 2026-11-19, T-02).
  return () => {
    const unseen = unseenResponses();
    if (unseen.length === 0) return;
    process.stdout.write(
      `\nRespuestas del contrato que ninguna prueba vio (${unseen.length}):\n` +
        unseen.map((entry) => `  ${entry}\n`).join(''),
    );
  };
}
