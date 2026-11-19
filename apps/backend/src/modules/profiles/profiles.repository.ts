import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DatabaseService, type DbExecutor } from '../../database/database.service.js';
import { profiles } from './profiles.schema.js';

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;

/** Único punto de acceso a la tabla `profiles`. */
@Injectable()
export class ProfilesRepository {
  constructor(private readonly database: DatabaseService) {}

  async insert(row: NewProfileRow, executor: DbExecutor = this.database.db): Promise<ProfileRow> {
    const [inserted] = await executor.insert(profiles).values(row).returning();
    if (!inserted) throw new Error('La inserción del perfil no devolvió ninguna fila');
    return inserted;
  }

  async findByUserId(
    userId: string,
    executor: DbExecutor = this.database.db,
  ): Promise<ProfileRow | null> {
    const [row] = await executor
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    return row ?? null;
  }

  async findByUserIds(
    userIds: readonly string[],
    executor: DbExecutor = this.database.db,
  ): Promise<ProfileRow[]> {
    if (userIds.length === 0) return [];
    return executor
      .select()
      .from(profiles)
      .where(inArray(profiles.userId, [...userIds]));
  }

  /** Cambia los campos indicados. Devuelve el perfil como queda, o `null` si no existe. */
  async update(
    userId: string,
    changes: Partial<Pick<ProfileRow, 'displayName' | 'biography'>> & { updatedAt: Date },
    executor: DbExecutor = this.database.db,
  ): Promise<ProfileRow | null> {
    const [row] = await executor
      .update(profiles)
      .set(changes)
      .where(eq(profiles.userId, userId))
      .returning();
    return row ?? null;
  }
}
