import { describe, expect, it } from 'vitest';
import { InvalidConfigError, loadConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
  FRONTEND_ORIGIN: 'http://localhost:3001',
};

describe('configuración', () => {
  it('aplica los valores por defecto', () => {
    const config = loadConfig(base);

    expect(config.http.port).toBe(3000);
    expect(config.database.poolMax).toBe(10);
    expect(config.session.idleMs).toBe(30 * 24 * 60 * 60 * 1000);
    expect(config.session.absoluteMs).toBe(90 * 24 * 60 * 60 * 1000);
    expect(config.http.tls).toBeNull();
  });

  it('usa el prefijo __Host- cuando la cookie es segura, que es lo normal', () => {
    expect(loadConfig(base).session).toMatchObject({
      cookieName: '__Host-session',
      cookieSecure: true,
    });
    expect(loadConfig({ ...base, SESSION_COOKIE_SECURE: 'false' }).session).toMatchObject({
      cookieName: 'session',
      cookieSecure: false,
    });
  });

  it('no arranca sin la base de datos o sin el origen del frontend', () => {
    expect(() => loadConfig({})).toThrow(InvalidConfigError);
    expect(() => loadConfig({ FRONTEND_ORIGIN: base.FRONTEND_ORIGIN })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ DATABASE_URL: base.DATABASE_URL })).toThrow(/FRONTEND_ORIGIN/);
  });

  it('rechaza un origen con ruta', () => {
    expect(() => loadConfig({ ...base, FRONTEND_ORIGIN: 'http://localhost:3001/app' })).toThrow(
      /FRONTEND_ORIGIN/,
    );
  });

  it('no permite una cookie sin Secure en producción', () => {
    expect(() =>
      loadConfig({ ...base, NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' }),
    ).toThrow(/SESSION_COOKIE_SECURE/);
  });

  it('exige el certificado y la clave juntos', () => {
    expect(() => loadConfig({ ...base, TLS_CERT_FILE: 'cert.pem' })).toThrow(/TLS_CERT_FILE/);
    expect(
      loadConfig({ ...base, TLS_CERT_FILE: 'cert.pem', TLS_KEY_FILE: 'key.pem' }).http.tls,
    ).toEqual({ certFile: 'cert.pem', keyFile: 'key.pem' });
  });
});
