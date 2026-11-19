import type { SeatOutcome } from '@gameboard/contracts';
import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import {
  DatabaseService,
  type DbExecutor,
  type Transaction,
} from '../../database/database.service.js';
import { gameStatistics } from './statistics.schema.js';

export type GameStatisticsRow = typeof gameStatistics.$inferSelect;

/** Único punto de acceso a la tabla `game_statistics`. */
@Injectable()
export class StatisticsRepository {
  constructor(private readonly database: DatabaseService) {}

  /** Suma una partida terminada a un jugador, creando su fila si es la primera. */
  async add(
    playerId: string,
    gameId: string,
    outcome: SeatOutcome,
    now: Date,
    tx: Transaction,
  ): Promise<void> {
    const counts = {
      played: 1,
      wins: outcome === 'WIN' ? 1 : 0,
      losses: outcome === 'LOSS' ? 1 : 0,
      draws: outcome === 'DRAW' ? 1 : 0,
    };
    await tx
      .insert(gameStatistics)
      .values({ playerId, gameId, ...counts, updatedAt: now })
      .onConflictDoUpdate({
        target: [gameStatistics.playerId, gameStatistics.gameId],
        set: {
          played: sql`${gameStatistics.played} + ${counts.played}`,
          wins: sql`${gameStatistics.wins} + ${counts.wins}`,
          losses: sql`${gameStatistics.losses} + ${counts.losses}`,
          draws: sql`${gameStatistics.draws} + ${counts.draws}`,
          updatedAt: now,
        },
      });
  }

  listByPlayer(
    playerId: string,
    executor: DbExecutor = this.database.db,
  ): Promise<GameStatisticsRow[]> {
    return executor.select().from(gameStatistics).where(eq(gameStatistics.playerId, playerId));
  }
}
