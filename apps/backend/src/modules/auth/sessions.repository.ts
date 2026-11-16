import { Injectable } from '@nestjs/common';
import { eq, lt } from 'drizzle-orm';
import { DatabaseService, type DbExecutor } from '../../database/database.service.js';
import { authSessions } from './auth.schema.js';

export type AuthSessionRow = typeof authSessions.$inferSelect;
export type NewAuthSessionRow = typeof authSessions.$inferInsert;

/** Único punto de acceso a la tabla `auth_sessions`. */
@Injectable()
export class SessionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async insert(row: NewAuthSessionRow, executor: DbExecutor = this.database.db): Promise<void> {
    await executor.insert(authSessions).values(row);
  }

  async findByTokenHash(
    tokenHash: string,
    executor: DbExecutor = this.database.db,
  ): Promise<AuthSessionRow | null> {
    const [row] = await executor
      .select()
      .from(authSessions)
      .where(eq(authSessions.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  async findById(
    id: string,
    executor: DbExecutor = this.database.db,
  ): Promise<AuthSessionRow | null> {
    const [row] = await executor
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, id))
      .limit(1);
    return row ?? null;
  }

  async renew(
    id: string,
    lastUsedAt: Date,
    expiresAt: Date,
    executor: DbExecutor = this.database.db,
  ): Promise<void> {
    await executor
      .update(authSessions)
      .set({ lastUsedAt, expiresAt })
      .where(eq(authSessions.id, id));
  }

  /** Cerrar una sesión borra su fila (modelo de datos, decisión R6). */
  async deleteById(id: string, executor: DbExecutor = this.database.db): Promise<void> {
    await executor.delete(authSessions).where(eq(authSessions.id, id));
  }

  /** Borra la sesión de ese identificador. Devuelve su `id`, o `null` si no existía. */
  async deleteByTokenHash(
    tokenHash: string,
    executor: DbExecutor = this.database.db,
  ): Promise<string | null> {
    const [deleted] = await executor
      .delete(authSessions)
      .where(eq(authSessions.tokenHash, tokenHash))
      .returning({ id: authSessions.id });
    return deleted?.id ?? null;
  }

  /** Borra las sesiones caducadas. Devuelve sus `id`. */
  async deleteExpired(now: Date, executor: DbExecutor = this.database.db): Promise<string[]> {
    const deleted = await executor
      .delete(authSessions)
      .where(lt(authSessions.expiresAt, now))
      .returning({ id: authSessions.id });
    return deleted.map((row) => row.id);
  }
}
