/**
 * Arranca la API para las pruebas en navegador: crea de cero su base de
 * datos, aplica las migraciones y levanta el servidor ya compilado.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { API_PORT, BACKEND_DIR, DATABASE_URL, FRONTEND_ORIGIN } from './settings.mjs';

const migrate = resolve(BACKEND_DIR, 'dist/database/migrate.js');
const main = resolve(BACKEND_DIR, 'dist/main.js');
if (!existsSync(main)) {
  console.error('Falta compilar el backend. Ejecuta antes: pnpm build');
  process.exit(1);
}

// La base de datos se borra entera, así que solo se acepta una con nombre de pruebas.
const databaseName = decodeURIComponent(new URL(DATABASE_URL).pathname.slice(1));
if (!/^[a-z0-9_]+_e2e$/.test(databaseName)) {
  console.error(
    `La base de datos de las pruebas en navegador debe terminar en "_e2e": "${databaseName}".`,
  );
  process.exit(1);
}

const adminUrl = new URL(DATABASE_URL);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.href });
try {
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
} catch (error) {
  console.error('No se pudo preparar la base de datos. ¿Está en marcha? Prueba con: pnpm db:up');
  console.error(error);
  process.exit(1);
} finally {
  await admin.end();
}

Object.assign(process.env, {
  NODE_ENV: 'development',
  DATABASE_URL,
  HOST: 'localhost',
  PORT: String(API_PORT),
  FRONTEND_ORIGIN,
  SESSION_COOKIE_SECURE: 'false',
  TLS_CERT_FILE: '',
  TLS_KEY_FILE: '',
  // Las partidas con el reloj vencido se buscan cada segundo, para no esperar en la prueba.
  MATCH_CLOCK_CHECK_SECONDS: '1',
  LOG_FORMAT: 'text',
  LOG_LEVEL: 'warn',
});

const migrated = spawnSync(process.execPath, [migrate], { stdio: 'inherit' });
if (migrated.status !== 0) process.exit(migrated.status ?? 1);

await import(pathToFileURL(main).href);
