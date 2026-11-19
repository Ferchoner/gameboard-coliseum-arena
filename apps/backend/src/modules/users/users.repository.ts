import { Injectable } from '@nestjs/common';
import type { UserRole, UserStatus } from '@gameboard/contracts';
import { and, desc, eq, inArray, lt, or, type SQL, sql } from 'drizzle-orm';
import type { PagePosition } from '../../common/http/page-cursor.js';
import { DatabaseService, type DbExecutor } from '../../database/database.service.js';
import { users } from './users.schema.js';

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;

/** Filtros de la búsqueda de cuentas de administración (ADR-017, U17). */
export interface UserSearch {
  readonly usernamePrefix?: string;
  readonly email?: string;
  readonly status?: UserStatus;
  readonly after?: PagePosition;
  readonly limit: number;
}

/** Escapa los comodines de `like` para buscar el texto tal cual. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

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

  async findByIds(
    ids: readonly string[],
    executor: DbExecutor = this.database.db,
  ): Promise<UserRow[]> {
    if (ids.length === 0) return [];
    return executor
      .select()
      .from(users)
      .where(inArray(users.id, [...ids]));
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

  /** Cambia el estado. Devuelve la cuenta como queda, o `null` si no existe. */
  async updateStatus(
    id: string,
    status: UserStatus,
    updatedAt: Date,
    executor: DbExecutor = this.database.db,
  ): Promise<UserRow | null> {
    const [row] = await executor
      .update(users)
      .set({ status, updatedAt })
      .where(eq(users.id, id))
      .returning();
    return row ?? null;
  }

  async updateRole(
    id: string,
    role: UserRole,
    updatedAt: Date,
    executor: DbExecutor = this.database.db,
  ): Promise<void> {
    await executor.update(users).set({ role, updatedAt }).where(eq(users.id, id));
  }

  /** Bloquea la cuenta hasta que termine la transacción. */
  async lockById(id: string, executor: DbExecutor): Promise<UserRow | null> {
    const [row] = await executor.select().from(users).where(eq(users.id, id)).for('update');
    return row ?? null;
  }

  /** Cuentas, de la más reciente a la más antigua (ADR-017, U17). */
  search(search: UserSearch, executor: DbExecutor = this.database.db): Promise<UserRow[]> {
    const conditions: (SQL | undefined)[] = [];
    if (search.usernamePrefix !== undefined) {
      conditions.push(
        sql`lower(${users.username}) like ${`${escapeLike(search.usernamePrefix.toLowerCase())}%`}`,
      );
    }
    if (search.email !== undefined) conditions.push(eq(users.email, search.email.toLowerCase()));
    if (search.status !== undefined) conditions.push(eq(users.status, search.status));
    if (search.after) {
      conditions.push(
        or(
          lt(users.createdAt, search.after.at),
          and(eq(users.createdAt, search.after.at), lt(users.id, search.after.id)),
        ),
      );
    }
    return executor
      .select()
      .from(users)
      .where(and(...conditions))
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(search.limit);
  }
}
