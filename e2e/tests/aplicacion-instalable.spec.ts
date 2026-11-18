import { expect, test } from '@playwright/test';
import { FRONTEND_ORIGIN } from '../support/settings.mjs';

/**
 * La aplicación instalable (ADR-016, decisiones N4 y N6). Playwright no
 * puede pulsar "Instalar", así que se comprueba lo que el navegador pide
 * para ofrecerlo: el manifiesto con sus iconos y el service worker activo.
 * La instalación de verdad se comprueba a mano.
 */

interface Manifest {
  readonly name: string;
  readonly short_name: string;
  readonly start_url: string;
  readonly display: string;
  readonly icons: readonly { src: string; sizes: string; purpose?: string }[];
}

test('el manifiesto se sirve con lo que pide el navegador para instalar', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');

  const response = await page.request.get(href as string);
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/manifest+json');
  const manifest = (await response.json()) as Manifest;
  expect(manifest).toMatchObject({
    name: 'Juegos de Mesa en Línea',
    short_name: 'Juegos de Mesa',
    start_url: '/',
    display: 'standalone',
  });

  const sizes = manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose ?? 'any'}`);
  expect(sizes).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']));
  for (const icon of manifest.icons) {
    const image = await page.request.get(icon.src);
    expect(image.status(), icon.src).toBe(200);
  }
});

test('el service worker se activa y la aplicación abre sin red', async ({ page, context }) => {
  await page.goto('/');
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state ?? null),
    )
    .toBe('activated');
  // Al recargar, la página queda en manos del service worker.
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  // Sin red, la aplicación abre igual, desde lo guardado, en cualquiera de sus páginas.
  await context.route(`${FRONTEND_ORIGIN}/**`, (route) => route.abort('internetdisconnected'));
  await context.setOffline(true);
  await page.goto('/partidas');
  await expect(page.getByRole('link', { name: 'Juegos de Mesa en Línea' })).toBeVisible();
  await expect(page.getByText('No se pudo comprobar tu sesión.')).toBeVisible();
});
