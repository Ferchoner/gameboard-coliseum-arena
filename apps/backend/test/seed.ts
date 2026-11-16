import { randomUUID } from 'node:crypto';
import { query } from './database.js';

export interface GameSeed {
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
export async function seedGame(seed: GameSeed): Promise<string> {
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
  return gameId;
}
