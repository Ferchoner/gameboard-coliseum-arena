import type { Game } from '@gameboard/contracts';
import type { GameEngineRegistry } from '@gameboard/game-engine';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { type CatalogEntryRow, GamesRepository } from './games.repository.js';

/** Con esta clave se inyecta el registro de motores (acuerdo B3). */
export const GAME_ENGINE_REGISTRY = Symbol('GAME_ENGINE_REGISTRY');

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
