import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../src/database/database.service.js';
import { createTestApp, type TestApp } from './app.js';

describe('comprobación de salud', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('responde 200 sin sesión y sin el sobre de la API', async () => {
    const response = await t.request().get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('está fuera de la API versionada', async () => {
    const response = await t.request().get('/api/v1/health');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
  });
});

describe('comprobación de salud sin base de datos', () => {
  it('responde 503 si la base de datos deja de contestar', async () => {
    const t = await createTestApp();
    vi.spyOn(t.app.get(DatabaseService), 'ping').mockRejectedValue(new Error('connection refused'));

    const response = await t.request().get('/health');
    await t.close();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable' });
  });
});
