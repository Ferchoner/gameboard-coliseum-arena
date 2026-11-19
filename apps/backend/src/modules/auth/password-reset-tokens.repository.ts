import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull, lt, ne, or } from 'drizzle-orm';
import {
  DatabaseService,
  type DbExecutor,
  type Transaction,
} from '../../database/database.service.js';
import { passwordResetTokens } from './auth.schema.js';

export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetTokenRow = typeof passwordResetTokens.$inferInsert;

/** Único punto de acceso a la tabla `password_reset_tokens`. */
@Injectable()
export class PasswordResetTokensRepository {
  constructor(private readonly database: DatabaseService) {}

  async insert(
    row: NewPasswordResetTokenRow,
    executor: DbExecutor = this.database.db,
  ): Promise<void> {
    await executor.insert(passwordResetTokens).values(row);
  }

  async findByTokenHash(
    tokenHash: string,
    executor: DbExecutor = this.database.db,
  ): Promise<PasswordResetTokenRow | null> {
    const [row] = await executor
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .limit(1);
    return row ?? null;
  }

  /** Bloquea el token hasta que termine la transacción, para que dos usos a la vez no valgan los dos. */
  async lockByTokenHash(tokenHash: string, tx: Transaction): Promise<PasswordResetTokenRow | null> {
    const [row] = await tx
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .for('update');
    return row ?? null;
  }

  async markUsed(id: string, usedAt: Date, tx: Transaction): Promise<void> {
    await tx.update(passwordResetTokens).set({ usedAt }).where(eq(passwordResetTokens.id, id));
  }

  /** Borra los tokens sin usar de la cuenta: pedir uno nuevo anula los anteriores. */
  async deleteUnusedOf(userId: string, executor: DbExecutor = this.database.db): Promise<void> {
    await executor
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
  }

  /** Borra todos los tokens de la cuenta salvo ese. */
  async deleteOthersOf(userId: string, keepId: string, tx: Transaction): Promise<void> {
    await tx
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, userId), ne(passwordResetTokens.id, keepId)));
  }

  /** Limpieza: borra los tokens caducados o ya usados. Devuelve cuántos eran. */
  async deleteExpiredOrUsed(now: Date, executor: DbExecutor = this.database.db): Promise<number> {
    const deleted = await executor
      .delete(passwordResetTokens)
      .where(or(lt(passwordResetTokens.expiresAt, now), isNotNull(passwordResetTokens.usedAt)))
      .returning({ id: passwordResetTokens.id });
    return deleted.length;
  }
}
