import type { PlayerGameStatistics, SeatOutcome } from '@gameboard/contracts';
import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../database/database.service.js';
import { GamesService } from '../games/games.service.js';
import { StatisticsRepository } from './statistics.repository.js';

/** El resultado de un jugador en una partida terminada. */
export interface PlayerOutcome {
  readonly playerId: string;
  readonly outcome: SeatOutcome;
}

/**
 * Estadísticas básicas por jugador y juego (ADR-008; ADR-017, U8). Una
 * partida anulada no cuenta nunca (regla 7.20), y una terminada cuenta
 * una sola vez porque se suma en la misma transacción que guarda su
 * resultado, que admite uno solo por partida (regla 8.15).
 */
@Injectable()
export class StatisticsService {
  constructor(
    private readonly repository: StatisticsRepository,
    private readonly games: GamesService,
  ) {}

  /** Suma una partida terminada a cada participante. Lo llama el final de partida. */
  async recordFinishedMatch(
    gameId: string,
    outcomes: readonly PlayerOutcome[],
    now: Date,
    tx: Transaction,
  ): Promise<void> {
    // Siempre en el mismo orden, para que dos finales a la vez no se bloqueen entre sí.
    const ordered = [...outcomes].sort((a, b) => a.playerId.localeCompare(b.playerId));
    for (const { playerId, outcome } of ordered) {
      await this.repository.add(playerId, gameId, outcome, now, tx);
    }
  }

  /**
   * Una entrada por cada juego en el que el jugador ha terminado alguna
   * partida, esté activo o no el juego, por orden del nombre corto.
   */
  async listForPlayer(playerId: string): Promise<PlayerGameStatistics[]> {
    const rows = await this.repository.listByPlayer(playerId);
    const slugs = await this.games.findSlugs(rows.map((row) => row.gameId));
    return rows
      .map((row): PlayerGameStatistics => {
        const gameSlug = slugs.get(row.gameId);
        if (gameSlug === undefined) throw new Error(`El juego ${row.gameId} no existe`);
        return {
          gameSlug,
          played: row.played,
          wins: row.wins,
          losses: row.losses,
          draws: row.draws,
        };
      })
      .sort((a, b) => a.gameSlug.localeCompare(b.gameSlug));
  }
}
