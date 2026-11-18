import { defineNuxtPlugin } from '#imports';

/**
 * Registra el service worker de la aplicación instalable (ADR-016,
 * decisión N4). Solo en la aplicación construida: en desarrollo guardaría
 * archivos que cambian a cada momento.
 */
export default defineNuxtPlugin(() => {
  if (import.meta.dev || !('serviceWorker' in navigator)) return;

  const register = () => {
    // Si no se puede registrar, la aplicación funciona igual, solo que no se instala.
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
});
