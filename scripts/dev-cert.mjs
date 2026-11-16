/**
 * Crea el certificado que usa el modo HTTPS del entorno local (`pnpm dev:https`).
 *
 * - Con `mkcert` instalado, el certificado lo firma una autoridad local en
 *   la que el navegador confía, y no hay avisos.
 * - Sin `mkcert`, se crea con `openssl` un certificado firmado por sí mismo.
 *   El navegador avisa la primera vez en cada uno de los dos orígenes.
 *
 * El certificado solo vale para `localhost` y se guarda en `.certs/`, fuera
 * del repositorio.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import process from 'node:process';
import { CERT_DIR, CERT_FILE, KEY_FILE } from './dev-paths.mjs';

const force = process.argv.includes('--force');

function has(command) {
  const result = spawnSync(command, ['-help'], { stdio: 'ignore' });
  return result.error === undefined;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\nNo se pudo crear el certificado con ${command}.`);
    process.exit(result.status ?? 1);
  }
}

if (existsSync(CERT_FILE) && existsSync(KEY_FILE) && !force) {
  console.log(`Ya hay un certificado en ${CERT_DIR}. Para crearlo de nuevo: pnpm dev:cert --force`);
  process.exit(0);
}

mkdirSync(CERT_DIR, { recursive: true });

if (has('mkcert')) {
  run('mkcert', ['-cert-file', CERT_FILE, '-key-file', KEY_FILE, 'localhost', '127.0.0.1', '::1']);
  console.log('\nCertificado creado con mkcert.');
  console.log('Si el navegador avisa de que no es de confianza, ejecuta una vez: mkcert -install');
} else if (has('openssl')) {
  run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'ec',
    '-pkeyopt',
    'ec_paramgen_curve:prime256v1',
    '-nodes',
    '-days',
    '365',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1',
    '-addext',
    'keyUsage=digitalSignature',
    '-addext',
    'extendedKeyUsage=serverAuth',
    '-keyout',
    KEY_FILE,
    '-out',
    CERT_FILE,
  ]);
  console.log('\nCertificado creado con openssl, firmado por sí mismo y válido un año.');
  console.log('El navegador no confía en él. Con `pnpm dev:https` en marcha, abre una vez cada');
  console.log('dirección y acepta el aviso en las dos:');
  console.log('  https://localhost:3443/health   (la API)');
  console.log('  https://localhost:3444          (el frontend)');
  console.log('Si no aceptas el de la API, el frontend no podrá hablar con ella.');
  console.log('Para evitar los avisos, instala mkcert y ejecuta: pnpm dev:cert --force');
} else {
  console.error('Hace falta mkcert (recomendado) u openssl para crear el certificado.');
  console.error('mkcert: https://github.com/FiloSottile/mkcert');
  process.exit(1);
}
