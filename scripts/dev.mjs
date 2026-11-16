/**
 * Arranca el entorno local: la API y el frontend en dos puertos de
 * `localhost`, que son dos orígenes del mismo sitio, como en producción
 * (ADR-004 y ADR-012, decisión S14).
 *
 *   pnpm dev         HTTP:  API en http://localhost:3000,  frontend en http://localhost:3001
 *   pnpm dev:https   HTTPS: API en https://localhost:3443, frontend en https://localhost:3444
 *
 * El código es el mismo en los dos modos. Cambia solo la configuración: con
 * HTTPS la cookie de sesión lleva `Secure` y el prefijo `__Host-`.
 *
 * Una variable ya definida en el entorno, o en `apps/backend/.env`, manda
 * sobre la base de datos y el registro. Los puertos y orígenes los fija el modo.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { CERT_FILE, KEY_FILE, ROOT } from './dev-paths.mjs';

const MODES = {
  http: { scheme: 'http', apiPort: 3000, frontendPort: 3001 },
  https: { scheme: 'https', apiPort: 3443, frontendPort: 3444 },
};

const modeName = process.argv[2] ?? 'http';
const mode = MODES[modeName];
if (!mode) {
  console.error(`Modo desconocido: "${modeName}". Usa "http" o "https".`);
  process.exit(1);
}

const secure = mode.scheme === 'https';
if (secure && !(existsSync(CERT_FILE) && existsSync(KEY_FILE))) {
  console.error('Falta el certificado local. Créalo una vez con: pnpm dev:cert');
  process.exit(1);
}

const apiOrigin = `${mode.scheme}://localhost:${mode.apiPort}`;
const frontendOrigin = `${mode.scheme}://localhost:${mode.frontendPort}`;

// Sin `apps/backend/.env`, la base de datos es la de `docker-compose.yml` y el registro se lee como texto.
const defaults = existsSync(resolve(ROOT, 'apps/backend/.env'))
  ? {}
  : {
      DATABASE_URL: 'postgres://gameboard:gameboard@localhost:5432/gameboard',
      LOG_FORMAT: 'text',
    };

const backendEnv = {
  ...defaults,
  ...process.env,
  NODE_ENV: 'development',
  HOST: 'localhost',
  PORT: String(mode.apiPort),
  FRONTEND_ORIGIN: frontendOrigin,
  SESSION_COOKIE_SECURE: String(secure),
  TLS_CERT_FILE: secure ? CERT_FILE : '',
  TLS_KEY_FILE: secure ? KEY_FILE : '',
};

const frontendEnv = {
  ...process.env,
  PORT: String(mode.frontendPort),
  NUXT_PUBLIC_API_ORIGIN: apiOrigin,
  DEV_TLS_CERT_FILE: secure ? CERT_FILE : '',
  DEV_TLS_KEY_FILE: secure ? KEY_FILE : '',
};

// En Windows, pnpm es un archivo `.cmd` y necesita el intérprete de órdenes.
const shell = process.platform === 'win32';

/** Ejecuta un paso de preparación y se detiene si falla. */
function prepare(title, args, env = process.env) {
  console.log(`\n> ${title}`);
  const result = spawnSync('pnpm', args, { cwd: ROOT, env, stdio: 'inherit', shell });
  if (result.status !== 0) {
    console.error(`\nNo se pudo completar: ${title}.`);
    process.exit(result.status ?? 1);
  }
}

const SERVER_PACKAGES = ['@gameboard/game-engine', '@gameboard/contracts', '@gameboard/backend'];

prepare('Compilar los paquetes y el backend', [
  ...SERVER_PACKAGES.flatMap((name) => ['--filter', name]),
  '--workspace-concurrency=1',
  'run',
  'build',
]);
prepare(
  'Aplicar las migraciones de la base de datos (si falla, arráncala con: pnpm db:up)',
  ['--filter', '@gameboard/backend', 'run', 'db:migrate'],
  backendEnv,
);

const children = [];
let stopping = false;

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exitCode = code;
}

/** Arranca un proceso que sigue en marcha y antepone su nombre a cada línea que escribe. */
function run(label, args, env = process.env) {
  const child = spawn('pnpm', args, {
    cwd: ROOT,
    env: { ...env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell,
  });
  const prefix = `[${label}]`.padEnd(11);

  for (const stream of [child.stdout, child.stderr]) {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      const lines = (pending + chunk).split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) console.log(`${prefix}${line}`);
    });
    stream.on('end', () => {
      if (pending !== '') console.log(`${prefix}${pending}`);
    });
  }

  child.on('exit', (code) => {
    if (stopping) return;
    console.error(`\n${prefix}terminó de forma inesperada. Se detiene el entorno.`);
    stop(code ?? 1);
  });
  children.push(child);
}

console.log(`\nAPI:      ${apiOrigin}  (salud: ${apiOrigin}/health)`);
console.log(`Frontend: ${frontendOrigin}`);
console.log('Ctrl+C para detenerlo todo.\n');

// Cada paquete se vuelve a compilar al cambiar, y la API se reinicia con lo compilado.
run('motor', ['--filter', '@gameboard/game-engine', 'run', 'build:watch']);
run('contratos', ['--filter', '@gameboard/contracts', 'run', 'build:watch']);
run('backend', ['--filter', '@gameboard/backend', 'run', 'build:watch']);
run('api', ['--filter', '@gameboard/backend', 'run', 'start:watch'], backendEnv);
run('frontend', ['--filter', '@gameboard/frontend', 'run', 'dev'], frontendEnv);

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
