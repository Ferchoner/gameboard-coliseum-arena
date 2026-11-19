/**
 * Arranca la API para las pruebas en navegador: crea de cero su base de
 * datos, aplica las migraciones y levanta el servidor ya compilado.
 *
 * La API corre en un proceso aparte, para que una prueba pueda reiniciarla
 * de verdad a mitad de partida (ADR-015, decisión V6): `POST /restart` en
 * el puerto de control la apaga en orden, como un despliegue, espera
 * `downMs` milisegundos parada, la vuelve a arrancar y responde cuando ya
 * atiende peticiones.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import {
  ABANDON_SECONDS,
  API_ORIGIN,
  API_PORT,
  BACKEND_DIR,
  CONTROL_PORT,
  DATABASE_URL,
  DISCONNECT_GRACE_SECONDS,
  FRONTEND_ORIGIN,
  HEARTBEAT_SECONDS,
  MAIL_OUTBOX_DIR,
} from './settings.mjs';

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

// El correo de ejecuciones anteriores no debe confundir a las pruebas.
rmSync(MAIL_OUTBOX_DIR, { recursive: true, force: true });

const env = {
  ...process.env,
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
  MATCH_ABANDON_SECONDS: String(ABANDON_SECONDS),
  REALTIME_HEARTBEAT_SECONDS: String(HEARTBEAT_SECONDS),
  REALTIME_DISCONNECT_GRACE_SECONDS: String(DISCONNECT_GRACE_SECONDS),
  MAIL_OUTBOX_DIR,
  LOG_FORMAT: 'text',
  LOG_LEVEL: 'warn',
};

const migrated = spawnSync(process.execPath, [migrate], { stdio: 'inherit', env });
if (migrated.status !== 0) process.exit(migrated.status ?? 1);

// --- La API, en su propio proceso ----------------------------------------------

/** El proceso de la API, o `null` mientras está parada. */
let api = null;
/** Si la API se para porque se pidió, y no porque falló. */
let expectedExit = false;

function startApi() {
  expectedExit = false;
  api = spawn(process.execPath, [main], { stdio: 'inherit', env });
  api.once('exit', (code) => {
    api = null;
    // Si se cae sola, las pruebas no pueden seguir.
    if (!expectedExit) process.exit(code ?? 1);
  });
}

/** Apaga la API en orden, como un despliegue: le da tiempo a cerrar sus conexiones. */
async function stopApi() {
  const running = api;
  if (!running) return;
  expectedExit = true;
  const exited = new Promise((done) => running.once('exit', done));
  running.kill('SIGTERM');
  await exited;
}

async function waitUntilHealthy() {
  for (;;) {
    try {
      const response = await fetch(`${API_ORIGIN}/health`);
      if (response.ok) return;
    } catch {
      // Todavía no escucha.
    }
    await sleep(100);
  }
}

startApi();

// --- El puerto de control ------------------------------------------------------

let restarting = false;

const control = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${CONTROL_PORT}`);
  if (request.method !== 'POST' || url.pathname !== '/restart') {
    response.writeHead(404).end();
    return;
  }
  if (restarting) {
    response.writeHead(409).end('Ya se está reiniciando');
    return;
  }
  const downMs = Number(url.searchParams.get('downMs') ?? 0);
  restarting = true;
  (async () => {
    await stopApi();
    await sleep(downMs);
    startApi();
    await waitUntilHealthy();
  })().then(
    () => {
      restarting = false;
      response.writeHead(204).end();
    },
    (error) => {
      restarting = false;
      response.writeHead(500).end(String(error));
    },
  );
});
control.listen(CONTROL_PORT, 'localhost');

// Cuando Playwright termina, se apaga todo.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    control.close();
    stopApi().then(() => process.exit(0));
  });
}
