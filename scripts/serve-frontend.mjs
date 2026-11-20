/**
 * Sirve el frontend construido, que son archivos estáticos (ADR-006). Una
 * ruta sin archivo propio recibe `200.html`, la entrada de la aplicación,
 * que es lo que hace cualquier alojamiento de archivos estáticos.
 *
 * Lo usan las pruebas en navegador y `pnpm local` (ADR-021).
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { extname, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** Lo que deja `pnpm build` del frontend. */
export const FRONTEND_DIST = fileURLToPath(
  new URL('../apps/frontend/.output/public/', import.meta.url),
);

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

/**
 * Arranca el servidor. `tls`, si se da, es `{ certFile, keyFile }` y sirve
 * con HTTPS. Termina el proceso si el frontend no está construido.
 */
export function serveFrontend({ port, host = 'localhost', root = FRONTEND_DIST, tls = null }) {
  const base = resolve(root);
  const fallback = join(base, '200.html');
  if (!existsSync(fallback)) {
    console.error('Falta construir el frontend. Ejecuta antes: pnpm build');
    process.exit(1);
  }

  /** El archivo que corresponde a una ruta, o `null` si no hay ninguno. */
  function fileFor(pathname) {
    const path = resolve(base, `.${pathname}`);
    if (path !== base && !path.startsWith(base + sep)) return null;
    if (isFile(path)) return path;
    const index = join(path, 'index.html');
    if (isFile(index)) return index;
    // Un archivo de la aplicación que no existe es un fallo, no una página.
    return pathname.startsWith('/_nuxt/') ? null : fallback;
  }

  function handle(request, response) {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    let file;
    try {
      file = fileFor(decodeURIComponent(pathname));
    } catch {
      file = null;
    }
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(response);
  }

  const server = tls
    ? createHttpsServer(
        { cert: readFileSync(tls.certFile), key: readFileSync(tls.keyFile) },
        handle,
      )
    : createHttpServer(handle);
  return server.listen(port, host);
}
