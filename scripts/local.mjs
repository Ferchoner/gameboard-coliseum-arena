/**
 * Despliegue local (ADR-021): arranca lo que se publicaría, no los
 * servidores de desarrollo. Construye todo, aplica las migraciones y
 * levanta la API compilada y el frontend como archivos estáticos.
 *
 *   pnpm local                     HTTP:  API en http://localhost:3000, frontend en http://localhost:3001
 *   pnpm local --https             HTTPS: API en https://localhost:3443, frontend en https://localhost:3444
 *   pnpm local --https --dominio   HTTPS con https://api.boardgame-coliseum.test:3443
 *                                  y https://app.boardgame-coliseum.test:3444
 *
 * Para entrar desde otras redes con un túnel (Tailscale Funnel, decisión
 * DL5), se dan los orígenes públicos en `LOCAL_FRONTEND_ORIGIN` y
 * `LOCAL_API_ORIGIN`. Los dos servidores escuchan entonces por HTTP en
 * 127.0.0.1 (3001 y 3000) y el túnel pone el HTTPS. La guía está en
 * `docs/guia-despliegue-local.md`.
 *
 * La API corre con `NODE_ENV=development` (decisión DL4): `production`
 * exige un correo real y activa HSTS, que el navegador recordaría.
 *
 * El frontend construido lleva dentro el origen de la API. Antes de
 * `pnpm test:e2e` hay que volver a construir con `pnpm build`.
 */
import process from 'node:process';
import { domainFrom, hostsFor, requireCertificateFor } from './dev-hosts.mjs';
import { CERT_FILE, KEY_FILE } from './dev-paths.mjs';
import {
  backendDefaults,
  onStop,
  prefixFor,
  prepare,
  run,
  stop,
  stopOnSignals,
} from './dev-process.mjs';
import { serveFrontend } from './serve-frontend.mjs';

function fail(message) {
  console.error(message);
  process.exit(1);
}

/** Un origen público: `https://nombre[:puerto]`, sin ruta. */
function publicOrigin(name, value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${name} no es una dirección válida: "${value}".`);
  }
  if (url.protocol !== 'https:' || url.origin !== value) {
    fail(
      `${name} tiene que ser un origen con HTTPS y sin ruta, como https://nombre.ejemplo: "${value}".`,
    );
  }
  return value;
}

/** Cómo se sirve: orígenes que ve el navegador, dónde escucha cada servidor y si hay TLS local. */
function settings() {
  const args = process.argv.slice(2);
  const known = ['--https', '--dominio'];
  const unknown = args.filter(
    (arg) => !known.some((option) => arg === option || arg.startsWith(`${option}=`)),
  );
  if (unknown.length > 0)
    fail(`Opción desconocida: ${unknown.join(' ')}. Usa --https y --dominio.`);

  let domain;
  try {
    domain = domainFrom(args);
  } catch (error) {
    fail(error.message);
  }
  const https = args.includes('--https');
  const publicFrontend = process.env.LOCAL_FRONTEND_ORIGIN;
  const publicApi = process.env.LOCAL_API_ORIGIN;

  if (publicFrontend || publicApi) {
    if (!(publicFrontend && publicApi)) {
      fail('LOCAL_FRONTEND_ORIGIN y LOCAL_API_ORIGIN van juntas: o las dos o ninguna.');
    }
    if (https || domain) {
      fail('Con un túnel, el HTTPS y el nombre los pone el túnel: no uses --https ni --dominio.');
    }
    return {
      frontendOrigin: publicOrigin('LOCAL_FRONTEND_ORIGIN', publicFrontend),
      apiOrigin: publicOrigin('LOCAL_API_ORIGIN', publicApi),
      // El túnel solo reenvía a http://127.0.0.1 (documentación de Tailscale Funnel).
      listenHost: '127.0.0.1',
      apiPort: 3000,
      frontendPort: 3001,
      secureCookie: true,
      tls: null,
      tunnel: true,
    };
  }

  const hosts = hostsFor(domain);
  if (https) requireCertificateFor([hosts.api, hosts.frontend], domain);
  const scheme = https ? 'https' : 'http';
  const apiPort = https ? 3443 : 3000;
  const frontendPort = https ? 3444 : 3001;
  return {
    frontendOrigin: `${scheme}://${hosts.frontend}:${frontendPort}`,
    apiOrigin: `${scheme}://${hosts.api}:${apiPort}`,
    listenHost: 'localhost',
    apiPort,
    frontendPort,
    secureCookie: https,
    tls: https ? { certFile: CERT_FILE, keyFile: KEY_FILE } : null,
    tunnel: false,
    domain,
  };
}

const config = settings();

const backendEnv = {
  ...backendDefaults(),
  ...process.env,
  NODE_ENV: 'development',
  HOST: config.listenHost,
  PORT: String(config.apiPort),
  FRONTEND_ORIGIN: config.frontendOrigin,
  SESSION_COOKIE_SECURE: String(config.secureCookie),
  TLS_CERT_FILE: config.tls?.certFile ?? '',
  TLS_KEY_FILE: config.tls?.keyFile ?? '',
};

prepare('Construir todo, con el frontend apuntando a ' + config.apiOrigin, ['build'], {
  ...process.env,
  NUXT_PUBLIC_API_ORIGIN: config.apiOrigin,
});
prepare(
  'Aplicar las migraciones de la base de datos (si falla, arráncala con: pnpm db:up)',
  ['--filter', '@gameboard/backend', 'run', 'db:migrate'],
  backendEnv,
);

console.log(`\nAPI:      ${config.apiOrigin}  (salud: ${config.apiOrigin}/health)`);
console.log(`Frontend: ${config.frontendOrigin}`);
if (config.tunnel) {
  console.log(
    `El túnel tiene que reenviar ${config.frontendOrigin} a http://127.0.0.1:${config.frontendPort}`,
  );
  console.log(`y ${config.apiOrigin} a http://127.0.0.1:${config.apiPort}.`);
} else if (config.domain) {
  console.log(
    'Los dos nombres tienen que apuntar a este equipo en el archivo hosts (docs/guia-despliegue-local.md).',
  );
}
console.log('Ctrl+C para detenerlo todo.\n');

run('api', ['--filter', '@gameboard/backend', 'run', 'start'], backendEnv);

const frontend = serveFrontend({
  port: config.frontendPort,
  host: config.listenHost,
  tls: config.tls,
});
const prefix = prefixFor('frontend');
frontend.on('listening', () =>
  console.log(`${prefix}Sirviendo lo construido en el puerto ${config.frontendPort}.`),
);
frontend.on('error', (error) => {
  console.error(`${prefix}No se pudo servir el frontend: ${error.message}`);
  stop(1);
});
onStop(() => {
  frontend.close();
  frontend.closeAllConnections();
});

stopOnSignals();
