import type { MatchMode, RoomCloseReason } from '@gameboard/contracts';
import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, lt, ne, or, type SQL } from 'drizzle-orm';
import {
  DatabaseService,
  type DbExecutor,
  type Transaction,
} from '../../database/database.service.js';
import { roomPlayers, rooms } from './rooms.schema.js';

export type RoomRow = typeof rooms.$inferSelect;
export type NewRoomRow = typeof rooms.$inferInsert;
export type RoomPlayerRow = typeof roomPlayers.$inferSelect;
export type NewRoomPlayerRow = typeof roomPlayers.$inferInsert;

/** Posición en la lista de salas: la última sala de la página anterior. */
export interface RoomListPosition {
  readonly createdAt: Date;
  readonly id: string;
}

export interface WaitingRoomsQuery {
  readonly gameId?: string | undefined;
  readonly mode?: MatchMode | undefined;
  readonly after?: RoomListPosition | undefined;
  readonly limit: number;
}

/** Único punto de acceso a las tablas `rooms` y `room_players`. */
@Injectable()
export class RoomsRepository {
  constructor(private readonly database: DatabaseService) {}

  // --- Salas ---------------------------------------------------------------

  async insertRoom(row: NewRoomRow, tx: Transaction): Promise<RoomRow> {
    const [inserted] = await tx.insert(rooms).values(row).returning();
    if (!inserted) throw new Error('La inserción de la sala no devolvió ninguna fila');
    return inserted;
  }

  async findRoom(id: string, executor: DbExecutor = this.database.db): Promise<RoomRow | null> {
    const [row] = await executor.select().from(rooms).where(eq(rooms.id, id)).limit(1);
    return row ?? null;
  }

  /**
   * Lee la sala y bloquea su fila hasta que termine la transacción. Todo
   * cambio de pertenencia o de estado pasa por aquí, para que dos
   * operaciones simultáneas sobre la misma sala se apliquen una detrás de
   * otra (ADR-013, decisión H7).
   */
  async lockRoom(id: string, tx: Transaction): Promise<RoomRow | null> {
    const [row] = await tx.select().from(rooms).where(eq(rooms.id, id)).for('update');
    return row ?? null;
  }

  /** Las salas en espera, de la más reciente a la más antigua. */
  listWaitingRooms(
    query: WaitingRoomsQuery,
    executor: DbExecutor = this.database.db,
  ): Promise<RoomRow[]> {
    const conditions: (SQL | undefined)[] = [eq(rooms.status, 'WAITING')];
    if (query.gameId !== undefined) conditions.push(eq(rooms.gameId, query.gameId));
    if (query.mode !== undefined) conditions.push(eq(rooms.mode, query.mode));
    if (query.after) {
      conditions.push(
        or(
          lt(rooms.createdAt, query.after.createdAt),
          and(eq(rooms.createdAt, query.after.createdAt), lt(rooms.id, query.after.id)),
        ),
      );
    }
    return executor
      .select()
      .from(rooms)
      .where(and(...conditions))
      .orderBy(desc(rooms.createdAt), desc(rooms.id))
      .limit(query.limit);
  }

  /** Salas en espera de esa modalidad sin actividad desde antes de ese instante. */
  async findIdleRoomIds(
    mode: MatchMode,
    inactiveSince: Date,
    limit: number,
    executor: DbExecutor = this.database.db,
  ): Promise<string[]> {
    const rows = await executor
      .select({ id: rooms.id })
      .from(rooms)
      .where(
        and(
          eq(rooms.status, 'WAITING'),
          eq(rooms.mode, mode),
          lt(rooms.lastActivityAt, inactiveSince),
        ),
      )
      .orderBy(asc(rooms.lastActivityAt))
      .limit(limit);
    return rows.map((row) => row.id);
  }

  async touchRoom(id: string, lastActivityAt: Date, tx: Transaction): Promise<void> {
    await tx.update(rooms).set({ lastActivityAt }).where(eq(rooms.id, id));
  }

  async markInMatch(id: string, tx: Transaction): Promise<void> {
    await tx.update(rooms).set({ status: 'IN_MATCH' }).where(eq(rooms.id, id));
  }

