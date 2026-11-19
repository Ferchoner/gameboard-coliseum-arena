import { randomUUID } from 'node:crypto';
import type {
  CreateRoomRequest,
  ListRoomsQuery,
  MatchMode,
  Page,
  RoomCloseReason,
  RoomSummary,
  RoomView,
} from '@gameboard/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import { AppError } from '../../common/errors/app-error.js';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import {
  DatabaseService,
  type DbExecutor,
  type Transaction,
} from '../../database/database.service.js';
import { Presence } from '../broadcast/presence.js';
import { RealtimeEvents } from '../broadcast/realtime-events.js';
import { GamesService } from '../games/games.service.js';
import { checkRoomOptions } from '../games/room-options.js';
import { PlayersService } from '../players/players.service.js';
import { MatchStarterSlot } from './match-starter.js';
import { decodeRoomCursor, encodeRoomCursor } from './room-cursor.js';
import { type RoomPlayerRow, type RoomRow, RoomsRepository } from './rooms.repository.js';

/** Cuántas salas inactivas se cierran, como mucho, en una revisión. */
const IDLE_BATCH_SIZE = 100;

const MODES: readonly MatchMode[] = ['REALTIME', 'TURN_BASED'];

function roomNotFound(): AppError {
  return new AppError('ROOM_NOT_FOUND', 'The room does not exist');
}

/**
 * Salas: crear, listar, entrar, salir y marcarse listo (ADR-009, bloque 2).
 *
 * Toda operación que cambia una sala bloquea su fila, y antes la del
 * jugador si cambia su pertenencia, siempre en ese orden (ADR-013,
 * decisión H7). Los avisos a los clientes se anotan en la transacción y
 * salen solo si se confirma (decisión H6).
 */
