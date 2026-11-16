import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DatabaseService, type DbExecutor } from '../../database/database.service.js';
import { games, gameVersions } from './games.schema.js';

/** Un juego activo junto con su versión vigente. */
export interface CatalogEntryRow {
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

  /** Todas las versiones activas. Cada una debe tener un motor registrado (decisión R1). */
  listActiveVersions(executor: DbExecutor = this.database.db): Promise<ActiveVersionRow[]> {
    return executor
      .select({ slug: games.slug, version: gameVersions.version })
      .from(gameVersions)
      .innerJoin(games, eq(games.id, gameVersions.gameId))
      .where(eq(gameVersions.status, 'ACTIVE'))
      .orderBy(asc(games.slug), asc(gameVersions.version));
  }

  private catalogQuery(executor: DbExecutor) {
    return executor
      .select({
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
