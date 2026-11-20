/**
 * Arranca el entorno local: la API y el frontend en dos puertos de
 * `localhost`, que son dos orígenes del mismo sitio, como en producción
 * (ADR-004 y ADR-012, decisión S14).
 *
 *   pnpm dev         HTTP:  API en http://localhost:3000,  frontend en http://localhost:3001
 *   pnpm dev:https   HTTPS: API en https://localhost:3443, frontend en https://localhost:3444
 *
 * Con `--dominio`, cada uno usa su propio nombre en lugar de `localhost`
 * (ADR-021): `pnpm dev:https --dominio` sirve la API en
 * https://api.boardgame-coliseum.test:3443 y el frontend en
 * https://app.boardgame-coliseum.test:3444. `--dominio=<nombre>` elige otro.
 *
 * El código es el mismo en los dos modos. Cambia solo la configuración: con
 * HTTPS la cookie de sesión lleva `Secure` y el prefijo `__Host-`.
 *
 * Una variable ya definida en el entorno, o en `apps/backend/.env`, manda
 * sobre la base de datos y el registro. Los puertos y orígenes los fija el modo.
 */
import process from 'node:process';
import { domainFrom, hostsFor, requireCertificateFor } from './dev-hosts.mjs';
import { CERT_FILE, KEY_FILE } from './dev-paths.mjs';
import { backendDefaults, prepare, run, stopOnSignals } from './dev-process.mjs';

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

let domain;
try {
  domain = domainFrom();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const hosts = hostsFor(domain);

const secure = mode.scheme === 'https';
if (secure) requireCertificateFor([hosts.api, hosts.frontend], domain);

const apiOrigin = `${mode.scheme}://${hosts.api}:${mode.apiPort}`;
const frontendOrigin = `${mode.scheme}://${hosts.frontend}:${mode.frontendPort}`;

const backendEnv = {
  ...backendDefaults(),
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
  // Sin él, Vite rechaza la recarga en caliente que llega con otro nombre (ADR-021).
  DEV_ALLOWED_HOST: hosts.frontend,
  DEV_TLS_CERT_FILE: secure ? CERT_FILE : '',
  DEV_TLS_KEY_FILE: secure ? KEY_FILE : '',
};

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

console.log(`\nAPI:      ${apiOrigin}  (salud: ${apiOrigin}/health)`);
console.log(`Frontend: ${frontendOrigin}`);
if (domain) {
  console.log(
    `Los dos nombres tienen que apuntar a este equipo en el archivo hosts (docs/guia-despliegue-local.md).`,
  );
}
console.log('Ctrl+C para detenerlo todo.\n');

// Cada paquete se vuelve a compilar al cambiar, y la API se reinicia con lo compilado.
run('motor', ['--filter', '@gameboard/game-engine', 'run', 'build:watch']);
run('contratos', ['--filter', '@gameboard/contracts', 'run', 'build:watch']);
run('backend', ['--filter', '@gameboard/backend', 'run', 'build:watch']);
run('api', ['--filter', '@gameboard/backend', 'run', 'start:watch'], backendEnv);
run('frontend', ['--filter', '@gameboard/frontend', 'run', 'dev'], frontendEnv);

stopOnSignals();
