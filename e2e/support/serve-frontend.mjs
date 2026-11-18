/**
 * Sirve el frontend construido, que son archivos estáticos (ADR-006). Una
 * ruta sin archivo propio recibe `200.html`, la entrada de la aplicación,
 * que es lo que hace cualquier alojamiento de archivos estáticos.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { FRONTEND_DIST, FRONTEND_PORT } from './settings.mjs';

const ROOT = resolve(FRONTEND_DIST);
const FALLBACK = join(ROOT, '200.html');
if (!existsSync(FALLBACK)) {
  console.error('Falta construir el frontend. Ejecuta antes: pnpm build');
  process.exit(1);
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const isFile = (path) => existsSync(path) && statSync(path).isFile();

/** El archivo que corresponde a una ruta, o `null` si no hay ninguno. */
function fileFor(pathname) {
  const path = resolve(ROOT, `.${pathname}`);
  if (path !== ROOT && !path.startsWith(ROOT + sep)) return null;
  if (isFile(path)) return path;
  const index = join(path, 'index.html');
  if (isFile(index)) return index;
  // Un archivo de la aplicación que no existe es un fallo, no una página.
  return pathname.startsWith('/_nuxt/') ? null : FALLBACK;
}

createServer((request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const file = fileFor(decodeURIComponent(pathname));
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(FRONTEND_PORT, 'localhost');
