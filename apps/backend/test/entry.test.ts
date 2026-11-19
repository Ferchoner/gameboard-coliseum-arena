import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API, createTestApp, FRONTEND_ORIGIN, newAccount, type TestApp } from './app.js';
import { expectErrorEnvelope } from './contract.js';
import { query, resetDatabase } from './database.js';

/**
 * Lo que toda petición atraviesa antes de llegar a una operación: el
 * identificador de petición, CORS, la comprobación de origen, el tamaño y
 * la forma del cuerpo, y los errores comunes del contrato.
 */
describe('entrada de la API', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDatabase());

  describe('identificador de petición', () => {
    it('toda respuesta lleva X-Request-Id, también las de error', async () => {
      const ok = await t.request().get(`${API}/games`);
      const missing = await t.request().get(`${API}/no-existe`);

      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      expect(ok.get('X-Request-Id')).toMatch(uuid);
      expect(missing.get('X-Request-Id')).toMatch(uuid);
      expect(ok.get('X-Request-Id')).not.toBe(missing.get('X-Request-Id'));
    });
  });

  describe('CORS', () => {
    it('admite el origen del frontend, con credenciales', async () => {
      const response = await t.request().get(`${API}/games`).set('Origin', FRONTEND_ORIGIN);

      expect(response.get('Access-Control-Allow-Origin')).toBe(FRONTEND_ORIGIN);
      expect(response.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(response.get('Access-Control-Expose-Headers')).toBe('X-Request-Id');
    });

    it('nunca responde con un comodín ni con el origen de quien pregunta', async () => {
      const response = await t.request().get(`${API}/games`).set('Origin', 'https://otro.example');

      expect(response.get('Access-Control-Allow-Origin')).toBe(FRONTEND_ORIGIN);
    });

    it('responde a la consulta previa del navegador', async () => {
      const response = await t
        .request()
        .options(`${API}/auth/login`)
        .set('Origin', FRONTEND_ORIGIN)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type');

      expect(response.status).toBe(204);
      expect(response.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    });
  });

  describe('comprobación de origen', () => {
    const login = () =>
      t.request().post(`${API}/auth/login`).send({ username: 'x', password: 'y' });

    it('rechaza con ORIGIN_NOT_ALLOWED una petición que cambia algo desde otro origen', async () => {
      const response = await login().set('Origin', 'https://otro.example');

      expect(response.status).toBe(403);
      expectErrorEnvelope(response);
      expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('la rechaza también si el navegador indica que viene de otro sitio', async () => {
      const response = await login()
        .set('Origin', 'https://otro.example')
        .set('Sec-Fetch-Site', 'cross-site');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('rechaza otro puerto del mismo host, que es otro origen', async () => {
      const response = await login()
        .set('Origin', 'http://localhost:9999')
        .set('Sec-Fetch-Site', 'same-site');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('admite la petición del frontend, que es otro origen del mismo sitio', async () => {
      const response = await login()
        .set('Origin', FRONTEND_ORIGIN)
        .set('Sec-Fetch-Site', 'same-site');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('una petición rechazada por su origen no llega a ejecutarse', async () => {
      const response = await t
        .request()
        .post(`${API}/auth/register`)
        .set('Origin', 'https://otro.example')
        .send(newAccount());

      expect(response.status).toBe(403);
      expect(await query('select 1 from users')).toHaveLength(0);
    });

    it('el origen se comprueba antes que la sesión', async () => {
      const response = await t
        .request()
        .post(`${API}/auth/logout`)
        .set('Origin', 'https://otro.example');

      expect(response.body.error.code).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('las consultas no se rechazan por su origen: CORS impide leer la respuesta', async () => {
      const response = await t.request().get(`${API}/games`).set('Origin', 'https://otro.example');

      expect(response.status).toBe(200);
    });
  });

  describe('errores comunes', () => {
    it('una ruta que no existe responde ROUTE_NOT_FOUND', async () => {
      const response = await t.request().get(`${API}/no-existe`);

      expect(response.status).toBe(404);
      expectErrorEnvelope(response);
      expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
    });

    it('un método que la ruta no admite responde METHOD_NOT_ALLOWED e indica los admitidos', async () => {
      const response = await t.request().delete(`${API}/me`).set('Origin', FRONTEND_ORIGIN);

      expect(response.status).toBe(405);
      expectErrorEnvelope(response);
      expect(response.body.error.code).toBe('METHOD_NOT_ALLOWED');
      expect(response.get('Allow')).toBe('GET, HEAD, PATCH');
    });

    it('distingue el método no admitido también en rutas con parámetros', async () => {
      const response = await t
        .request()
        .post(`${API}/games/un-juego`)
        .set('Origin', FRONTEND_ORIGIN);

      expect(response.status).toBe(405);
      expect(response.body.error.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('un cuerpo que no es JSON válido responde VALIDATION_ERROR', async () => {
      const response = await t
        .request()
        .post(`${API}/auth/login`)
        .set('Origin', FRONTEND_ORIGIN)
        .set('Content-Type', 'application/json')
        .send('{"username":');

      expect(response.status).toBe(400);
      expectErrorEnvelope(response);
      expect(response.body.error).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'The request body is not valid JSON',
        details: { fields: [{ field: 'body', rule: 'INVALID_FORMAT' }] },
      });
    });

    it('un cuerpo que no llega como JSON se trata como si faltara', async () => {
      const response = await t
        .request()
        .post(`${API}/auth/login`)
        .set('Origin', FRONTEND_ORIGIN)
        .set('Content-Type', 'text/plain')
        .send('username=x');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('un cuerpo demasiado grande responde PAYLOAD_TOO_LARGE', async () => {
      const response = await t
        .request()
        .post(`${API}/auth/login`)
        .set('Origin', FRONTEND_ORIGIN)
        .send({ username: 'x'.repeat(t.config.http.maxBodyBytes), password: 'y' });

      expect(response.status).toBe(413);
      expectErrorEnvelope(response);
      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('un fallo interno responde INTERNAL_ERROR sin dar detalles', async () => {
      // Sin la tabla, la consulta falla dentro del servidor.
      await query('alter table users rename to users_hidden');
      try {
        const response = await t
          .request()
          .post(`${API}/auth/login`)
          .set('Origin', FRONTEND_ORIGIN)
          .send({ username: 'x', password: 'y' });

        expect(response.status).toBe(500);
        expectErrorEnvelope(response);
        expect(response.body.error).toEqual({
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
        });
        expect(JSON.stringify(response.body)).not.toContain('users');
      } finally {
        await query('alter table users_hidden rename to users');
      }
    });
  });

  describe('cabeceras de seguridad', () => {
    it('impide que la respuesta se interprete como otra cosa o se incruste en otra página', async () => {
      const response = await t.request().get(`${API}/games`);

      expect(response.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.get('X-Frame-Options')).toBe('DENY');
      expect(response.get('Content-Security-Policy')).toContain("default-src 'none'");
      expect(response.get('X-Powered-By')).toBeUndefined();
    });

    it('fuera de producción no ordena al navegador usar siempre HTTPS', async () => {
      const response = await t.request().get(`${API}/games`);

      expect(response.get('Strict-Transport-Security')).toBeUndefined();
    });
  });
});

describe('cookie de sesión con HTTPS', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ env: { SESSION_COOKIE_SECURE: 'true' } });
  });
  afterAll(() => t.close());
  beforeEach(() => resetDatabase());

  it('lleva Secure y el prefijo __Host-, y la sesión funciona con ese nombre', async () => {
    const registered = await t
      .request()
      .post(`${API}/auth/register`)
      .set('Origin', FRONTEND_ORIGIN)
      .send(newAccount());

    const cookie = registered.get('Set-Cookie')?.[0] ?? '';
    expect(cookie).toMatch(/^__Host-session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toMatch(/Domain=/i);

    const me = await t
      .request()
      .get(`${API}/me`)
      .set('Cookie', cookie.split(';')[0] ?? '');
    expect(me.status).toBe(200);
  });

  it('no acepta la cookie con el nombre del modo sin HTTPS', async () => {
    const registered = await t
      .request()
      .post(`${API}/auth/register`)
      .set('Origin', FRONTEND_ORIGIN)
      .send(newAccount());
    const token = /=([^;]+)/.exec(registered.get('Set-Cookie')?.[0] ?? '')?.[1];

    const me = await t.request().get(`${API}/me`).set('Cookie', `session=${token}`);

    expect(me.status).toBe(401);
  });
});
