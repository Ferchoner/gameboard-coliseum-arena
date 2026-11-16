import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API, createTestApp, FRONTEND_ORIGIN, newAccount, type TestApp } from './app.js';
import { expectMatchesContract } from './contract.js';
import { query, resetDatabase } from './database.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('cuentas y sesiones', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    t.clock.reset();
    await resetDatabase();
  });

  const post = (path: string, body?: object) =>
    t.request().post(`${API}${path}`).set('Origin', FRONTEND_ORIGIN).send(body);

  describe('registro', () => {
    it('crea la cuenta, el perfil y el jugador, e inicia la sesión', async () => {
      const account = newAccount({ email: 'Ana@Example.com', displayName: 'Ana' });

      const response = await post('/auth/register', account);

      expect(response.status).toBe(201);
      expectMatchesContract('POST', '/auth/register', response);
      expect(response.body.data).toMatchObject({
        email: 'ana@example.com',
        username: account.username,
        displayName: 'Ana',
        avatarUrl: null,
        biography: null,
        role: 'USER',
      });

      const [users, profiles, players, sessions] = await Promise.all([
        query('select * from users'),
        query('select * from profiles'),
        query('select * from players'),
        query('select * from auth_sessions'),
      ]);
      expect(users).toHaveLength(1);
      expect(profiles).toHaveLength(1);
      expect(players).toHaveLength(1);
      expect(sessions).toHaveLength(1);
      expect(players[0]).toMatchObject({
        id: response.body.data.playerId,
        user_id: response.body.data.userId,
      });
    });

    it('usa el nombre de usuario como nombre visible si no se indica otro', async () => {
      const account = newAccount();

      const response = await post('/auth/register', account);

      expect(response.body.data.displayName).toBe(account.username);
    });

    it('guarda la contraseña solo como hash de Argon2id', async () => {
      const account = newAccount();

      await post('/auth/register', account);

      const [user] = await query<{ password_hash: string }>('select password_hash from users');
      expect(user?.password_hash.startsWith('$argon2id$')).toBe(true);
      expect(user?.password_hash).not.toContain(account.password);
    });

    it('entrega la sesión en una cookie HttpOnly, SameSite=Lax y ligada solo al host de la API', async () => {
      const response = await post('/auth/register', newAccount());

      const cookies = response.get('Set-Cookie') ?? [];
      expect(cookies).toHaveLength(1);
      const cookie = cookies[0] ?? '';
      expect(cookie).toMatch(/^session=[A-Za-z0-9_-]{43};/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toMatch(/Domain=/i);
    });

    it('guarda el hash del identificador de sesión, no el identificador', async () => {
      const response = await post('/auth/register', newAccount());

      const token = /^session=([^;]+)/.exec(response.get('Set-Cookie')?.[0] ?? '')?.[1];
      const [session] = await query<{ token_hash: string }>('select token_hash from auth_sessions');
      expect(token).toBeDefined();
      expect(session?.token_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(session?.token_hash).not.toBe(token);
    });

    it('rechaza un correo ya usado, sin distinguir mayúsculas', async () => {
      const account = newAccount();
      await post('/auth/register', account);

      const response = await post(
        '/auth/register',
        newAccount({ email: account.email.toUpperCase() }),
      );

      expect(response.status).toBe(409);
      expectMatchesContract('POST', '/auth/register', response);
      expect(response.body.error.code).toBe('EMAIL_TAKEN');
    });

    it('rechaza un nombre de usuario ya usado, sin distinguir mayúsculas', async () => {
      const account = newAccount();
      await post('/auth/register', account);

      const response = await post(
        '/auth/register',
        newAccount({ username: account.username.toUpperCase() }),
      );

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('USERNAME_TAKEN');
      expect(await query('select 1 from users')).toHaveLength(1);
    });

    it('si dos personas se registran a la vez con el mismo nombre, solo una lo consigue', async () => {
      const first = newAccount({ username: 'repetido' });
      const second = newAccount({ username: 'Repetido' });

      const responses = await Promise.all([
        post('/auth/register', first),
        post('/auth/register', second),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const rejected = responses.find((response) => response.status === 409);
      expect(rejected?.body.error.code).toBe('USERNAME_TAKEN');
      // La cuenta rechazada no deja nada a medias.
      expect(await query('select 1 from users')).toHaveLength(1);
      expect(await query('select 1 from profiles')).toHaveLength(1);
      expect(await query('select 1 from players')).toHaveLength(1);
      expect(await query('select 1 from auth_sessions')).toHaveLength(1);
    });

    it('indica qué campos fallan y por qué', async () => {
      const response = await post('/auth/register', {
        email: 'no-es-un-correo',
        username: 'ab',
        role: 'ADMIN',
      });

      expect(response.status).toBe(400);
      expectMatchesContract('POST', '/auth/register', response);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details.fields).toEqual([
        { field: 'email', rule: 'INVALID_FORMAT' },
        { field: 'username', rule: 'TOO_SHORT' },
        { field: 'password', rule: 'REQUIRED' },
        { field: 'role', rule: 'INVALID_FORMAT' },
      ]);
      expect(await query('select 1 from users')).toHaveLength(0);
    });

    it('no permite elegir el rol al registrarse', async () => {
      await post('/auth/register', newAccount({ role: 'ADMIN' }));

      expect(await query('select 1 from users')).toHaveLength(0);
    });

    it('aplica los límites de longitud de la contraseña', async () => {
      const short = await post('/auth/register', newAccount({ password: 'corta' }));
      const long = await post('/auth/register', newAccount({ password: 'x'.repeat(129) }));

      expect(short.body.error.details.fields).toEqual([{ field: 'password', rule: 'TOO_SHORT' }]);
      expect(long.body.error.details.fields).toEqual([{ field: 'password', rule: 'TOO_LONG' }]);
    });
  });

  describe('consulta de la cuenta propia', () => {
    it('devuelve la cuenta de quien tiene la sesión', async () => {
      const agent = t.agent();
      const account = newAccount();
      const registered = await agent
        .post(`${API}/auth/register`)
        .set('Origin', FRONTEND_ORIGIN)
        .send(account);

      const response = await agent.get(`${API}/me`);

      expect(response.status).toBe(200);
      expectMatchesContract('GET', '/me', response);
      expect(response.body.data).toEqual(registered.body.data);
    });

    it('sin sesión responde UNAUTHENTICATED', async () => {
      const response = await t.request().get(`${API}/me`);

      expect(response.status).toBe(401);
      expectMatchesContract('GET', '/me', response);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('no acepta una cookie inventada', async () => {
      const response = await t
        .request()
        .get(`${API}/me`)
        .set('Cookie', `session=${'a'.repeat(43)}`);

      expect(response.status).toBe(401);
    });

    it('nadie puede hacerse pasar por otro enviando su identificador', async () => {
      const ana = t.agent();
      const anaRegistered = await ana
        .post(`${API}/auth/register`)
        .set('Origin', FRONTEND_ORIGIN)
        .send(newAccount());
      const luis = t.agent();
      const luisRegistered = await luis
        .post(`${API}/auth/register`)
        .set('Origin', FRONTEND_ORIGIN)
        .send(newAccount());

      const response = await luis
        .get(`${API}/me`)
        .query({
          userId: anaRegistered.body.data.userId,
          playerId: anaRegistered.body.data.playerId,
        });

      expect(response.body.data.userId).toBe(luisRegistered.body.data.userId);
    });
  });

  describe('inicio de sesión', () => {
    it('inicia sesión con el nombre de usuario, sin distinguir mayúsculas', async () => {
      const account = newAccount();
      const registered = await post('/auth/register', account);

      const response = await post('/auth/login', {
        username: account.username.toUpperCase(),
        password: account.password,
      });

      expect(response.status).toBe(200);
      expectMatchesContract('POST', '/auth/login', response);
      expect(response.body.data).toEqual(registered.body.data);
      expect(response.get('Set-Cookie')?.[0]).toMatch(/^session=[A-Za-z0-9_-]{43};/);
    });

    it('responde lo mismo si falla la contraseña que si la cuenta no existe', async () => {
      const account = newAccount();
      await post('/auth/register', account);

      const wrongPassword = await post('/auth/login', {
        username: account.username,
        password: 'otra-clave-larga',
      });
      const unknownUser = await post('/auth/login', {
        username: 'no_existe',
        password: account.password,
      });

      expect(wrongPassword.status).toBe(401);
      expectMatchesContract('POST', '/auth/login', wrongPassword);
      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(unknownUser.status).toBe(401);
      expect(unknownUser.body).toEqual(wrongPassword.body);
      expect(wrongPassword.get('Set-Cookie')).toBeUndefined();
    });

    it('no admite iniciar sesión con el correo', async () => {
      const account = newAccount();
      await post('/auth/register', account);

      const response = await post('/auth/login', {
        username: account.email,
        password: account.password,
      });

      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('cada inicio de sesión estrena identificador', async () => {
      const account = newAccount();
      const registered = await post('/auth/register', account);
      const credentials = { username: account.username, password: account.password };

      const first = await post('/auth/login', credentials);
      const second = await post('/auth/login', credentials);

      const tokens = [registered, first, second].map((response) => response.get('Set-Cookie')?.[0]);
      expect(new Set(tokens).size).toBe(3);
      expect(await query('select 1 from auth_sessions')).toHaveLength(3);
    });

    it('al iniciar sesión con una sesión abierta en el mismo navegador, la anterior se cierra', async () => {
      const agent = t.agent();
      const account = newAccount();
      await agent.post(`${API}/auth/register`).set('Origin', FRONTEND_ORIGIN).send(account);

      await agent
        .post(`${API}/auth/login`)
        .set('Origin', FRONTEND_ORIGIN)
        .send({ username: account.username, password: account.password });

      expect(await query('select 1 from auth_sessions')).toHaveLength(1);
      expect((await agent.get(`${API}/me`)).status).toBe(200);
    });

    it('una cuenta suspendida no puede iniciar sesión, y solo se le dice a quien acierta la contraseña', async () => {
      const account = newAccount();
      await post('/auth/register', account);
      await query("update users set status = 'SUSPENDED'");

      const right = await post('/auth/login', {
        username: account.username,
        password: account.password,
      });
      const wrong = await post('/auth/login', {
        username: account.username,
        password: 'otra-clave-larga',
      });

      expect(right.status).toBe(403);
      expectMatchesContract('POST', '/auth/login', right);
      expect(right.body.error.code).toBe('ACCOUNT_SUSPENDED');
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('una sesión abierta deja de valer cuando la cuenta se suspende', async () => {
      const agent = t.agent();
      await agent.post(`${API}/auth/register`).set('Origin', FRONTEND_ORIGIN).send(newAccount());
      await query("update users set status = 'SUSPENDED'");

      const response = await agent.get(`${API}/me`);

      expect(response.status).toBe(401);
      expect(await query('select 1 from auth_sessions')).toHaveLength(0);
    });

    it('renueva el hash si se calculó con parámetros antiguos', async () => {
      const account = newAccount({ username: 'antigua' });
      await post('/auth/register', account);
      // Hash de "password" con parámetros distintos de los actuales.
      const oldHash = [
        '',
        'argon2id',
        'v=19',
        'm=65536,t=2,p=1',
        'c29tZXNhbHQ',
        'CTFhFdXPJO1aFaMaO6Mm5c8y7cJHAph8ArZWb2GRPPc',
      ].join('$');
      await query('update users set password_hash = $1', [oldHash]);

      const response = await post('/auth/login', { username: 'antigua', password: 'password' });

      expect(response.status).toBe(200);
      const [user] = await query<{ password_hash: string }>('select password_hash from users');
      expect(user?.password_hash).toContain('m=19456,t=2,p=1');
    });
  });

  describe('cierre de sesión', () => {
    it('cierra la sesión en el servidor y borra la cookie', async () => {
      const agent = t.agent();
      await agent.post(`${API}/auth/register`).set('Origin', FRONTEND_ORIGIN).send(newAccount());

      const response = await agent.post(`${API}/auth/logout`).set('Origin', FRONTEND_ORIGIN);

      expect(response.status).toBe(204);
      expectMatchesContract('POST', '/auth/logout', response);
      expect(response.get('Set-Cookie')?.[0]).toMatch(/^session=;.*Expires=Thu, 01 Jan 1970/);
      expect(await query('select 1 from auth_sessions')).toHaveLength(0);
      expect((await agent.get(`${API}/me`)).status).toBe(401);
    });

    it('la cookie de una sesión cerrada ya no sirve aunque alguien la conserve', async () => {
      const registered = await post('/auth/register', newAccount());
      const cookie = (registered.get('Set-Cookie')?.[0] ?? '').split(';')[0] ?? '';
      await t
        .request()
        .post(`${API}/auth/logout`)
        .set('Origin', FRONTEND_ORIGIN)
        .set('Cookie', cookie);

      const response = await t.request().get(`${API}/me`).set('Cookie', cookie);

      expect(response.status).toBe(401);
    });

    it('sin sesión responde igual', async () => {
      const response = await post('/auth/logout');

      expect(response.status).toBe(204);
    });
  });

  describe('caducidad de la sesión', () => {
    it('caduca tras 30 días sin uso', async () => {
      const agent = t.agent();
      await agent.post(`${API}/auth/register`).set('Origin', FRONTEND_ORIGIN).send(newAccount());

      t.clock.advance(30 * DAY_MS + 1000);
      const response = await agent.get(`${API}/me`);

      expect(response.status).toBe(401);
      expect(await query('select 1 from auth_sessions')).toHaveLength(0);
    });

    it('se renueva con el uso, pero nunca pasa de 90 días', async () => {
      const agent = t.agent();
      await agent.post(`${API}/auth/register`).set('Origin', FRONTEND_ORIGIN).send(newAccount());

      // Un uso cada 20 días mantiene viva la sesión más allá de los 30 días.
      for (let day = 20; day <= 80; day += 20) {
        t.clock.advance(20 * DAY_MS);
        expect((await agent.get(`${API}/me`)).status, `día ${day}`).toBe(200);
      }
      // El día 91 ya ha pasado el tope, aunque se haya usado hace poco.
      t.clock.advance(11 * DAY_MS);
      expect((await agent.get(`${API}/me`)).status).toBe(401);
    });
  });
});
