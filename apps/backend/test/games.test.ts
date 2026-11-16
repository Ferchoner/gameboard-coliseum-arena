import { randomUUID } from 'node:crypto';
import { createFakeEngine } from '@gameboard/game-engine/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { API, createTestApp, type TestApp } from './app.js';
import { expectMatchesContract } from './contract.js';
import { query, resetDatabase } from './database.js';

interface GameSeed {
  readonly slug: string;
  readonly name: string;
  readonly description?: string | null;
  readonly status?: 'ACTIVE' | 'INACTIVE';
  readonly versions: readonly {
    readonly version: string;
    readonly status?: 'ACTIVE' | 'INACTIVE';
    readonly isCurrent?: boolean;
  }[];
}

/** Da de alta un juego en la base de datos, como se hace al añadir un juego (API, decisión A5). */
async function seedGame(seed: GameSeed): Promise<void> {
  const gameId = randomUUID();
  await query(
    `insert into games (id, slug, name, description, status, created_at, updated_at)
     values ($1, $2, $3, $4, $5, now(), now())`,
    [gameId, seed.slug, seed.name, seed.description ?? null, seed.status ?? 'ACTIVE'],
  );
  for (const version of seed.versions) {
    await query(
      `insert into game_versions (id, game_id, version, status, is_current, released_at, created_at)
       values ($1, $2, $3, $4, $5, now(), now())`,
      [
        randomUUID(),
        gameId,
        version.version,
        version.status ?? 'ACTIVE',
        version.isCurrent ?? false,
      ],
    );
  }
}

const TURN_BASED_CONTROLS = [
  { type: 'TOTAL_PER_PLAYER', totalMs: 12 * 60 * 60 * 1000 },
  { type: 'TOTAL_PER_PLAYER', totalMs: 24 * 60 * 60 * 1000 },
] as const;

const engines = [
  createFakeEngine('counter', '1.0.0'),
  createFakeEngine('counter', '1.1.0', {
    minPlayers: 2,
    maxPlayers: 4,
    timeControls: {
      REALTIME: [{ type: 'TOTAL_PER_PLAYER', totalMs: 600_000 }],
      TURN_BASED: TURN_BASED_CONTROLS,
    },
  }),
  createFakeEngine('alpha', '1.0.0'),
  createFakeEngine('hidden', '1.0.0'),
];