  /** Devuelve la sala a la espera al terminar su partida (ADR-009, regla 7.11). */
  async backToWaiting(id: string, lastActivityAt: Date, tx: Transaction): Promise<void> {
    await tx.update(rooms).set({ status: 'WAITING', lastActivityAt }).where(eq(rooms.id, id));
  }

  async closeRoom(
    id: string,
    closeReason: RoomCloseReason,
    closedAt: Date,
    tx: Transaction,
  ): Promise<void> {
    await tx.update(rooms).set({ status: 'CLOSED', closeReason, closedAt }).where(eq(rooms.id, id));
  }

  // --- Pertenencias --------------------------------------------------------

  async insertMember(row: NewRoomPlayerRow, tx: Transaction): Promise<void> {
    await tx.insert(roomPlayers).values(row);
  }

  /** Los miembros de la sala, por orden de llegada. */
  listMembers(roomId: string, executor: DbExecutor = this.database.db): Promise<RoomPlayerRow[]> {
    return executor
      .select()
      .from(roomPlayers)
      .where(eq(roomPlayers.roomId, roomId))
      .orderBy(asc(roomPlayers.joinedAt), asc(roomPlayers.playerId));
  }

  async isMember(
    roomId: string,
    playerId: string,
    executor: DbExecutor = this.database.db,
  ): Promise<boolean> {
    const rows = await executor
      .select({ playerId: roomPlayers.playerId })
      .from(roomPlayers)
      .where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.playerId, playerId)))
      .limit(1);
    return rows.length > 0;
  }

  /** Cuántos miembros tiene cada sala. Una sala sin miembros no aparece. */
  async countMembers(
    roomIds: readonly string[],
    executor: DbExecutor = this.database.db,
  ): Promise<Map<string, number>> {
    if (roomIds.length === 0) return new Map();
    const rows = await executor
      .select({ roomId: roomPlayers.roomId, members: count() })
      .from(roomPlayers)
      .where(inArray(roomPlayers.roomId, [...roomIds]))
      .groupBy(roomPlayers.roomId);
    return new Map(rows.map((row) => [row.roomId, row.members]));
  }

  /**
   * En cuántas salas no cerradas de esa modalidad está el jugador. Es lo
   * que cuenta para el límite de partidas simultáneas (modelo de datos,
   * decisión R7).
   */
  async countOpenMemberships(playerId: string, mode: MatchMode, tx: Transaction): Promise<number> {
    const [row] = await tx
      .select({ memberships: count() })
      .from(roomPlayers)
      .innerJoin(rooms, eq(rooms.id, roomPlayers.roomId))
      .where(
        and(eq(roomPlayers.playerId, playerId), eq(rooms.mode, mode), ne(rooms.status, 'CLOSED')),
      );
    return row?.memberships ?? 0;
  }

  /** Las salas no cerradas a las que pertenece el jugador. */
  async findOpenRoomIdsOfPlayer(
    playerId: string,
    executor: DbExecutor = this.database.db,
  ): Promise<string[]> {
    const rows = await executor
      .select({ roomId: roomPlayers.roomId })
      .from(roomPlayers)
      .innerJoin(rooms, eq(rooms.id, roomPlayers.roomId))
      .where(and(eq(roomPlayers.playerId, playerId), ne(rooms.status, 'CLOSED')));
    return rows.map((row) => row.roomId);
  }

  async setReady(
    roomId: string,
    playerId: string,
    isReady: boolean,
    tx: Transaction,
  ): Promise<void> {
    await tx
      .update(roomPlayers)
      .set({ isReady })
      .where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.playerId, playerId)));
  }

  /** Quita la marca de "listo" a todos los miembros, al terminar una partida (regla 7.11). */
  async clearReadyMarks(roomId: string, tx: Transaction): Promise<void> {
    await tx.update(roomPlayers).set({ isReady: false }).where(eq(roomPlayers.roomId, roomId));
  }

  /** Al salir, la fila se borra (modelo de datos, decisión R4). */
  async deleteMember(roomId: string, playerId: string, tx: Transaction): Promise<void> {
    await tx
      .delete(roomPlayers)
      .where(and(eq(roomPlayers.roomId, roomId), eq(roomPlayers.playerId, playerId)));
  }
}
