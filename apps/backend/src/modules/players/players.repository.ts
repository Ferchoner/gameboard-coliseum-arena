import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import {
  DatabaseService,
  type DbExecutor,
  type Transaction,
} from '../../database/database.service.js';
import { players } from './players.schema.js';

export type PlayerRow = typeof players.$inferSelect;
export type NewPlayerRow = typeof players.$inferInsert;

/** Único punto de acceso a la tabla `players`. */
@Injectable()
export class PlayersRepository {
  constructor(private readonly database: DatabaseService) {}

  async insert(row: NewPlayerRow, executor: DbExecutor = this.database.db): Promise<PlayerRow> {
    const [inserted] = await executor.insert(players).values(row).returning();
    if (!inserted) throw new Error('La inserción del jugador no devolvió ninguna fila');
    return inserted;
  }

  async findByUserId(
    userId: string,
    executor: DbExecutor = this.database.db,
  ): Promise<PlayerRow | null> {
    const [row] = await executor.select().from(players).where(eq(players.userId, userId)).limit(1);
    return row ?? null;
  }

  async findByUserIds(
    userIds: readonly string[],
    executor: DbExecutor = this.database.db,
  ): Promise<PlayerRow[]> {
    if (userIds.length === 0) return [];
    return executor
      .select()
      .from(players)
      .where(inArray(players.userId, [...userIds]));
  }

  async findByIds(
    ids: readonly string[],
    executor: DbExecutor = this.database.db,
  ): Promise<PlayerRow[]> {
    if (ids.length === 0) return [];
    return executor
      .select()
      .from(players)
      .where(inArray(players.id, [...ids]));
  }

  /** Bloquea la fila del jugador hasta que termine la transacción. */
  async lockById(id: string, tx: Transaction): Promise<boolean> {
    const rows = await tx
      .select({ id: players.id })
      .from(players)
      .where(eq(players.id, id))
      // `no key update`: quien inserta una fila que hace referencia al jugador, como
      // un asiento de una partida que empieza, no tiene que esperar a este bloqueo.
      .for('no key update');
    return rows.length > 0;
  }
}
