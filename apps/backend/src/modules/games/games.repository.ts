import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { DatabaseService, type DbExecutor } from '../../database/database.service.js';
import { games, gameVersions } from './games.schema.js';

/** Un juego activo junto con su versión vigente. */
export interface CatalogEntryRow {
  readonly gameId: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly version: string;
}

/** Una versión activa de un juego, esté vigente o no. */
export interface ActiveVersionRow {
  readonly slug: string;
  readonly version: string;
}

/** Una versión de un juego, con el juego al que pertenece. */
export interface GameVersionRow {
  readonly gameVersionId: string;
  readonly gameId: string;
  readonly slug: string;
  readonly version: string;
}

/** Único punto de acceso a las tablas `games` y `game_versions`. */
@Injectable()
export class GamesRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Los juegos activos que tienen una versión vigente, por orden alfabético. */
  listCatalog(executor: DbExecutor = this.database.db): Promise<CatalogEntryRow[]> {
    return this.catalogQuery(executor).orderBy(asc(games.name), asc(games.slug));
  }

  async findCatalogEntry(
    slug: string,
    executor: DbExecutor = this.database.db,
  ): Promise<CatalogEntryRow | null> {
    const [row] = await executor
      .select({
        gameId: games.id,
        slug: games.slug,
        name: games.name,
        description: games.description,
        version: gameVersions.version,
      })
      .from(games)
      .innerJoin(gameVersions, eq(gameVersions.gameId, games.id))
      .where(
        and(eq(games.status, 'ACTIVE'), eq(gameVersions.isCurrent, true), eq(games.slug, slug)),
      )
      .limit(1);
    return row ?? null;
  }

  /** El nombre corto de cada juego, por su identificador, esté activo o no. */
  async findSlugsByIds(
    ids: readonly string[],
    executor: DbExecutor = this.database.db,
  ): Promise<{ id: string; slug: string }[]> {
    if (ids.length === 0) return [];
    return executor
      .select({ id: games.id, slug: games.slug })
      .from(games)
      .where(inArray(games.id, [...ids]));
  }

  async findIdBySlug(
    slug: string,
    executor: DbExecutor = this.database.db,
  ): Promise<string | null> {
    const [row] = await executor
      .select({ id: games.id })
      .from(games)
      .where(eq(games.slug, slug))
      .limit(1);
    return row?.id ?? null;
  }

  /** La versión vigente de un juego: la que toman las partidas nuevas (ADR-011, 9.8). */
  async findCurrentVersionOfGame(
    gameId: string,
    executor: DbExecutor = this.database.db,
  ): Promise<GameVersionRow | null> {
    const [row] = await this.versionQuery(executor)
      .where(and(eq(gameVersions.gameId, gameId), eq(gameVersions.isCurrent, true)))
      .limit(1);
    return row ?? null;
  }

  /** Esas versiones, con el juego al que pertenecen, estén activas o no. */
  findVersionsByIds(
    ids: readonly string[],
    executor: DbExecutor = this.database.db,
  ): Promise<GameVersionRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.versionQuery(executor).where(inArray(gameVersions.id, [...ids]));
  }

  /** Todas las versiones del juego con ese nombre corto, estén activas o no. */
  async findVersionIdsBySlug(
    slug: string,
    executor: DbExecutor = this.database.db,
  ): Promise<string[]> {
    const rows = await executor
      .select({ id: gameVersions.id })
      .from(gameVersions)
      .innerJoin(games, eq(games.id, gameVersions.gameId))
      .where(eq(games.slug, slug));
    return rows.map((row) => row.id);
  }

  /** Todas las versiones activas. Cada una debe tener un motor registrado (decisión R1). */
  listActiveVersions(executor: DbExecutor = this.database.db): Promise<ActiveVersionRow[]> {
    return executor
      .select({ slug: games.slug, version: gameVersions.version })
      .from(gameVersions)
      .innerJoin(games, eq(games.id, gameVersions.gameId))
      .where(eq(gameVersions.status, 'ACTIVE'))
      .orderBy(asc(games.slug), asc(gameVersions.version));
  }

  private versionQuery(executor: DbExecutor) {
    return executor
      .select({
        gameVersionId: gameVersions.id,
        gameId: games.id,
        slug: games.slug,
        version: gameVersions.version,
      })
      .from(gameVersions)
      .innerJoin(games, eq(games.id, gameVersions.gameId));
  }

  private catalogQuery(executor: DbExecutor) {
    return executor
      .select({
        gameId: games.id,
        slug: games.slug,
        name: games.name,
        description: games.description,
        version: gameVersions.version,
      })
      .from(games)
      .innerJoin(gameVersions, eq(gameVersions.gameId, games.id))
      .where(and(eq(games.status, 'ACTIVE'), eq(gameVersions.isCurrent, true)));
  }
}
