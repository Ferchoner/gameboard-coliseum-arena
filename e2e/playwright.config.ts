import process from 'node:process';
import { defineConfig, devices } from '@playwright/test';
import { API_ORIGIN, FRONTEND_ORIGIN } from './support/settings.mjs';

/**
 * Pruebas en navegador (ADR-014, decisión K8). Levantan la API compilada,
 * con su propia base de datos, y el frontend construido, y los usan con un
 * navegador de verdad. Antes hay que construir: `pnpm build`.
 *
 * Variables de entorno:
 * - `E2E_DATABASE_URL`: base de datos de estas pruebas. Se borra en cada ejecución.
 * - `E2E_CHROMIUM_PATH`: un Chromium ya instalado, para no descargar el de Playwright.
 */
const onCi = Boolean(process.env.CI);
const chromiumPath = process.env.E2E_CHROMIUM_PATH;

export default defineConfig({
  testDir: './tests',
  // Cada prueba crea sus propias cuentas, así que no se estorban.
  fullyParallel: true,
  forbidOnly: onCi,
  retries: onCi ? 1 : 0,
  ...(onCi ? { workers: 2 } : {}),
  // En GitHub, además, cada fallo queda anotado en la pull request.
  reporter: onCi ? [['list'], ['github']] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: FRONTEND_ORIGIN,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'node support/start-backend.mjs',
      url: `${API_ORIGIN}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node support/serve-frontend.mjs',
      url: FRONTEND_ORIGIN,
      reuseExistingServer: false,
    },
  ],
});
