import type { AdminGame, AdminGameVersion, CatalogStatus, Game } from '@gameboard/contracts';
import type { AnyGameEngine, GameEngineRegistry } from '@gameboard/game-engine';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { Clock } from '../../common/clock.js';
import type { DbExecutor, Transaction } from '../../database/database.service.js';
import {
  type CatalogEntryRow,
  type GameRow,
  GamesRepository,
  type GameVersionFullRow,
  type GameVersionRow,
} from './games.repository.js';
import { checkRoomOptions, type RoomOptions } from './room-options.js';

/** Con esta clave se inyecta el registro de motores (acuerdo B3). */
export const GAME_ENGINE_REGISTRY = Symbol('GAME_ENGINE_REGISTRY');

/** Un juego del catálogo listo para jugarse: su identificador y el motor de su versión vigente. */
export interface PlayableGame {
  readonly gameId: string;
  readonly gameSlug: string;
  readonly gameVersion: string;
  readonly engine: AnyGameEngine;
}

/**
 * Una versión concreta de un juego, que es lo que una partida fija al
 * empezar (ADR-009, regla 7.23). `engine` falta si esa versión ya no tiene
 * motor registrado.
 */
export interface GameVersion {
  readonly gameVersionId: string;
  readonly gameId: string;
  readonly gameSlug: string;
  readonly gameVersion: string;
  readonly engine: AnyGameEngine | undefined;
}

/**
 * Catálogo de juegos y versiones. No contiene reglas: lo que un juego
 * admite lo declara su motor, y el nombre y el estado están en la base de
 * datos (modelo de datos, decisión R1).
 */
