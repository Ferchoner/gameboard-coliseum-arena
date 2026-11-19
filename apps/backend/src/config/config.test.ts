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

  it('no arranca en producción con el correo simulado (ADR-017, U18)', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/MAIL_TRANSPORT/);
  });

  it('guarda el correo simulado en apps/backend/var/mail si no se indica otra carpeta', () => {
    expect(loadConfig(base).mail.outboxDir).toMatch(/apps[/\\]backend[/\\]var[/\\]mail$/);
    expect(loadConfig({ ...base, MAIL_OUTBOX_DIR: '/tmp/correo' }).mail.outboxDir).toBe(
      '/tmp/correo',
    );
  });

  it('el enlace de recuperación vale una hora por defecto (ADR-017, U7)', () => {
    expect(loadConfig(base).passwordReset.ttlMs).toBe(60 * 60 * 1000);
  });

  it('exige el certificado y la clave juntos', () => {
    expect(() => loadConfig({ ...base, TLS_CERT_FILE: 'cert.pem' })).toThrow(/TLS_CERT_FILE/);
    expect(
      loadConfig({ ...base, TLS_CERT_FILE: 'cert.pem', TLS_KEY_FILE: 'key.pem' }).http.tls,
    ).toEqual({ certFile: 'cert.pem', keyFile: 'key.pem' });
  });

  it('trata una variable vacía como si no estuviera', () => {
    const config = loadConfig({ ...base, PORT: '', TLS_CERT_FILE: '', TLS_KEY_FILE: '' });

    expect(config.http.port).toBe(3000);
    expect(config.http.tls).toBeNull();
  });
});
