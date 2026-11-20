/**
 * El frontend es una aplicación que se dibuja en el navegador y cuyas
 * páginas públicas se generan al construir (ADR-006). No hay servidor de
 * frontend: `nuxt generate` produce archivos estáticos.
 *
 * Variables de entorno:
 * - `NUXT_PUBLIC_API_ORIGIN`: origen de la API. Queda fijado al construir.
 * - `PORT`: puerto del servidor de desarrollo.
 * - `DEV_TLS_CERT_FILE` y `DEV_TLS_KEY_FILE`: certificado para servir el
 *   desarrollo con HTTPS (ADR-012, decisión S14).
 * - `DEV_ALLOWED_HOST`: nombre del frontend en desarrollo cuando no es
 *   `localhost` (ADR-021, DL1). Sin él, Vite rechaza la conexión de la
 *   recarga en caliente que llega con ese nombre.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const certFile = process.env.DEV_TLS_CERT_FILE;
const keyFile = process.env.DEV_TLS_KEY_FILE;
const allowedHost = process.env.DEV_ALLOWED_HOST;

/**
 * Escribe el service worker en lo construido, con la lista de los archivos
 * de la aplicación, para guardarlos al instalarse, y una huella de esa
 * lista como versión (ADR-016, decisión N4). Una construcción con los
 * mismos archivos da la misma versión.
 */
function writeServiceWorker(publicDir: string): void {
  const dir = join(publicDir, '_nuxt');
  const assets = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `/_nuxt/${relative(dir, join(entry.parentPath, entry.name))}`)
    // `builds/` dice qué versión está publicada: tiene que venir siempre de la red.
    .filter((path) => !path.startsWith('/_nuxt/builds/'))
    .sort();
  const build = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 16);
  const source = readFileSync(join(import.meta.dirname, 'service-worker/sw.js'), 'utf8');
  const list = assets.map((asset) => JSON.stringify(asset)).join(', ');
  writeFileSync(
    join(publicDir, 'sw.js'),
    source.replace('__BUILD__', build).replace('/* __ASSETS__ */', list),
  );
}

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  telemetry: false,
  devtools: { enabled: false },

  devServer: {
    host: 'localhost',
    port: Number(process.env.PORT ?? 3001),
    ...(certFile && keyFile ? { https: { cert: certFile, key: keyFile } } : {}),
  },

  runtimeConfig: {
    public: {
      apiOrigin: 'http://localhost:3000',
    },
  },

  routeRules: {
    // Todo se dibuja en el navegador, salvo las páginas públicas, que se generan al construir.
    '/**': { ssr: false },
    '/': { ssr: true, prerender: true },
  },

  // Las páginas generadas no llevan datos del servidor: todo dato se pide a la API en el navegador.
  experimental: { payloadExtraction: false },

  css: ['~/assets/css/main.css'],

  hooks: {
    'nitro:build:public-assets': (nitro) => writeServiceWorker(nitro.options.output.publicDir),
  },

  vite: {
    // Zod llega a través del paquete de contratos, que en desarrollo se usa enlazado.
    optimizeDeps: { include: ['@gameboard/contracts > zod'] },
    ...(allowedHost && allowedHost !== 'localhost'
      ? { server: { allowedHosts: [allowedHost] } }
      : {}),
  },

  app: {
    head: {
      htmlAttrs: { lang: 'es' },
      title: 'Juegos de Mesa en Línea',
      // Aplicación instalable (ADR-016, decisiones N4 y N11).
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', href: '/icons/icon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#2f5fd0' },
        {
          name: 'description',
          content:
            'Juega juegos de mesa en línea contra otras personas, en tiempo real o por turnos.',
        },
      ],
    },
  },

  typescript: {
    strict: true,
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
      },
    },
  },
});
