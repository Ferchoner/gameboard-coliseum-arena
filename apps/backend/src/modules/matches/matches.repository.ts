import type { MatchAbortReason, MatchEndReason, MatchMode } from '@gameboard/contracts';
import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, lt, or, type SQL } from 'drizzle-orm';
import {
  DatabaseService,
  type DbExecutor,
  type Transaction,
} from '../../database/database.service.js';
import type { PlayerMatchesQuery } from './match-record.js';
import { matches, matchPlayers, matchResults, playerResults } from './matches.schema.js';

export type MatchRow = typeof matches.$inferSelect;
export type NewMatchRow = typeof matches.$inferInsert;
export type MatchPlayerRow = typeof matchPlayers.$inferSelect;
export type MatchResultRow = typeof matchResults.$inferSelect;
export type PlayerResultRow = typeof playerResults.$inferSelect;
export type NewPlayerResultRow = typeof playerResults.$inferInsert;

/** Único punto de acceso a las tablas `matches`, `match_players`, `match_results` y `player_results`. */
@Injectable()
export class MatchesRepository {
  constructor(private readonly database: DatabaseService) {}

  // --- Partidas ------------------------------------------------------------

  async insertMatch(row: NewMatchRow, tx: Transaction): Promise<void> {
    await tx.insert(matches).values(row);
  }

  async insertPlayers(rows: readonly MatchPlayerRow[], tx: Transaction): Promise<void> {
    await tx.insert(matchPlayers).values([...rows]);
  }

  findMatches(
    ids: readonly string[],
    executor: DbExecutor = this.database.db,
  ): Promise<MatchRow[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return executor
      .select()
      .from(matches)
      .where(inArray(matches.id, [...ids]));
  }

  /** La partida en curso de una sala, si la hay. */
  async findInProgressIdOfRoom(
    roomId: string,
    executor: DbExecutor = this.database.db,
  ): Promise<string | null> {
    const [row] = await executor
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.roomId, roomId), eq(matches.status, 'IN_PROGRESS')))
      .limit(1);
    return row?.id ?? null;
  }

  /** La partida más reciente de una sala, esté como esté. */
  async findLastIdOfRoom(
    roomId: string,
    executor: DbExecutor = this.database.db,
  ): Promise<string | null> {
    const [row] = await executor
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.roomId, roomId))
      .orderBy(desc(matches.startedAt), desc(matches.id))
      .limit(1);
    return row?.id ?? null;
  }

  /** Las partidas de un jugador en ese estado, de la más reciente a la más antigua. */
  async listIdsOfPlayer(
    query: PlayerMatchesQuery,
    executor: DbExecutor = this.database.db,
  ): Promise<string[]> {
    const conditions: (SQL | undefined)[] = [
      eq(matchPlayers.playerId, query.playerId),
      eq(matches.status, query.status),
    ];
    if (query.gameVersionIds !== undefined) {
      conditions.push(inArray(matches.gameVersionId, [...query.gameVersionIds]));
    }
    if (query.after) {
      conditions.push(
        or(
          lt(matches.startedAt, query.after.startedAt),
          and(eq(matches.startedAt, query.after.startedAt), lt(matches.id, query.after.matchId)),
        ),
      );
    }
    const rows = await executor
      .select({ id: matches.id })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      .where(and(...conditions))
      .orderBy(desc(matches.startedAt), desc(matches.id))
      .limit(query.limit);
    return rows.map((row) => row.id);
  }

  /**
   * Pasa a terminada una partida en curso. Devuelve `false` si no estaba
   * en curso: una partida solo termina una vez (ADR-010, regla 8.15).
   */
  async markFinished(id: string, endedAt: Date, tx: Transaction): Promise<boolean> {
    const updated = await tx
      .update(matches)
      .set({ status: 'FINISHED', endedAt })
      .where(and(eq(matches.id, id), eq(matches.status, 'IN_PROGRESS')))
      .returning({ id: matches.id });
    return updated.length === 1;
  }

  /** Pasa a anulada una partida en curso. Devuelve `false` si no estaba en curso. */
  async markAborted(
    id: string,
    abortReason: MatchAbortReason,
    endedAt: Date,
    tx: Transaction,
  ): Promise<boolean> {
    const updated = await tx
      .update(matches)
      .set({ status: 'ABORTED', abortReason, endedAt })
      .where(and(eq(matches.id, id), eq(matches.status, 'IN_PROGRESS')))
      .returning({ id: matches.id });
    return updated.length === 1;
  }

  // --- Participantes -------------------------------------------------------

  /** Los participantes de esas partidas, por orden de asiento. */
  findPlayers(
    matchIds: readonly string[],
    executor: DbExecutor = this.database.db,
  ): Promise<MatchPlayerRow[]> {
    if (matchIds.length === 0) return Promise.resolve([]);
    return executor
      .select()
      .from(matchPlayers)
      .where(inArray(matchPlayers.matchId, [...matchIds]))
      .orderBy(asc(matchPlayers.matchId), asc(matchPlayers.seat));
  }

  /** Las partidas en curso en las que participa el jugador. */
  async findInProgressIdsOfPlayer(
    playerId: string,
    mode: MatchMode | undefined,
    executor: DbExecutor = this.database.db,
  ): Promise<string[]> {
    const rows = await executor
      .select({ id: matches.id })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      .where(
        and(
          eq(matchPlayers.playerId, playerId),
          eq(matches.status, 'IN_PROGRESS'),
          mode === undefined ? undefined : eq(matches.mode, mode),
        ),
      );
    return rows.map((row) => row.id);
  }

  /** Los participantes de todas las partidas en curso de esa modalidad. */
  listInProgressParticipants(
    mode: MatchMode,
    executor: DbExecutor = this.database.db,
  ): Promise<{ matchId: string; playerId: string }[]> {
    return executor
      .select({ matchId: matchPlayers.matchId, playerId: matchPlayers.playerId })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      .where(and(eq(matches.status, 'IN_PROGRESS'), eq(matches.mode, mode)));
  }

  // --- Resultados ----------------------------------------------------------

  async insertResult(
    matchId: string,
    reason: MatchEndReason,
    createdAt: Date,
    tx: Transaction,
  ): Promise<void> {
    await tx.insert(matchResults).values({ matchId, reason, createdAt });
  }

  async insertPlayerResults(rows: readonly NewPlayerResultRow[], tx: Transaction): Promise<void> {
    await tx.insert(playerResults).values([...rows]);
  }

  findResults(
    matchIds: readonly string[],
    executor: DbExecutor = this.database.db,
  ): Promise<MatchResultRow[]> {
    if (matchIds.length === 0) return Promise.resolve([]);
    return executor
      .select()
      .from(matchResults)
      .where(inArray(matchResults.matchId, [...matchIds]));
  }

  findPlayerResults(
    matchIds: readonly string[],
    executor: DbExecutor = this.database.db,
  ): Promise<PlayerResultRow[]> {
    if (matchIds.length === 0) return Promise.resolve([]);
    return executor
      .select()
      .from(playerResults)
      .where(inArray(playerResults.matchId, [...matchIds]));
  }
}