describe('catálogo de juegos', () => {
  let t: TestApp;

  beforeAll(async () => {
    await resetDatabase();
    t = await createTestApp({ engines });
  });
  afterAll(() => t.close());
  beforeEach(() => resetDatabase());

  it('está vacío si no hay juegos dados de alta', async () => {
    const response = await t.request().get(`${API}/games`);

    expect(response.status).toBe(200);
    expectMatchesContract('GET', '/games', response);
    expect(response.body).toEqual({ success: true, data: { items: [] } });
  });

  it('se consulta sin sesión', async () => {
    await seedGame({
      slug: 'counter',
      name: 'Contador',
      versions: [{ version: '1.0.0', isCurrent: true }],
    });

    const response = await t.request().get(`${API}/games`);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
  });

  it('muestra cada juego con lo que declara el motor de su versión vigente', async () => {
    await seedGame({
      slug: 'counter',
      name: 'Contador',
      description: 'Un juego de prueba',
      versions: [{ version: '1.0.0' }, { version: '1.1.0', isCurrent: true }],
    });

    const response = await t.request().get(`${API}/games`);

    expectMatchesContract('GET', '/games', response);
    expect(response.body.data.items).toEqual([
      {
        gameSlug: 'counter',
        name: 'Contador',
        description: 'Un juego de prueba',
        gameVersion: '1.1.0',
        minPlayers: 2,
        maxPlayers: 4,
        timeControls: {
          REALTIME: [{ type: 'TOTAL_PER_PLAYER', totalMs: 600_000 }],
          TURN_BASED: TURN_BASED_CONTROLS,
        },
      },
    ]);
  });

  it('lista solo los juegos activos, por orden alfabético', async () => {
    await seedGame({
      slug: 'counter',
      name: 'Contador',
      versions: [{ version: '1.0.0', isCurrent: true }],
    });
    await seedGame({
      slug: 'alpha',
      name: 'Alfa',
      versions: [{ version: '1.0.0', isCurrent: true }],
    });
    await seedGame({
      slug: 'hidden',
      name: 'Oculto',
      status: 'INACTIVE',
      versions: [{ version: '1.0.0', isCurrent: true }],
    });

    const response = await t.request().get(`${API}/games`);

    expect(response.body.data.items.map((game: { gameSlug: string }) => game.gameSlug)).toEqual([
      'alpha',
      'counter',
    ]);
  });

  it('no lista un juego que no tiene versión vigente', async () => {
    await seedGame({ slug: 'counter', name: 'Contador', versions: [{ version: '1.0.0' }] });

    const response = await t.request().get(`${API}/games`);

    expect(response.body.data.items).toEqual([]);
  });

  it('devuelve un juego por su nombre corto', async () => {
    await seedGame({
      slug: 'counter',
      name: 'Contador',
      versions: [{ version: '1.0.0', isCurrent: true }],
    });

    const response = await t.request().get(`${API}/games/counter`);

    expect(response.status).toBe(200);
    expectMatchesContract('GET', '/games/{gameSlug}', response);
    expect(response.body.data).toMatchObject({
      gameSlug: 'counter',
      name: 'Contador',
      description: null,
      gameVersion: '1.0.0',
      minPlayers: 2,
      maxPlayers: 2,
    });
    expect(response.body.data.timeControls.TURN_BASED).toEqual([]);
  });

  it('responde GAME_NOT_FOUND si el juego no existe o no está activo', async () => {
    await seedGame({
      slug: 'hidden',
      name: 'Oculto',
      status: 'INACTIVE',
      versions: [{ version: '1.0.0', isCurrent: true }],
    });

    const unknown = await t.request().get(`${API}/games/no-existe`);
    const inactive = await t.request().get(`${API}/games/hidden`);

    expect(unknown.status).toBe(404);
    expectMatchesContract('GET', '/games/{gameSlug}', unknown);
    expect(unknown.body.error.code).toBe('GAME_NOT_FOUND');
    expect(inactive.status).toBe(404);
    expect(inactive.body.error.code).toBe('GAME_NOT_FOUND');
  });
});

describe('comprobación del catálogo al arrancar', () => {
  beforeEach(() => resetDatabase());

  it('el servidor no arranca si una versión activa no tiene motor registrado', async () => {
    await seedGame({
      slug: 'counter',
      name: 'Contador',
      versions: [{ version: '2.0.0', isCurrent: true }],
    });

    await expect(createTestApp({ engines })).rejects.toThrow(/counter@2\.0\.0/);
  });

  it('arranca si la versión sin motor está desactivada', async () => {
    await seedGame({
      slug: 'counter',
      name: 'Contador',
      versions: [
        { version: '1.0.0', isCurrent: true },
        { version: '2.0.0', status: 'INACTIVE' },
      ],
    });

    const t = await createTestApp({ engines });
    await t.close();
  });

  it('arranca con el catálogo vacío y sin motores, como en este hito', async () => {
    const t = await createTestApp();
    const response = await t.request().get(`${API}/games`);
    await t.close();

    expect(response.body.data.items).toEqual([]);
  });
});

describe('reglas de la base de datos para el catálogo', () => {
  beforeEach(() => resetDatabase());

  it('no admite dos versiones vigentes del mismo juego', async () => {
    await expect(
      seedGame({
        slug: 'counter',
        name: 'Contador',
        versions: [
          { version: '1.0.0', isCurrent: true },
          { version: '1.1.0', isCurrent: true },
        ],
      }),
    ).rejects.toThrow(/game_versions_current_unique/);
  });

  it('no admite una versión vigente desactivada', async () => {
    await expect(
      seedGame({
        slug: 'counter',
        name: 'Contador',
        versions: [{ version: '1.0.0', status: 'INACTIVE', isCurrent: true }],
      }),
    ).rejects.toThrow(/game_versions_current_is_active/);
  });

  it('no admite dos juegos con el mismo nombre corto', async () => {
    await seedGame({ slug: 'counter', name: 'Contador', versions: [] });

    await expect(seedGame({ slug: 'counter', name: 'Otro', versions: [] })).rejects.toThrow(
      /games_slug_unique/,
    );
  });
});
