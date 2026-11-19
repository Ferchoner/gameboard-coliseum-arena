import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthCleanup } from '../src/modules/auth/auth-cleanup.js';
import { PasswordResetService } from '../src/modules/auth/password-reset.service.js';
import { API, createTestApp, FRONTEND_ORIGIN, newAccount, type TestApp } from './app.js';
import { expectMatchesContract } from './contract.js';
import { query, resetDatabase } from './database.js';
import { signUp, type TestPlayer } from './players.js';
import { TestSocket } from './realtime-client.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** La cuenta propia: perfil, contraseña y recuperación por correo (ADR-017). */
describe('cuenta propia', () => {
  let t: TestApp;
  let outbox: string;
  let server: string;

  beforeAll(async () => {
    outbox = await mkdtemp(join(tmpdir(), 'gameboard-correo-'));
    t = await createTestApp({ env: { MAIL_OUTBOX_DIR: outbox } });
    server = await t.listen();
  });
  afterAll(async () => {
    await t.close();
    await rm(outbox, { recursive: true, force: true });
  });
  beforeEach(async () => {
    t.clock.reset();
    await resetDatabase();
    await rm(outbox, { recursive: true, force: true });
  });

  const post = (path: string, body?: object) =>
    t.request().post(`${API}${path}`).set('Origin', FRONTEND_ORIGIN).send(body);

  /** Inicia otra sesión de la misma cuenta y devuelve su cookie. */
  async function logIn(username: string, password = 'una-clave-larga'): Promise<string> {
    const response = await post('/auth/login', { username, password });
    expect(response.status, response.text).toBe(200);
    const setCookie = response.headers['set-cookie'] as unknown as string[];
    return setCookie.map((value) => value.split(';')[0]).join('; ');
  }

  const meWith = (cookie: string) =>
    t.request().get(`${API}/me`).set('Cookie', cookie).set('Origin', FRONTEND_ORIGIN);

  /** Los correos simulados enviados, del más antiguo al más nuevo. */
  async function sentMail(): Promise<string[]> {
    await t.app.get(PasswordResetService).settle();
    const files = (await readdir(outbox).catch(() => [] as string[])).sort();
    return Promise.all(files.map((file) => readFile(join(outbox, file), 'utf8')));
  }

  function tokenIn(mail: string): string {
    const match = /\/recuperar-contrasena#token=([A-Za-z0-9_-]+)/.exec(mail);
    if (!match?.[1]) throw new Error(`El correo no lleva el enlace: ${mail}`);
    return match[1];
  }

  /** Pide el enlace para esa cuenta y devuelve el token del último correo. */
  async function requestToken(email: string): Promise<string> {
    const response = await post('/auth/password-reset/request', { email });
    expect(response.status).toBe(202);
    const mail = (await sentMail()).at(-1);
    if (!mail) throw new Error('No se envió ningún correo');
    return tokenIn(mail);
  }

  describe('cambiar el perfil', () => {
    let ana: TestPlayer;
    beforeEach(async () => {
      ana = await signUp(t, { displayName: 'Ana' });
    });

    it('cambia solo los campos enviados', async () => {
      const response = await ana.patch('/me', { biography: 'Juego por las tardes.' });

      expect(response.status, response.text).toBe(200);
      expectMatchesContract('PATCH', '/me', response);
      expect(response.body.data).toMatchObject({
        displayName: 'Ana',
        biography: 'Juego por las tardes.',
      });

      const renamed = await ana.patch('/me', { displayName: 'Ana María' });
      expect(renamed.body.data).toMatchObject({
        displayName: 'Ana María',
        biography: 'Juego por las tardes.',
      });
      expect((await ana.get('/me')).body.data).toMatchObject({ displayName: 'Ana María' });
    });

    it('recorta los espacios y una biografía vacía queda sin biografía (U13)', async () => {
      await ana.patch('/me', { biography: 'Algo' });

      const response = await ana.patch('/me', { displayName: '  Ana  ', biography: '   ' });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ displayName: 'Ana', biography: null });
      expect((await ana.patch('/me', { biography: null })).body.data.biography).toBeNull();
    });

    it('no admite un nombre visible hecho solo de espacios', async () => {
      const response = await ana.patch('/me', { displayName: '   ' });

      expect(response.status).toBe(400);
      expectMatchesContract('PATCH', '/me', response);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.fields).toEqual([
        expect.objectContaining({ field: 'displayName' }),
      ]);
    });

    it('exige al menos un campo y no admite otros', async () => {
      const empty = await ana.patch('/me', {});
      expect(empty.status).toBe(400);
      expectMatchesContract('PATCH', '/me', empty);
      expect(empty.body.error.code).toBe('VALIDATION_ERROR');

      const other = await ana.patch('/me', { avatarUrl: 'https://example.com/a.png' });
      expect(other.status).toBe(400);
      expect(other.body.error.code).toBe('VALIDATION_ERROR');

      const tooLong = await ana.patch('/me', { displayName: 'x'.repeat(31) });
      expect(tooLong.status).toBe(400);
    });

    it('el registro también recorta el nombre visible (U13)', async () => {
      const response = await post('/auth/register', newAccount({ displayName: '  Bea ' }));

      expect(response.status).toBe(201);
      expect(response.body.data.displayName).toBe('Bea');
    });

    it('sin sesión responde UNAUTHENTICATED', async () => {
      const response = await t
        .request()
        .patch(`${API}/me`)
        .set('Origin', FRONTEND_ORIGIN)
        .send({ displayName: 'Nadie' });

      expect(response.status).toBe(401);
      expectMatchesContract('PATCH', '/me', response);
    });
  });

  describe('cambiar la contraseña', () => {
    it('cierra las demás sesiones y deja abierta la actual', async () => {
      const ana = await signUp(t);
      const other = await logIn(ana.me.username);
      const socket = await TestSocket.open(server, { cookie: other });

      const response = await ana.put('/me/password', {
        currentPassword: 'una-clave-larga',
        newPassword: 'otra-clave-larga',
      });

      expect(response.status, response.text).toBe(204);
      expectMatchesContract('PUT', '/me/password', response);
      expect((await ana.get('/me')).status).toBe(200);
      expect((await meWith(other)).status).toBe(401);
      expect((await socket.closed).code).toBe(4001);

      expect(
        (await post('/auth/login', { username: ana.me.username, password: 'una-clave-larga' }))
          .status,
      ).toBe(401);
      await logIn(ana.me.username, 'otra-clave-larga');
    });

    it('rechaza una contraseña actual incorrecta sin cambiar nada', async () => {
      const ana = await signUp(t);
      const other = await logIn(ana.me.username);

      const response = await ana.put('/me/password', {
        currentPassword: 'no-es-esta',
        newPassword: 'otra-clave-larga',
      });

      expect(response.status).toBe(400);
      expectMatchesContract('PUT', '/me/password', response);
      expect(response.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
      expect((await meWith(other)).status).toBe(200);
      await logIn(ana.me.username, 'una-clave-larga');
    });

    it('aplica los límites de la contraseña nueva', async () => {
      const ana = await signUp(t);

      const response = await ana.put('/me/password', {
        currentPassword: 'una-clave-larga',
        newPassword: 'corta',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('recuperar la contraseña', () => {
    it('envía un enlace que permite fijar una contraseña nueva y cierra todas las sesiones', async () => {
      const ana = await signUp(t, { email: 'ana@example.com', displayName: 'Ana' });
      const socket = await TestSocket.open(server, { cookie: ana.cookie });

      const requested = await post('/auth/password-reset/request', { email: 'ANA@example.com' });

      expect(requested.status).toBe(202);
      expectMatchesContract('POST', '/auth/password-reset/request', requested);
      const [mail] = await sentMail();
      expect(mail).toContain('Para: ana@example.com');
      expect(mail).toContain('Hola, Ana:');
      expect(mail).toContain(`${FRONTEND_ORIGIN}/recuperar-contrasena#token=`);
      const token = tokenIn(mail ?? '');

      // Solo se guarda el hash del token.
      const [stored] = await query<{ token_hash: string }>(
        'select token_hash from password_reset_tokens',
      );
      expect(stored?.token_hash).not.toContain(token);

      const confirmed = await post('/auth/password-reset/confirm', {
        token,
        newPassword: 'otra-clave-larga',
      });

      expect(confirmed.status, confirmed.text).toBe(204);
      expectMatchesContract('POST', '/auth/password-reset/confirm', confirmed);
      expect((await ana.get('/me')).status).toBe(401);
      expect((await socket.closed).code).toBe(4001);
      await logIn(ana.me.username, 'otra-clave-larga');
    });

    it('responde lo mismo si el correo no existe, y no envía nada', async () => {
      await signUp(t, { email: 'ana@example.com' });

      const response = await post('/auth/password-reset/request', { email: 'nadie@example.com' });

      expect(response.status).toBe(202);
      expect(response.text).toBe('');
      expect(await sentMail()).toEqual([]);
    });

    it('no envía nada a una cuenta suspendida (U7)', async () => {
      const ana = await signUp(t, { email: 'ana@example.com' });
      await query(`update users set status = 'SUSPENDED' where id = $1`, [ana.me.userId]);

      const response = await post('/auth/password-reset/request', { email: 'ana@example.com' });

      expect(response.status).toBe(202);
      expect(await sentMail()).toEqual([]);
    });

    it('el enlace solo sirve una vez', async () => {
      await signUp(t, { email: 'ana@example.com' });
      const token = await requestToken('ana@example.com');

      expect(
        (await post('/auth/password-reset/confirm', { token, newPassword: 'otra-clave-larga' }))
          .status,
      ).toBe(204);
      const again = await post('/auth/password-reset/confirm', {
        token,
        newPassword: 'tercera-clave',
      });

      expect(again.status).toBe(400);
      expectMatchesContract('POST', '/auth/password-reset/confirm', again);
      expect(again.body.error.code).toBe('INVALID_RESET_TOKEN');
    });

    it('el enlace caduca a la hora', async () => {
      const ana = await signUp(t, { email: 'ana@example.com' });
      const token = await requestToken('ana@example.com');

      t.clock.advance(HOUR_MS + 1);
      const response = await post('/auth/password-reset/confirm', {
        token,
        newPassword: 'otra-clave-larga',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_RESET_TOKEN');
      await logIn(ana.me.username, 'una-clave-larga');
    });

    it('pedir un enlace nuevo anula los anteriores', async () => {
      await signUp(t, { email: 'ana@example.com' });
      const first = await requestToken('ana@example.com');
      const second = await requestToken('ana@example.com');

      const old = await post('/auth/password-reset/confirm', {
        token: first,
        newPassword: 'otra-clave-larga',
      });
      expect(old.body.error.code).toBe('INVALID_RESET_TOKEN');
      expect(
        (
          await post('/auth/password-reset/confirm', {
            token: second,
            newPassword: 'otra-clave-larga',
          })
        ).status,
      ).toBe(204);
    });

    it('rechaza un token inventado y una contraseña que no cumple los límites', async () => {
      await signUp(t, { email: 'ana@example.com' });
      const token = await requestToken('ana@example.com');

      const invented = await post('/auth/password-reset/confirm', {
        token: 'x'.repeat(43),
        newPassword: 'otra-clave-larga',
      });
      expect(invented.body.error.code).toBe('INVALID_RESET_TOKEN');
      expect(
        (
          await post('/auth/password-reset/confirm', {
            token: 'corto',
            newPassword: 'otra-clave-larga',
          })
        ).body.error.code,
      ).toBe('INVALID_RESET_TOKEN');

      const short = await post('/auth/password-reset/confirm', { token, newPassword: 'corta' });
      expect(short.status).toBe(400);
      expect(short.body.error.code).toBe('VALIDATION_ERROR');
      // El enlace sigue sirviendo tras un intento rechazado.
      expect(
        (await post('/auth/password-reset/confirm', { token, newPassword: 'otra-clave-larga' }))
          .status,
      ).toBe(204);
    });

    it('valida el correo de la petición', async () => {
      const response = await post('/auth/password-reset/request', { email: 'no-es-un-correo' });

      expect(response.status).toBe(400);
      expectMatchesContract('POST', '/auth/password-reset/request', response);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('limpieza periódica (U14)', () => {
    it('borra las sesiones caducadas y los enlaces caducados o usados', async () => {
      const ana = await signUp(t, { email: 'ana@example.com' });
      await signUp(t, { email: 'bea@example.com' });
      const used = await requestToken('ana@example.com');
      await post('/auth/password-reset/confirm', { token: used, newPassword: 'otra-clave-larga' });
      await requestToken('bea@example.com');
      expect(await query('select * from password_reset_tokens')).toHaveLength(2);

      await t.app.get(AuthCleanup).run();
      // El usado se borra; el de Bea, todavía válido, se queda.
      expect(await query('select * from password_reset_tokens')).toHaveLength(1);
      // La sesión de Ana se cerró al recuperar la contraseña; la de Bea sigue.
      expect(await query('select * from auth_sessions')).toHaveLength(1);

      t.clock.advance(31 * DAY_MS);
      await t.app.get(AuthCleanup).run();

      expect(await query('select * from password_reset_tokens')).toHaveLength(0);
      expect(await query('select * from auth_sessions')).toHaveLength(0);
      expect((await ana.get('/me')).status).toBe(401);
    });
  });
});
