import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService, type DbExecutor } from '../../database/database.service.js';
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
}
