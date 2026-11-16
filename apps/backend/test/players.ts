import type { Me } from '@gameboard/contracts';
import type { Test } from 'supertest';
import { API, FRONTEND_ORIGIN, newAccount, type TestApp } from './app.js';

/** Una persona registrada, con su sesión iniciada, que hace peticiones a la API. */
export interface TestPlayer {
  readonly me: Me;
  readonly playerId: string;
  /** La cabecera `Cookie` de su sesión, para abrir también el canal de tiempo real. */
  readonly cookie: string;
  readonly get: (path: string) => Test;
  readonly post: (path: string, body?: object) => Test;
  readonly put: (path: string, body?: object) => Test;
  readonly delete: (path: string) => Test;
}

/** Registra una cuenta nueva y devuelve cómo actuar en su nombre. */
export async function signUp(
  t: TestApp,
  overrides: Record<string, unknown> = {},
): Promise<TestPlayer> {
  const response = await t
    .request()
    .post(`${API}/auth/register`)
    .set('Origin', FRONTEND_ORIGIN)
    .send(newAccount(overrides));
  if (response.status !== 201) {
    throw new Error(`El registro de prueba falló: ${response.status} ${response.text}`);
  }

  const setCookie = response.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = setCookie?.map((value) => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error('El registro de prueba no devolvió la cookie de sesión');

  const me = response.body.data as Me;
  const send = (test: Test) => test.set('Cookie', cookie).set('Origin', FRONTEND_ORIGIN);

  return {
    me,
    playerId: me.playerId,
    cookie,
    get: (path) => send(t.request().get(`${API}${path}`)),
    post: (path, body) => send(t.request().post(`${API}${path}`)).send(body),
    put: (path, body) => send(t.request().put(`${API}${path}`)).send(body),
    delete: (path) => send(t.request().delete(`${API}${path}`)),
  };
}
