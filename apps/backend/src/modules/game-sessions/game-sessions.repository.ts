import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import {
  DatabaseService,
  type DbExecutor,
  type Transaction,
} from '../../database/database.service.js';
import { gameSessions, matchActions } from './game-sessions.schema.js';

export type GameSessionRow = typeof gameSessions.$inferSelect;
export type NewGameSessionRow = typeof gameSessions.$inferInsert;
export type NewMatchActionRow = typeof matchActions.$inferInsert;

/** Lo que cambia de una sesión al aplicar una jugada, una retirada o un final. */
export type GameSessionChange = Pick<
  GameSessionRow,
  | 'status'
  | 'state'
  | 'stateVersion'
  | 'activeSeats'
  | 'clocks'
  | 'turnStartedAt'
  | 'turnDeadlineAt'
  | 'updatedAt'
>;

/** Único punto de acceso a las tablas `game_sessions` y `match_actions`. */
@Injectable()
export class GameSessionsRepository {
  constructor(private readonly database: DatabaseService) {}

  async insertSession(row: NewGameSessionRow, tx: Transaction): Promise<void> {
    await tx.insert(gameSessions).values(row);
  }

  async findSession(
    matchId: string,
    executor: DbExecutor = this.database.db,
  ): Promise<GameSessionRow | null> {
    const [row] = await executor
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.matchId, matchId))
      .limit(1);
    return row ?? null;
  }

  findSessions(
    matchIds: readonly string[],
    executor: DbExecutor = this.database.db,
  ): Promise<GameSessionRow[]> {
    if (matchIds.length === 0) return Promise.resolve([]);
    return executor
      .select()
      .from(gameSessions)
      .where(inArray(gameSessions.matchId, [...matchIds]));
  }

  /**
   * Lee la sesión y bloquea su fila hasta que termine la transacción. Toda
   * jugada, retirada o final pasa por aquí: así dos operaciones simultáneas
   * sobre la misma partida se aplican una detrás de otra (ADR-014,
   * decisiones K2 y K10).
   */
  async lockSession(matchId: string, tx: Transaction): Promise<GameSessionRow | null> {
    const [row] = await tx
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.matchId, matchId))
      .for('update');
    return row ?? null;
  }

  /**
   * Guarda el cambio solo si la sesión sigue activa y en la versión
   * esperada. Devuelve `false` si no afectó exactamente a una fila (modelo
   * de datos, sección 6).
   */
  async updateSession(
    matchId: string,
    expectedStateVersion: number,
    change: GameSessionChange,
    tx: Transaction,
  ): Promise<boolean> {
    const updated = await tx
      .update(gameSessions)
      .set(change)
      .where(
        and(
          eq(gameSessions.matchId, matchId),
          eq(gameSessions.status, 'ACTIVE'),
          eq(gameSessions.stateVersion, expectedStateVersion),
        ),
      )
      .returning({ matchId: gameSessions.matchId });
    return updated.length === 1;
  }

  /** Las sesiones activas cuya fecha límite ya pasó, de la más antigua a la más reciente. */
  async findExpiredMatchIds(
    now: Date,
    limit: number,
    executor: DbExecutor = this.database.db,
  ): Promise<string[]> {
    const rows = await executor
      .select({ matchId: gameSessions.matchId })
      .from(gameSessions)
      .where(and(eq(gameSessions.status, 'ACTIVE'), lte(gameSessions.turnDeadlineAt, now)))
      .orderBy(asc(gameSessions.turnDeadlineAt))
      .limit(limit);
    return rows.map((row) => row.matchId);
  }

  /** La fecha límite de cada sesión activa, para rearmar los temporizadores al arrancar. */
  async listActiveDeadlines(
    executor: DbExecutor = this.database.db,
  ): Promise<{ matchId: string; turnDeadlineAt: Date }[]> {
    const rows = await executor
      .select({ matchId: gameSessions.matchId, turnDeadlineAt: gameSessions.turnDeadlineAt })
      .from(gameSessions)
      .where(eq(gameSessions.status, 'ACTIVE'));
    return rows.flatMap((row) =>
      row.turnDeadlineAt ? [{ matchId: row.matchId, turnDeadlineAt: row.turnDeadlineAt }] : [],
    );
  }

  // --- Registro de jugadas -------------------------------------------------

  async insertAction(row: NewMatchActionRow, tx: Transaction): Promise<void> {
    await tx.insert(matchActions).values(row);
  }

  /** Si ese jugador ya envió esa petición en esa partida (ADR-010, regla 8.13). */
  async hasAction(
    matchId: string,
    playerId: string,
    requestId: string,
    executor: DbExecutor = this.database.db,
  ): Promise<boolean> {
    const rows = await executor
      .select({ sequence: matchActions.sequence })
      .from(matchActions)
      .where(
        and(
          eq(matchActions.matchId, matchId),
          eq(matchActions.playerId, playerId),
          eq(matchActions.requestId, requestId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }
}
