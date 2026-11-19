import type {
  AdminGame,
  AdminListUsersQuery,
  AdminUser,
  CatalogStatus,
  Page,
  UserStatus,
} from '@gameboard/contracts';
import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error.js';
import { decodePageCursor, encodePageCursor } from '../../common/http/page-cursor.js';
import { DatabaseService } from '../../database/database.service.js';
import type { AuthContext } from '../auth/sessions.service.js';
import { SessionsService } from '../auth/sessions.service.js';
import { GameSessionsService } from '../game-sessions/game-sessions.service.js';
import { GamesService } from '../games/games.service.js';
import { PlayersService } from '../players/players.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { RoomsService } from '../rooms/rooms.service.js';
import { type User, UsersService } from '../users/users.service.js';

/** Cuántas veces se reintenta cerrar una sala cuya partida termina o empieza mientras tanto. */
const CLOSE_ROOM_ATTEMPTS = 3;

/**
 * Administración mínima por la API (ADR-008, punto 15; ADR-017). No tiene
 * datos propios: pide a cada módulo lo suyo y, cuando una operación toca
 * varios, abre la transacción y se la pasa (arquitectura, decisión D4).
 *
 * Cada acción deja una línea en el registro de actividad: quién, qué y
 * sobre qué (ADR-017, U11).
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly users: UsersService,
    private readonly profiles: ProfilesService,
    private readonly players: PlayersService,
    private readonly sessions: SessionsService,
    private readonly rooms: RoomsService,
    private readonly gameSessions: GameSessionsService,
    private readonly games: GamesService,
  ) {}

  // --- Cuentas -------------------------------------------------------------

  /** Busca cuentas, de la más reciente a la más antigua (U17). */
  async listUsers(query: AdminListUsersQuery): Promise<Page<AdminUser>> {
    const after = query.cursor === undefined ? undefined : decodePageCursor(query.cursor);
    if (after === null) {
      throw new AppError('VALIDATION_ERROR', 'The query parameters are not valid', {
        fields: [{ field: 'cursor', rule: 'INVALID_FORMAT' }],
      });
    }
    // Se pide una de más para saber si hay página siguiente.
    const found = await this.users.search({
      ...(query.username === undefined ? {} : { usernamePrefix: query.username }),
      ...(query.email === undefined ? {} : { email: query.email }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(after === undefined ? {} : { after }),
      limit: query.limit + 1,
    });
    const page = found.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: await this.toAdminUsers(page),
      nextCursor:
        found.length > query.limit && last
          ? encodePageCursor({ at: last.createdAt, id: last.id })
          : null,
    };
  }

  /**
   * Suspende o reactiva una cuenta. Al suspenderla, en una sola
   * transacción: se cierran todas sus sesiones y sale de sus salas en
   * espera. Sus conexiones se cierran al confirmarse. Sus partidas en curso
   * siguen sus reglas (ADR-017, U4).
   */
  async setUserStatus(admin: AuthContext, userId: string, status: UserStatus): Promise<AdminUser> {
    if (userId === admin.userId) {
      throw new AppError('CANNOT_CHANGE_OWN_STATUS', 'An administrator cannot change their own status');
    }

    const user = await this.database.transaction(async (tx) => {
      const locked = await this.users.lock(userId, tx);
      if (!locked) throw new AppError('USER_NOT_FOUND', 'The account does not exist');
      const playerId = (await this.players.findIdsByUserIds([userId])).get(userId);
      if (playerId === undefined) throw new Error(`La cuenta ${userId} no tiene jugador`);

      if (status === 'SUSPENDED') {
        // El jugador va antes que sus salas (ADR-013, decisión H7).
        await this.players.lock(playerId, tx);
      }
      const updated = await this.users.setStatus(userId, status, tx);
      if (!updated) throw new AppError('USER_NOT_FOUND', 'The account does not exist');
      if (status === 'SUSPENDED') {
        await this.sessions.endAllOf(userId, tx);
        await this.rooms.removeFromWaitingRooms(playerId, tx);
      }
      return updated;
    });

    this.logger.log(
      `Administración: ${admin.userId} ${status === 'SUSPENDED' ? 'suspendió' : 'reactivó'} la cuenta ${userId}.`,
    );
    const [adminUser] = await this.toAdminUsers([user]);
    if (!adminUser) throw new Error(`La cuenta ${userId} no tiene perfil o jugador`);
    return adminUser;
  }

  // --- Salas y partidas ------------------------------------------------------

  /**
   * Cierra una sala. Si tiene una partida en curso, la anula en la misma
   * transacción (decisión R8). Si ya estaba cerrada, no hace nada.
   */
  async closeRoom(admin: AuthContext, roomId: string): Promise<void> {
    for (let attempt = 1; attempt <= CLOSE_ROOM_ATTEMPTS; attempt += 1) {
      const { matchInProgress } = await this.rooms.closeIfIdleByAdmin(roomId);
      if (matchInProgress === null) {
        this.logger.log(`Administración: ${admin.userId} cerró la sala ${roomId}.`);
        return;
      }
      try {
        if (await this.gameSessions.abortByAdmin(matchInProgress, { closeRoom: true })) {
          this.logger.log(
            `Administración: ${admin.userId} cerró la sala ${roomId} y anuló su partida ${matchInProgress}.`,
          );
          return;
        }
      } catch (error) {
        // La partida terminó entre las dos consultas: se vuelve a mirar la sala.
        if (!(error instanceof AppError && error.code === 'MATCH_NOT_IN_PROGRESS')) throw error;
      }
    }
    throw new Error(`La sala ${roomId} cambió de estado ${CLOSE_ROOM_ATTEMPTS} veces al cerrarla`);
  }

  /**
   * Anula una partida en curso. Su sala vuelve a la espera o se cierra,
   * como al terminar (decisión R8). Si ya estaba anulada, no hace nada.
   */
  async abortMatch(admin: AuthContext, matchId: string): Promise<void> {
    if (await this.gameSessions.abortByAdmin(matchId, { closeRoom: false })) {
      this.logger.log(`Administración: ${admin.userId} anuló la partida ${matchId}.`);
    }
  }

  // --- Catálogo ------------------------------------------------------------

  listGames(): Promise<AdminGame[]> {
    return this.games.listForAdmin();
  }

  /**
   * Activa o desactiva un juego. Al desactivarlo, sus salas en espera se
   * cierran en la misma transacción; las que tienen partida, al terminarla
   * (ADR-017, U5).
   */
  async setGameStatus(
    admin: AuthContext,
    gameSlug: string,
    status: CatalogStatus,
  ): Promise<AdminGame> {
    const { game, closed } = await this.database.transaction(async (tx) => {
      const changed = await this.games.setGameStatus(gameSlug, status, tx);
      const closedRooms =
        status === 'INACTIVE' ? await this.rooms.closeUnplayableWaitingRooms(changed.gameId, tx) : 0;
      return { game: changed.game, closed: closedRooms };
    });
    this.logger.log(
      `Administración: ${admin.userId} ${status === 'ACTIVE' ? 'activó' : 'desactivó'} el juego ${gameSlug}` +
        (closed > 0 ? ` y se cerraron ${closed} salas en espera.` : '.'),
    );
    return game;
  }

  async setGameVersionStatus(
    admin: AuthContext,
    gameSlug: string,
    gameVersion: string,
    status: CatalogStatus,
  ): Promise<AdminGame> {
    const game = await this.database.transaction((tx) =>
      this.games.setVersionStatus(gameSlug, gameVersion, status, tx),
    );
    this.logger.log(
      `Administración: ${admin.userId} ${status === 'ACTIVE' ? 'activó' : 'desactivó'} la versión ${gameSlug}@${gameVersion}.`,
    );
    return game;
  }

  /**
   * Elige la versión vigente. Las salas en espera cuyas opciones no admite
   * la versión nueva se cierran en la misma transacción (ADR-017, U5).
   */
  async setCurrentGameVersion(
    admin: AuthContext,
    gameSlug: string,
    gameVersion: string,
  ): Promise<AdminGame> {
    const { game, closed } = await this.database.transaction(async (tx) => {
      const changed = await this.games.setCurrentVersion(gameSlug, gameVersion, tx);
      return {
        game: changed.game,
        closed: await this.rooms.closeUnplayableWaitingRooms(changed.gameId, tx),
      };
    });
    this.logger.log(
      `Administración: ${admin.userId} hizo vigente la versión ${gameSlug}@${gameVersion}` +
        (closed > 0 ? ` y se cerraron ${closed} salas en espera que no admite.` : '.'),
    );
    return game;
  }

  // --- Piezas --------------------------------------------------------------

  private async toAdminUsers(users: readonly User[]): Promise<AdminUser[]> {
    const userIds = users.map((user) => user.id);
    const [playerIds, displayNames] = await Promise.all([
      this.players.findIdsByUserIds(userIds),
      this.profiles.findDisplayNames(userIds),
    ]);
    return users.map((user): AdminUser => {
      const playerId = playerIds.get(user.id);
      const displayName = displayNames.get(user.id);
      if (playerId === undefined || displayName === undefined) {
        throw new Error(`La cuenta ${user.id} no tiene perfil o jugador`);
      }
      return {
        userId: user.id,
        playerId,
        email: user.email,
        username: user.username,
        displayName,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
      };
    });
  }
}
