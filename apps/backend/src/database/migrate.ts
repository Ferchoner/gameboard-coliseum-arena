import { runMigrations } from './migrations.js';

/** Orden de consola: aplica las migraciones pendientes. */
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('Falta la variable de entorno DATABASE_URL.');
  process.exit(1);
}

try {
  await runMigrations(databaseUrl);
  console.log('Migraciones aplicadas.');
} catch (error) {
  console.error('No se pudieron aplicar las migraciones.');
  console.error(error);
  process.exit(1);
}
