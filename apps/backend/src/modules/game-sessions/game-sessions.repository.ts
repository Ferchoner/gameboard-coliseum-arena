import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import {
  DatabaseService,
  type DbExecutor,
  type Transaction,
} from '../../database/database.service.js';
import { gameSessions, matchActions, serverLiveness } from './game-sessions.schema.js';

export type GameSessionRow = typeof gameSessions.$inferSelect;
export type NewGameSessionRow = typeof gameSessions.$inferInsert;
export type NewMatchActionRow = typeof matchActions.$inferInsert;
export type ServerLivenessRow = typeof serverLiveness.$inferSelect;

/** La fila única de `server_liveness`. */
const LIVENESS_ID = 1;

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

/** Único punto de acceso a las tablas `game_sessions`, `match_actions` y `server_liveness`. */
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

  // --- Anotación de actividad del servidor ---------------------------------

  /** Lee la anotación y bloquea su fila. `null` si el servidor nunca arrancó con ella. */
  async lockLiveness(tx: Transaction): Promise<ServerLivenessRow | null> {
    const [row] = await tx
      .select()
      .from(serverLiveness)
      .where(eq(serverLiveness.id, LIVENESS_ID))
      .for('update');
    return row ?? null;
  }

  /** Anota un arranque: crea la fila si no existe. */
  async recordStart(now: Date, tx: Transaction): Promise<void> {
    await tx
      .insert(serverLiveness)
      .values({ id: LIVENESS_ID, startedAt: now, lastAliveAt: now })
      .onConflictDoUpdate({
        target: serverLiveness.id,
        set: { startedAt: now, lastAliveAt: now },
      });
  }

  /** Anota que el servidor sigue en marcha. */
  async recordAlive(now: Date, executor: DbExecutor = this.database.db): Promise<void> {
    await executor
      .update(serverLiveness)
      .set({ lastAliveAt: now })
      .where(eq(serverLiveness.id, LIVENESS_ID));
  }

  /**
   * Desplaza el turno de cada sesión activa por el tiempo que el servidor
   * estuvo parado: desde su último instante conocido, que es la última
   * anotación o el inicio del turno si es posterior, hasta `now` (ADR-015,
   * decisión V4). No toca la versión del estado. Devuelve cuántas desplazó.
   */
  async shiftActiveTurns(lastAliveAt: Date, now: Date, tx: Transaction): Promise<number> {
    const lastKnown = sql`greatest(${gameSessions.turnStartedAt}, ${lastAliveAt.toISOString()}::timestamptz)`;
    const downtime = sql`(${now.toISOString()}::timestamptz - ${lastKnown})`;
    const shifted = await tx
      .update(gameSessions)
      .set({
        turnStartedAt: sql`${gameSessions.turnStartedAt} + ${downtime}`,
        turnDeadlineAt: sql`${gameSessions.turnDeadlineAt} + ${downtime}`,
      })
      .where(
        and(
          eq(gameSessions.status, 'ACTIVE'),
          sql`${lastKnown} < ${now.toISOString()}::timestamptz`,
        ),
      )
      .returning({ matchId: gameSessions.matchId });
    return shifted.length;
  }
}
