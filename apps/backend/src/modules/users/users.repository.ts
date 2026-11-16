import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService, type DbExecutor } from '../../database/database.service.js';
import { users } from './users.schema.js';

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/** Único punto de acceso a la tabla `users`. */
@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  async insert(row: NewUserRow, executor: DbExecutor = this.database.db): Promise<UserRow> {
    const [inserted] = await executor.insert(users).values(row).returning();
    if (!inserted) throw new Error('La inserción de la cuenta no devolvió ninguna fila');
    return inserted;
  }

  async findById(id: string, executor: DbExecutor = this.database.db): Promise<UserRow | null> {
    const [row] = await executor.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }

  /** Busca sin distinguir mayúsculas de minúsculas, igual que el índice único. */
  async findByUsername(
    username: string,
    executor: DbExecutor = this.database.db,
  ): Promise<UserRow | null> {
    const [row] = await executor
      .select()
      .from(users)
      .where(eq(sql`lower(${users.username})`, username.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async findByEmail(
    email: string,
    executor: DbExecutor = this.database.db,
  ): Promise<UserRow | null> {
    const [row] = await executor
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async updatePasswordHash(
    id: string,
    passwordHash: string,
    updatedAt: Date,
    executor: DbExecutor = this.database.db,
  ): Promise<void> {
    await executor.update(users).set({ passwordHash, updatedAt }).where(eq(users.id, id));
  }
}
