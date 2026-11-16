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
 */
const certFile = process.env.DEV_TLS_CERT_FILE;
const keyFile = process.env.DEV_TLS_KEY_FILE;

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

  vite: {
    // Zod llega a través del paquete de contratos, que en desarrollo se usa enlazado.
    optimizeDeps: { include: ['@gameboard/contracts > zod'] },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'es' },
      title: 'Juegos de Mesa en Línea',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
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