@Injectable()
export class GamesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GamesService.name);

  constructor(
    private readonly repository: GamesRepository,
    private readonly clock: Clock,
    @Inject(GAME_ENGINE_REGISTRY) private readonly engines: GameEngineRegistry,
  ) {}

  /**
   * Al arrancar, comprueba que cada versión activa tiene su motor
   * registrado (decisión R1). Si a alguna le falta, el servidor no arranca:
   * es preferible a descubrirlo cuando alguien intente jugar.
   */
  async onApplicationBootstrap(): Promise<void> {
    const versions = await this.repository.listActiveVersions();
    const missing = versions.filter(({ slug, version }) => !this.engines.resolve(slug, version));
    if (missing.length > 0) {
      const list = missing.map(({ slug, version }) => `${slug}@${version}`).join(', ');
      throw new Error(
        `Hay versiones de juego activas sin motor registrado: ${list}. ` +
          'Registra su motor o desactiva esas versiones en la base de datos.',
      );
    }
    this.logger.log(
      `Catálogo comprobado: ${versions.length} versiones activas, ${this.engines.list().length} motores registrados.`,
    );
  }

  /** Los juegos activos, con lo que declara el motor de su versión vigente. */
  async listGames(): Promise<Game[]> {
    const rows = await this.repository.listCatalog();
    return rows.flatMap((row) => {
      const game = this.toGame(row);
      return game ? [game] : [];
    });
  }

  async getGame(gameSlug: string): Promise<Game> {
    const row = await this.repository.findCatalogEntry(gameSlug);
    const game = row ? this.toGame(row) : null;
    if (!game) {
      throw new AppError('GAME_NOT_FOUND', 'The game does not exist or is not active');
    }
    return game;
  }

  /**
   * El juego activo con ese nombre corto y el motor de su versión vigente.
   * Rechaza con `GAME_NOT_FOUND` si no existe o no está activo.
   */
  async getPlayableGame(gameSlug: string, executor?: DbExecutor): Promise<PlayableGame> {
    const row = await this.repository.findCatalogEntry(gameSlug, executor);
    const engine = row ? this.engines.resolve(row.slug, row.version) : undefined;
    if (!row || !engine) {
      throw new AppError('GAME_NOT_FOUND', 'The game does not exist or is not active');
    }
    return { gameId: row.gameId, gameSlug: row.slug, gameVersion: row.version, engine };
  }

  /**
   * Si una sala de ese juego puede jugar su siguiente partida: el juego
   * sigue en el catálogo y su versión vigente, con motor, admite las
   * opciones de la sala. Si no, la sala se retira (ADR-017, U5).
   */
  async isRoomPlayable(
    gameId: string,
    options: RoomOptions,
    executor?: DbExecutor,
  ): Promise<boolean> {
    const row = await this.repository.findCatalogEntryById(gameId, executor);
    const engine = row ? this.engines.resolve(row.slug, row.version) : undefined;
    return engine !== undefined && checkRoomOptions(engine, options).ok;
  }

  // --- Administración (ADR-017) ---------------------------------------------

  /** Todos los juegos y sus versiones, activos o no (API, `GET /admin/games`). */
  async listForAdmin(): Promise<AdminGame[]> {
    const games = await this.repository.listAllGames();
    const versions = await this.repository.listAllVersionsOf(games.map((game) => game.id));
    return games.map((game) =>
      this.toAdminGame(
        game,
        versions.filter((version) => version.gameId === game.id),
      ),
    );
  }

  /**
   * Activa o desactiva un juego. Desactivarlo lo retira del catálogo e
   * impide crear salas; las partidas en curso continúan. Devuelve el juego
   * como queda, y su identificador para retirar sus salas en la misma
   * transacción.
   */
  async setGameStatus(
    gameSlug: string,
    status: CatalogStatus,
    tx: Transaction,
  ): Promise<{ gameId: string; game: AdminGame }> {
    const game = await this.lockGame(gameSlug, tx);
    await this.repository.updateGameStatus(game.id, status, this.clock.now(), tx);
    return { gameId: game.id, game: await this.adminGameOf({ ...game, status }, tx) };
  }

  /**
   * Activa o desactiva una versión. No se puede activar sin motor ni
   * desactivar la vigente (API, `PUT /admin/games/{gameSlug}/versions/{gameVersion}/status`).
   */
  async setVersionStatus(
    gameSlug: string,
    gameVersion: string,
    status: CatalogStatus,
    tx: Transaction,
  ): Promise<AdminGame> {
    const game = await this.lockGame(gameSlug, tx);
    const version = await this.findVersionOf(game, gameVersion, tx);
    if (status === 'ACTIVE' && !this.engines.resolve(game.slug, version.version)) {
      throw new AppError(
        'ENGINE_NOT_REGISTERED',
        'The engine of that version is not registered in the server',
      );
    }
    if (status === 'INACTIVE' && version.isCurrent) {
      throw new AppError('GAME_VERSION_IS_CURRENT', 'The current version cannot be deactivated');
    }
    await this.repository.updateVersionStatus(version.id, status, tx);
    return this.adminGameOf(game, tx);
  }

  /**
   * Elige la versión vigente, que es la que toman las partidas nuevas.
   * Tiene que estar activa. Devuelve el juego como queda y su identificador.
   */
  async setCurrentVersion(
    gameSlug: string,
    gameVersion: string,
    tx: Transaction,
  ): Promise<{ gameId: string; game: AdminGame }> {
    const game = await this.lockGame(gameSlug, tx);
    const version = await this.findVersionOf(game, gameVersion, tx);
    if (version.status !== 'ACTIVE') {
      throw new AppError('GAME_VERSION_NOT_ACTIVE', 'The version is not active');
    }
    if (!version.isCurrent) await this.repository.makeCurrent(game.id, version.id, tx);
    return { gameId: game.id, game: await this.adminGameOf(game, tx) };
  }

  private async lockGame(gameSlug: string, tx: Transaction): Promise<GameRow> {
    const game = await this.repository.lockGameBySlug(gameSlug, tx);
    if (!game) throw new AppError('GAME_NOT_FOUND', 'The game does not exist');
    return game;
  }

  private async findVersionOf(
    game: GameRow,
    gameVersion: string,
    tx: Transaction,
  ): Promise<GameVersionFullRow> {
    const versions = await this.repository.listAllVersionsOf([game.id], tx);
    const version = versions.find((one) => one.version === gameVersion);
    if (!version) throw new AppError('GAME_VERSION_NOT_FOUND', 'The version does not exist');
    return version;
  }

  private async adminGameOf(game: GameRow, executor: DbExecutor): Promise<AdminGame> {
    return this.toAdminGame(game, await this.repository.listAllVersionsOf([game.id], executor));
  }

  private toAdminGame(game: GameRow, versions: readonly GameVersionFullRow[]): AdminGame {
    return {
      gameSlug: game.slug,
      name: game.name,
      status: game.status,
      versions: [...versions]
        .sort((a, b) => compareVersions(b.version, a.version))
        .map(
          (version): AdminGameVersion => ({
            gameVersion: version.version,
            status: version.status,
            isCurrent: version.isCurrent,
            engineRegistered: this.engines.resolve(game.slug, version.version) !== undefined,
            releasedAt: version.releasedAt?.toISOString() ?? null,
          }),
        ),
    };
  }

  /** La versión vigente de un juego, que es la que toma una partida al empezar. */
  async findCurrentVersion(gameId: string, executor?: DbExecutor): Promise<GameVersion | null> {
    const row = await this.repository.findCurrentVersionOfGame(gameId, executor);
    return row ? this.toGameVersion(row) : null;
  }

  /** Esas versiones, por su identificador. Incluye las inactivas: una partida conserva la suya. */
  async findVersions(
    gameVersionIds: readonly string[],
    executor?: DbExecutor,
  ): Promise<Map<string, GameVersion>> {
    const rows = await this.repository.findVersionsByIds([...new Set(gameVersionIds)], executor);
    return new Map(rows.map((row) => [row.gameVersionId, this.toGameVersion(row)]));
  }

  async findVersion(gameVersionId: string, executor?: DbExecutor): Promise<GameVersion | null> {
    const versions = await this.findVersions([gameVersionId], executor);
    return versions.get(gameVersionId) ?? null;
  }

  /** Todas las versiones del juego con ese nombre corto. Vacía si el juego no existe. */
  findVersionIdsOfGame(gameSlug: string, executor?: DbExecutor): Promise<string[]> {
    return this.repository.findVersionIdsBySlug(gameSlug, executor);
  }

  /** El nombre corto de cada juego, por su identificador. Incluye los inactivos. */
  async findSlugs(gameIds: readonly string[], executor?: DbExecutor): Promise<Map<string, string>> {
    const rows = await this.repository.findSlugsByIds([...new Set(gameIds)], executor);
    return new Map(rows.map((row) => [row.id, row.slug]));
  }

  /** El identificador del juego con ese nombre corto, o `null` si no existe. */
  findGameId(gameSlug: string, executor?: DbExecutor): Promise<string | null> {
    return this.repository.findIdBySlug(gameSlug, executor);
  }

  private toGameVersion(row: GameVersionRow): GameVersion {
    return {
      gameVersionId: row.gameVersionId,
      gameId: row.gameId,
      gameSlug: row.slug,
      gameVersion: row.version,
      engine: this.engines.resolve(row.slug, row.version),
    };
  }

  private toGame(row: CatalogEntryRow): Game | null {
    const engine = this.engines.resolve(row.slug, row.version);
    if (!engine) {
      // Solo puede pasar si el catálogo cambió en la base de datos después de arrancar.
      this.logger.error(`El juego ${row.slug}@${row.version} está activo pero no tiene motor.`);
      return null;
    }
    const { minPlayers, maxPlayers, timeControls } = engine.metadata;
    return {
      gameSlug: row.slug,
      name: row.name,
      description: row.description,
      gameVersion: row.version,
      minPlayers,
      maxPlayers,
      timeControls: {
        REALTIME: [...timeControls.REALTIME],
        TURN_BASED: [...timeControls.TURN_BASED],
      },
    };
  }
}

/** Compara dos versiones semánticas por sus números (ADR-011, 9.7). */
function compareVersions(a: string, b: string): number {
  const parts = (version: string) => version.split(/[.-]/).map((part) => Number(part) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
