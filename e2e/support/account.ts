import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { type APIRequestContext, type Browser, expect, type Page, request } from '@playwright/test';
import type { Player } from './app.ts';
import {
  API_ORIGIN,
  BACKEND_DIR,
  DATABASE_URL,
  FRONTEND_ORIGIN,
  MAIL_OUTBOX_DIR,
} from './settings.mjs';

/** El correo con el que `signUp` registra a cada persona. */
export function emailOf(player: Player): string {
  return `${player.name}@example.test`;
}

/** Abre otro navegador para la misma persona e inicia sesión en él. Llega a la portada. */
export async function signInElsewhere(
  browser: Browser,
  player: Player,
  password = player.password,
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto('/entrar');
  await page.getByLabel('Nombre de usuario').fill(player.name);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByText('Hola, ')).toBeVisible();
  return page;
}

/**
 * El enlace de recuperación del último correo simulado enviado a ese
 * correo (ADR-017, U6). El correo sale después de responder, así que lo
 * espera un poco.
 */
export async function resetLinkFor(email: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const files = (await readdir(MAIL_OUTBOX_DIR).catch(() => [] as string[])).sort();
        for (const file of files.reverse()) {
          const mail = await readFile(join(MAIL_OUTBOX_DIR, file), 'utf8');
          if (!mail.startsWith(`Para: ${email}\n`)) continue;
          link = /(http\S+\/recuperar-contrasena#token=\S+)/.exec(mail)?.[1];
          return link;
        }
        return undefined;
      },
      { message: `No llegó el correo de recuperación para ${email}` },
    )
    .toBeDefined();
  return link ?? '';
}

/** Concede el rol de administrador con la orden de consola, como se hace de verdad (ADR-017, U3). */
export function grantAdmin(username: string): void {
  const script = resolve(BACKEND_DIR, 'dist/scripts/admin-role.js');
  const result = spawnSync(process.execPath, [script, username, 'ADMIN'], {
    env: { ...process.env, DATABASE_URL, FRONTEND_ORIGIN },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`No se pudo conceder el rol: ${result.stderr || result.stdout}`);
  }
}

/**
 * Un administrador que usa la API directamente, sin navegador, como con
 * `curl` en la guía de administración (ADR-017, U2): guarda la cookie y
 * envía la cabecera `Origin` del frontend.
 */
export async function adminApi(admin: Player): Promise<APIRequestContext> {
  const api = await request.newContext({
    baseURL: `${API_ORIGIN}/api/v1/`,
    extraHTTPHeaders: { Origin: FRONTEND_ORIGIN },
  });
  const login = await api.post('auth/login', {
    data: { username: admin.name, password: admin.password },
  });
  expect(login.status()).toBe(200);
  return api;
}
