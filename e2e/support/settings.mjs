/**
 * Dónde se levanta la aplicación para las pruebas en navegador.
 *
 * Los puertos son los de `pnpm dev`, porque el frontend construido lleva
 * dentro el origen de la API (`NUXT_PUBLIC_API_ORIGIN`, que por defecto es
 * `http://localhost:3000`). Por eso `pnpm dev` no puede estar en marcha
 * mientras corren. La base de datos es otra, propia de estas pruebas.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_PORT = 3000;
export const FRONTEND_PORT = 3001;
export const API_ORIGIN = `http://localhost:${API_PORT}`;
export const FRONTEND_ORIGIN = `http://localhost:${FRONTEND_PORT}`;

/**
 * Puerto del arranque de la API, al que una prueba pide reiniciarla
 * (ADR-015, decisión V6). Solo escucha en la máquina de las pruebas.
 */
export const CONTROL_PORT = 3010;
export const CONTROL_ORIGIN = `http://localhost:${CONTROL_PORT}`;

/**
 * Plazos acortados para no esperar minutos en las pruebas (ADR-015,
 * decisión V6): el abandono llega a los 10 segundos, el margen de
 * desconexión es de 1 y los latidos van cada 2.
 */
export const ABANDON_SECONDS = 10;
export const HEARTBEAT_SECONDS = 2;
export const DISCONNECT_GRACE_SECONDS = 1;

/** Base de datos de estas pruebas. Se borra y se crea de nuevo en cada ejecución. */
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://gameboard:gameboard@localhost:5432/gameboard_e2e';

export const BACKEND_DIR = fileURLToPath(new URL('../../apps/backend/', import.meta.url));

/**
 * Carpeta del correo simulado de la API de estas pruebas (ADR-017, U6).
 * Se vacía en cada ejecución. Las pruebas leen ahí el enlace de recuperación.
 */
export const MAIL_OUTBOX_DIR =
  process.env.E2E_MAIL_OUTBOX_DIR ?? join(tmpdir(), 'gameboard-e2e-mail');
/** Lo que deja `pnpm build` del frontend: archivos estáticos. */
export const FRONTEND_DIST = fileURLToPath(
  new URL('../../apps/frontend/.output/public/', import.meta.url),
);
