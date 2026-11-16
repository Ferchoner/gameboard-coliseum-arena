/**
 * Dónde se levanta la aplicación para las pruebas en navegador.
 *
 * Los puertos son los de `pnpm dev`, porque el frontend construido lleva
 * dentro el origen de la API (`NUXT_PUBLIC_API_ORIGIN`, que por defecto es
 * `http://localhost:3000`). Por eso `pnpm dev` no puede estar en marcha
 * mientras corren. La base de datos es otra, propia de estas pruebas.
 */
import { fileURLToPath } from 'node:url';

export const API_PORT = 3000;
export const FRONTEND_PORT = 3001;
export const API_ORIGIN = `http://localhost:${API_PORT}`;
export const FRONTEND_ORIGIN = `http://localhost:${FRONTEND_PORT}`;

/** Base de datos de estas pruebas. Se borra y se crea de nuevo en cada ejecución. */
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://gameboard:gameboard@localhost:5432/gameboard_e2e';

export const BACKEND_DIR = fileURLToPath(new URL('../../apps/backend/', import.meta.url));
/** Lo que deja `pnpm build` del frontend: archivos estáticos. */
export const FRONTEND_DIST = fileURLToPath(
  new URL('../../apps/frontend/.output/public/', import.meta.url),
);
