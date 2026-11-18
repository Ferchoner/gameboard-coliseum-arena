/**
 * Dibuja los iconos PNG de la aplicación instalable a partir de sus SVG
 * (ADR-016, decisión N10). Se ejecuta a mano cuando cambia un SVG, y los
 * PNG se guardan en el repositorio. Usa el Chromium de las pruebas en
 * navegador, así que no añade dependencias:
 *
 *   pnpm icons
 *
 * `CHROMIUM_PATH` permite usar otro Chromium ya instalado.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'apps/frontend/public/icons');
const { chromium } = createRequire(join(root, 'e2e/package.json'))('@playwright/test');

/** Cada PNG, con el SVG del que sale y su tamaño. */
const OUTPUTS = [
  { svg: 'icon.svg', png: 'icon-192.png', size: 192 },
  { svg: 'icon.svg', png: 'icon-512.png', size: 512 },
  { svg: 'icon.svg', png: 'apple-touch-icon.png', size: 180 },
  { svg: 'icon-maskable.svg', png: 'icon-maskable-512.png', size: 512 },
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
try {
  for (const { svg, png, size } of OUTPUTS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const source = readFileSync(join(icons, svg), 'utf8');
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`,
    );
    await page.locator('svg').screenshot({ path: join(icons, png), omitBackground: true });
    await page.close();
    process.stdout.write(`${png} (${size} × ${size})\n`);
  }
} finally {
  await browser.close();
}