@Injectable()
export class RoomsService {
  constructor(
    private readonly repository: RoomsRepository,
    private readonly database: DatabaseService,
    private readonly games: GamesService,
    private readonly players: PlayersService,
    private readonly matchStarter: MatchStarterSlot,
    private readonly events: RealtimeEvents,
    private readonly presence: Presence,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // --- Consultas -----------------------------------------------------------

  /** Una página de las salas en espera, de la más reciente a la más antigua. */
  async list(query: ListRoomsQuery): Promise<Page<RoomSummary>> {
    const after = query.cursor === undefined ? undefined : decodeRoomCursor(query.cursor);
    if (after === null) {
      throw new AppError('VALIDATION_ERROR', 'The query parameters are not valid', {
        fields: [{ field: 'cursor', rule: 'INVALID_FORMAT' }],
      });
    }

    let gameId: string | undefined;
    if (query.gameSlug !== undefined) {
      const found = await this.games.findGameId(query.gameSlug);
      // Un juego que no existe no tiene salas.
      if (found === null) return { items: [], nextCursor: null };
      gameId = found;
    }

    // Se pide una de más para saber si hay página siguiente.
    const rows = await this.repository.listWaitingRooms({
      gameId,
      mode: query.mode,
      after,
      limit: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);

    const [memberCounts, slugs, owners] = await Promise.all([
      this.repository.countMembers(page.map((room) => room.id)),
      this.games.findSlugs(page.map((room) => room.gameId)),
      this.players.findRefs(page.map((room) => room.ownerPlayerId)),
    ]);

    const items = page.map((room): RoomSummary => {
      const gameSlug = slugs.get(room.gameId);
      const owner = owners.get(room.ownerPlayerId);
      if (gameSlug === undefined || !owner) {
        throw new Error(`La sala ${room.id} no tiene juego o anfitrión`);
      }
      return {
        roomId: room.id,
        gameSlug,
        mode: room.mode,
        timeControl: room.timeControl,
        maxPlayers: room.maxPlayers,
        memberCount: memberCounts.get(room.id) ?? 0,
        rematchEnabled: room.rematchEnabled,
        status: room.status,
        owner,
        createdAt: room.createdAt.toISOString(),
      };
    });

    return {
      items,
      nextCursor: rows.length > query.limit && last ? encodeRoomCursor(last) : null,
    };
  }

  /** El estado completo de una sala. Cualquier jugador con sesión puede verlo (API, decisión A9). */
  async get(roomId: string): Promise<RoomView> {
    const room = await this.repository.findRoom(roomId);
    if (!room) throw roomNotFound();
    return this.buildView(room);
  }

  /**
   * La sala, para un miembro que se suscribe a sus cambios. Una sala
   * cerrada ya no admite suscripciones, así que se trata como inexistente
   * (protocolo, sección 5).
   */
  async getForSubscriber(roomId: string, playerId: string): Promise<RoomView> {
    const room = await this.repository.findRoom(roomId);
    if (!room || room.status === 'CLOSED') throw roomNotFound();
    if (!(await this.repository.isMember(roomId, playerId))) {
      throw new AppError('PLAYER_NOT_IN_ROOM', 'The player is not a member of the room');
    }
    return this.buildView(room);
  }

  /** La sala tal como está ahora, para avisar a sus suscriptores. `null` si no existe o está cerrada. */
  async findOpenView(roomId: string): Promise<RoomView | null> {
    const room = await this.repository.findRoom(roomId);
    if (!room || room.status === 'CLOSED') return null;
    return this.buildView(room);
  }

  /** Las salas no cerradas a las que pertenece el jugador. */
  findOpenRoomIdsOf(playerId: string): Promise<string[]> {
    return this.repository.findOpenRoomIdsOfPlayer(playerId);
  }

  // --- Cambios -------------------------------------------------------------

  /** Crea una sala. Quien la crea es su anfitrión y su primer miembro. */
  async create(playerId: string, request: CreateRoomRequest): Promise<RoomView> {
    const game = await this.games.getPlayableGame(request.gameSlug);

    // Lo que el juego admite lo declara su motor (modelo de datos, decisión R1).
    const checked = checkRoomOptions(game.engine, {
      mode: request.mode,
      timeControl: request.timeControl,
      maxPlayers: request.maxPlayers,
      settings: request.settings ?? {},
    });
    if (!checked.ok) {
      if (checked.option !== 'settings') throw unsupportedOption(checked.option);
      throw new AppError(
        'INVALID_SETTINGS',
        'The game rejected the settings',
        checked.reason === undefined ? undefined : { reason: checked.reason },
      );
    }
    const { timeControl } = request;

    return this.database.transaction(async (tx) => {
      await this.players.lock(playerId, tx);
      await this.assertBelowMatchLimit(playerId, request.mode, tx);

      const now = this.clock.now();
      const room = await this.repository.insertRoom(
        {
          id: randomUUID(),
          gameId: game.gameId,
          ownerPlayerId: playerId,
          mode: request.mode,
          timeControl,
          maxPlayers: request.maxPlayers,
          // En tiempo real la sala siempre vuelve a la espera (regla 7.11). Por
          // turnos lo elige el anfitrión (regla 7.31).
          rematchEnabled: request.mode === 'REALTIME' ? true : request.rematchEnabled,
          settings: isPlainObject(checked.settings) ? checked.settings : {},
          status: 'WAITING',
          closeReason: null,
          createdAt: now,
          lastActivityAt: now,
          closedAt: null,
        },
        tx,
      );
      await this.repository.insertMember(
        { roomId: room.id, playerId, isReady: false, joinedAt: now },
        tx,
      );

      // Solo empieza ya si el juego admite salas de una sola plaza.
      const started = await this.startIfReady(room, tx);
      return this.buildView(started, tx);
    });
  }

  /**
   * Entra a una sala. Repetir la petición no cambia nada: quien ya es
   * miembro recibe la sala tal como está (API, decisión A2).
   */
  async join(playerId: string, roomId: string): Promise<RoomView> {
    return this.database.transaction(async (tx) => {
      await this.players.lock(playerId, tx);
      const room = await this.repository.lockRoom(roomId, tx);
      if (!room) throw roomNotFound();

      const members = await this.repository.listMembers(roomId, tx);
      if (members.some((member) => member.playerId === playerId)) {
        return this.buildView(room, tx);
      }

      if (room.status !== 'WAITING') {
        throw new AppError('ROOM_NOT_WAITING', 'The room is in a match or closed');
      }
      // La fila de la sala está bloqueada: nadie más puede ocupar la plaza
      // entre esta cuenta y la inserción (regla 7.15).
      if (members.length >= room.maxPlayers) {
        throw new AppError('ROOM_FULL', 'The room has no free places');
      }
      await this.assertBelowMatchLimit(playerId, room.mode, tx);

      const now = this.clock.now();
      await this.repository.insertMember({ roomId, playerId, isReady: false, joinedAt: now }, tx);
      await this.repository.touchRoom(roomId, now, tx);

      const started = await this.startIfReady(room, tx);
      this.announceChange(roomId, tx);
      return this.buildView(started, tx);
    });
  }

  /**
   * Sale de una sala. Si sale el anfitrión, la sala se cierra (regla
   * 7.12). Quien no es miembro recibe la misma respuesta.
   */
  async leave(playerId: string, roomId: string): Promise<void> {
    await this.database.transaction(async (tx) => {
      await this.players.lock(playerId, tx);
      const room = await this.repository.lockRoom(roomId, tx);
      if (!room) throw roomNotFound();
      if (!(await this.repository.isMember(roomId, playerId, tx))) return;

      if (room.status === 'IN_MATCH') {
        // Para dejar una partida en curso hay que rendirse (regla 7.13).
        throw new AppError('ROOM_IN_MATCH', 'The room has a match in progress');
      }

      await this.repository.deleteMember(roomId, playerId, tx);
      if (room.status === 'CLOSED') return;

      const now = this.clock.now();
      if (room.ownerPlayerId === playerId) {
        await this.close(roomId, 'OWNER_LEFT', now, tx);
      } else {
        await this.repository.touchRoom(roomId, now, tx);
        this.announceChange(roomId, tx);
      }
    });
  }

  /** Pone o quita la marca de "listo" de un miembro. */
  async setReady(playerId: string, roomId: string, ready: boolean): Promise<RoomView> {
    return this.database.transaction(async (tx) => {
      const room = await this.repository.lockRoom(roomId, tx);
      if (!room) throw roomNotFound();

      const members = await this.repository.listMembers(roomId, tx);
      const member = members.find((one) => one.playerId === playerId);
      if (!member) {
        throw new AppError('PLAYER_NOT_IN_ROOM', 'The player is not a member of the room');
      }
      if (room.status !== 'WAITING') {
        throw new AppError('ROOM_NOT_WAITING', 'The room is in a match or closed');
      }
      // Repetir la misma marca no cambia nada.
      if (member.isReady === ready) return this.buildView(room, tx);

      await this.repository.setReady(roomId, playerId, ready, tx);
      await this.repository.touchRoom(roomId, this.clock.now(), tx);

      const started = await this.startIfReady(room, tx);
      this.announceChange(roomId, tx);
      return this.buildView(started, tx);
    });
  }

  /**
   * Cierra las salas en espera que llevan sin actividad más que el plazo de
   * su modalidad (regla 7.14). Cada sala se cierra en su propia
   * transacción, comprobando de nuevo que sigue inactiva (ADR-013,
   * decisión H8). Devuelve cuántas cerró.
   */
  async closeIdleRooms(): Promise<number> {
    let closed = 0;
    for (const mode of MODES) {
      const inactiveSince = new Date(this.clock.now().getTime() - this.config.rooms.idleMs[mode]);
      const roomIds = await this.repository.findIdleRoomIds(mode, inactiveSince, IDLE_BATCH_SIZE);

      for (const roomId of roomIds) {
        const wasClosed = await this.database.transaction(async (tx) => {
          const room = await this.repository.lockRoom(roomId, tx);
          // Entre la búsqueda y el bloqueo pudo entrar alguien o cerrarse la sala.
          if (!room || room.status !== 'WAITING' || room.lastActivityAt >= inactiveSince) {
            return false;
          }
          await this.close(roomId, 'IDLE', this.clock.now(), tx);
          return true;
        });
        if (wasClosed) closed += 1;
      }
    }
    return closed;
  }

  /**
   * La partida de la sala terminó o se anuló. La sala vuelve a la espera
   * sin marcas de "listo" o, si no admite revancha, se cierra (reglas 7.11
   * y 7.31). Lo llama quien dirige la partida, dentro de la transacción en
   * la que la termina (ADR-014, decisión K1). Quien la llama ya tiene
   * bloqueada la sesión de juego: ese bloqueo va siempre antes que el de la
   * sala (decisión K10).
   *
   * Quienes perdieron por abandono, en `departing`, salen de la sala. Si
   * entre ellos está el anfitrión, la sala se cierra, como cuando el
   * anfitrión sale (reglas 7.12 y 7.32).
   */
  async matchEnded(
    roomId: string,
    now: Date,
    tx: Transaction,
    departing: readonly string[] = [],
  ): Promise<void> {
    const room = await this.repository.lockRoom(roomId, tx);
    // Una sala que ya no está en partida no cambia.
    if (!room || room.status !== 'IN_MATCH') return;

    for (const playerId of departing) await this.repository.deleteMember(roomId, playerId, tx);
    if (departing.includes(room.ownerPlayerId)) {
      await this.close(roomId, 'OWNER_LEFT', now, tx);
      return;
    }
    if (!room.rematchEnabled) {
      await this.close(roomId, 'MATCH_ENDED', now, tx);
      return;
    }
    // Si un administrador retiró el juego o cambió su versión por una que no
    // admite la sala, la sala no vuelve a la espera (ADR-017, U5).
    if (!(await this.isPlayable(room, tx))) {
      await this.close(roomId, 'ADMIN', now, tx);
      return;
    }
    await this.repository.backToWaiting(roomId, now, tx);
    await this.repository.clearReadyMarks(roomId, tx);
    this.announceChange(roomId, tx);
  }

  // --- Administración (ADR-017) ---------------------------------------------

  /**
   * Un administrador cierra una sala sin partida en curso (API,
   * `POST /admin/rooms/{roomId}/close`). Si la sala tiene una partida en
   * curso no la cierra, y devuelve esa partida: quien dirige la partida la
   * anula y cierra la sala a la vez, con `closeByAdmin` (decisión R8).
   */
  async closeIfIdleByAdmin(roomId: string): Promise<{ readonly matchInProgress: string | null }> {
    return this.database.transaction(async (tx) => {
      const room = await this.repository.lockRoom(roomId, tx);
      if (!room) throw roomNotFound();
      if (room.status === 'IN_MATCH') {
        const { currentMatchId } = await this.matchStarter.current.describeRoom(roomId, tx);
        if (currentMatchId !== null) return { matchInProgress: currentMatchId };
      }
      if (room.status !== 'CLOSED') await this.close(roomId, 'ADMIN', this.clock.now(), tx);
      return { matchInProgress: null };
    });
  }

  /**
   * Cierra la sala por decisión de un administrador, dentro de la
   * transacción que anula su partida. Quien la llama ya tiene bloqueada la
   * sesión de juego (decisión K10).
   */
  async closeByAdmin(roomId: string, now: Date, tx: Transaction): Promise<void> {
    const room = await this.repository.lockRoom(roomId, tx);
    if (!room || room.status === 'CLOSED') return;
    await this.close(roomId, 'ADMIN', now, tx);
  }

  /**
   * Saca al jugador de todas sus salas en espera, como si saliera él: deja
   * libre su plaza y, si era el anfitrión, la sala se cierra (regla 7.12).
   * Lo usa la suspensión de una cuenta (ADR-017, U4). Las salas con una
   * partida en curso no cambian: la partida sigue sus reglas.
   *
   * Quien la llama ya tiene bloqueado al jugador, que va antes que la sala
   * (ADR-013, decisión H7).
   */
  async removeFromWaitingRooms(playerId: string, tx: Transaction): Promise<number> {
    let removed = 0;
    for (const roomId of await this.repository.findOpenRoomIdsOfPlayer(playerId, tx)) {
      const room = await this.repository.lockRoom(roomId, tx);
      if (!room || room.status !== 'WAITING') continue;
      await this.repository.deleteMember(roomId, playerId, tx);
      removed += 1;
      const now = this.clock.now();
      if (room.ownerPlayerId === playerId) {
        await this.close(roomId, 'OWNER_LEFT', now, tx);
      } else {
        await this.repository.touchRoom(roomId, now, tx);
        this.announceChange(roomId, tx);
      }
    }
    return removed;
  }

  /**
   * Cierra las salas en espera de un juego que ya no pueden jugar: el juego
   * se desactivó, o su versión vigente nueva no admite sus opciones
   * (ADR-017, U5). Las salas con una partida en curso la terminan y se
   * cierran al acabar (`matchEnded`). Devuelve cuántas cerró.
   */
  async closeUnplayableWaitingRooms(gameId: string, tx: Transaction): Promise<number> {
    let closed = 0;
    for (const roomId of await this.repository.findWaitingRoomIdsOfGame(gameId, tx)) {
      const room = await this.repository.lockRoom(roomId, tx);
      if (!room || room.status !== 'WAITING' || (await this.isPlayable(room, tx))) continue;
      await this.close(roomId, 'ADMIN', this.clock.now(), tx);
      closed += 1;
    }
    return closed;
  }

  // --- Piezas --------------------------------------------------------------

  /** Si la versión vigente del juego de la sala admite sus opciones (U5). */
  private isPlayable(room: RoomRow, executor: DbExecutor): Promise<boolean> {
    return this.games.isRoomPlayable(
      room.gameId,
      {
        mode: room.mode,
        timeControl: room.timeControl,
        maxPlayers: room.maxPlayers,
        settings: room.settings,
      },
      executor,
    );
  }


  /** El límite cuenta las pertenencias a salas no cerradas de esa modalidad (decisión R7). */
  private async assertBelowMatchLimit(
    playerId: string,
    mode: MatchMode,
    tx: Transaction,
  ): Promise<void> {
    const limit = this.config.rooms.maxMatchesPerPlayer[mode];
    const current = await this.repository.countOpenMemberships(playerId, mode, tx);
    if (current >= limit) {
      throw new AppError(
        'MATCH_LIMIT_REACHED',
        'The player already has the maximum number of simultaneous matches of that mode',
        { mode, limit },
      );
    }
  }

  /**
   * Si la sala cumple la condición de inicio, pide que empiece la partida,
   * dentro de la misma transacción (modelo de datos, sección 6). La
   * condición: la sala está completa y todos están listos. La primera
   * partida de una sala por turnos no espera a las marcas de "listo"
   * (reglas 7.9, 7.10 y 7.31).
   *
   * Devuelve la sala como queda.
   */
  private async startIfReady(room: RoomRow, tx: Transaction): Promise<RoomRow> {
    if (room.status !== 'WAITING') return room;
    const members = await this.repository.listMembers(room.id, tx);
    if (members.length < room.maxPlayers) return room;

    const starter = this.matchStarter.current;
    if (!members.every((member) => member.isReady)) {
      if (room.mode !== 'TURN_BASED') return room;
      const { hasPlayed } = await starter.describeRoom(room.id, tx);
      if (hasPlayed) return room;
    }

    // Una sala que se quedó en espera mientras su juego cambiaba se cierra en vez de empezar (U5).
    if (!(await this.isPlayable(room, tx))) {
      await this.close(room.id, 'ADMIN', this.clock.now(), tx);
      return { ...room, status: 'CLOSED', closeReason: 'ADMIN' };
    }

    const matchId = await starter.startMatch(
      {
        roomId: room.id,
        gameId: room.gameId,
        mode: room.mode,
        timeControl: room.timeControl,
        settings: room.settings,
        playerIds: members.map((member) => member.playerId),
      },
      tx,
    );
    // Mientras nadie inicie partidas, la sala se queda en espera (ADR-013, decisión H2).
    if (matchId === null) return room;

    await this.repository.markInMatch(room.id, tx);
    return { ...room, status: 'IN_MATCH' };
  }

  private async close(
    roomId: string,
    closeReason: RoomCloseReason,
    now: Date,
    tx: Transaction,
  ): Promise<void> {
    await this.repository.closeRoom(roomId, closeReason, now, tx);
    this.database.afterCommit(tx, () =>
      this.events.publish({ type: 'ROOM_CLOSED', roomId, closeReason }),
    );
  }

  private announceChange(roomId: string, tx: Transaction): void {
    this.database.afterCommit(tx, () => this.events.publish({ type: 'ROOM_CHANGED', roomId }));
  }

  private async buildView(room: RoomRow, executor?: DbExecutor): Promise<RoomView> {
    const members = await this.repository.listMembers(room.id, executor);
    // Una detrás de otra: dentro de una transacción comparten la misma conexión.
    const slugs = await this.games.findSlugs([room.gameId], executor);
    const refs = await this.players.findRefs(
      members.map((member) => member.playerId),
      executor,
    );
    const matches = await this.matchStarter.current.describeRoom(room.id, executor);
    const gameSlug = slugs.get(room.gameId);
    if (gameSlug === undefined) throw new Error(`La sala ${room.id} no tiene juego`);

    return {
      roomId: room.id,
      gameSlug,
      mode: room.mode,
      timeControl: room.timeControl,
      maxPlayers: room.maxPlayers,
      rematchEnabled: room.rematchEnabled,
      settings: room.settings,
      status: room.status,
      closeReason: room.closeReason,
      ownerPlayerId: room.ownerPlayerId,
      members: members.map((member: RoomPlayerRow) => {
        const ref = refs.get(member.playerId);
        if (!ref) throw new Error(`El miembro ${member.playerId} no tiene cuenta`);
        return {
          playerId: member.playerId,
          username: ref.username,
          displayName: ref.displayName,
          ready: member.isReady,
          // La presencia no se guarda: es un dato en memoria (regla 7.24).
          connected: this.presence.isConnected(member.playerId),
          joinedAt: member.joinedAt.toISOString(),
        };
      }),
      currentMatchId: room.status === 'IN_MATCH' ? matches.currentMatchId : null,
    };
  }
}

function unsupportedOption(option: 'mode' | 'timeControl' | 'maxPlayers'): AppError {
  return new AppError('UNSUPPORTED_ROOM_OPTIONS', `The game does not support that ${option}`, {
    option,
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
