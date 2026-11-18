/**
 * Service worker de la aplicación instalable (ADR-016, decisión N4).
 *
 * Solo hace dos cosas:
 * - Guarda al instalarse la aplicación misma: la portada, la entrada de la
 *   aplicación (`200.html`), todos los archivos de `/_nuxt/`, que llevan su
 *   huella en el nombre, y los iconos. Así abre aunque no haya red, y muestra el aviso
 *   de conexión perdida en lugar de la página de error del navegador.
 * - Pide las páginas primero a la red, para que una versión nueva se vea en
 *   la siguiente visita.
 *
 * No toca nada de otro origen, como la API y el canal de tiempo real: lo
 * que se ve de una partida viene siempre del servidor (regla 7.28).
 *
 * Al construir, `BUILD` se sustituye por una huella de los archivos de la
 * aplicación y `ASSETS`, por la lista de los de `/_nuxt/`. Cada versión
 * guarda lo suyo y, al activarse, borra lo de las anteriores.
 */
const BUILD = '__BUILD__';
const ASSETS = [/* __ASSETS__ */];
const CACHE = `gameboard-${BUILD}`;
const SHELL = '/200.html';
const PRECACHE = [
  '/',
  SHELL,
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  ...ASSETS,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Primero la red. Sin red, la portada guardada o, para cualquier otra
 * página, la entrada de la aplicación, que es lo que sirve el alojamiento
 * para todas ellas. Las dos se guardaron al instalar esta versión.
 */
async function page(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(CACHE);
    const saved = (await cache.match(request)) ?? (await cache.match(SHELL));
    if (saved) return saved;
    throw error;
  }
}

/** Lo guardado primero: un archivo con huella en el nombre no cambia nunca. */
async function asset(request) {
  const cache = await caches.open(CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/** Los archivos que no cambian sin cambiar de nombre. `builds/` dice qué versión está publicada. */
function isAsset(pathname) {
  if (pathname.startsWith('/_nuxt/builds/')) return false;
  return pathname.startsWith('/_nuxt/') || pathname.startsWith('/icons/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // La API y el canal de tiempo real están en otro origen: no se tocan.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(page(request));
  } else if (isAsset(url.pathname)) {
    event.respondWith(asset(request));
  }
});
