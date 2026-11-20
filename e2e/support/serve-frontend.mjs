/**
 * Sirve el frontend construido para las pruebas en navegador, con el mismo
 * servidor de archivos estáticos que `pnpm local` (ADR-021).
 */
import { serveFrontend } from '../../scripts/serve-frontend.mjs';
import { FRONTEND_DIST, FRONTEND_PORT } from './settings.mjs';

serveFrontend({ port: FRONTEND_PORT, root: FRONTEND_DIST });
