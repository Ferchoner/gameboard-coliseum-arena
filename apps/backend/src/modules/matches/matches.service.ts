import type { MatchAbortReason, MatchMode } from '@gameboard/contracts';
import { Injectable } from '@nestjs/common';
import type { DbExecutor, Transaction } from '../../database/database.service.js';
import type {
  MatchRecord,
  MatchResultRecord,
  NewMatch,
  PlayerMatchesQuery,
  SeatResultRecord,
} from './match-record.js';
import { MatchesRepository } from './matches.repository.js';

/**
 * El registro de las partidas: que se jugó, entre quiénes, en qué asiento
 * y cómo acabó. No decide nada: quien dirige la partida es `game-sessions`,
 * que anota aquí su inicio y su final dentro de su misma transacción
 * (ADR-014, decisión K1).
 */
@Injectable()
export class MatchesService {
  constructor(private readonly repository: MatchesRepository) {}

  /** Anota una partida que empieza, con sus participantes y sus asientos. */
  async create(match: NewMatch, tx: Transaction): Promise<void> {
    await this.repository.insertMatch(
      {
        id: match.matchId,
        roomId: match.roomId,
        gameVersionId: match.gameVersionId,
        mode: match.mode,
        timeControl: match.timeControl,
        settings: match.settings,
        seed: match.seed,
        status: 'IN_PROGRESS',
        abortReason: null,
        startedAt: match.startedAt,
        endedAt: null,
      },
      tx,
    );
    await this.repository.insertPlayers(
      match.playerIds.map((playerId, seat) => ({ matchId: match.matchId, playerId, seat })),
      tx,
    );
  }

  /**
   * Anota el final de una partida en curso, con su resultado. Una partida
   * admite un solo resultado (ADR-010, regla 8.15): si ya no estaba en
   * curso, falla y la transacción se deshace.
   */
  async finish(
    match: MatchRecord,
    result: MatchResultRecord,
    endedAt: Date,
    tx: Transaction,
  ): Promise<void> {
    if (!(await this.repository.markFinished(match.matchId, endedAt, tx))) {
      throw new Error(`La partida ${match.matchId} no estaba en curso al terminarla`);
    }
    await this.repository.insertResult(match.matchId, result.reason, endedAt, tx);
    await this.repository.insertPlayerResults(
      result.seats.map((one) => {
        const playerId = match.playerIds[one.seat];
        if (playerId === undefined) {
          throw new Error(`La partida ${match.matchId} no tiene el asiento ${one.seat}`);
        }
        return { matchId: match.matchId, playerId, outcome: one.outcome, score: one.score ?? null };
      }),
      tx,
    );
  }

  /** Anula una partida en curso. No deja resultado (ADR-009, regla 7.20). */
  async abort(
    matchId: string,
    reason: MatchAbortReason,
    endedAt: Date,
    tx: Transaction,
  ): Promise<void> {
    if (!(await this.repository.markAborted(matchId, reason, endedAt, tx))) {
      throw new Error(`La partida ${matchId} no estaba en curso al anularla`);
    }
  }

  async find(matchId: string, executor?: DbExecutor): Promise<MatchRecord | null> {
    const [record] = await this.findMany([matchId], executor);
    return record ?? null;
  }

  /** Esas partidas, en el mismo orden en que se piden. Las que no existen se omiten. */
  async findMany(matchIds: readonly string[], executor?: DbExecutor): Promise<MatchRecord[]> {
    if (matchIds.length === 0) return [];
    // Una detrás de otra: dentro de una transacción comparten la misma conexión.
    const rows = await this.repository.findMatches(matchIds, executor);
    const players = await this.repository.findPlayers(matchIds, executor);
    const results = await this.repository.findResults(matchIds, executor);
    const playerResults = await this.repository.findPlayerResults(matchIds, executor);

    const records = new Map<string, MatchRecord>();
    for (const row of rows) {
      // Vienen por orden de asiento.
      const playerIds = players.filter((one) => one.matchId === row.id).map((one) => one.playerId);
      const result = results.find((one) => one.matchId === row.id);
      const seats = playerResults
        .filter((one) => one.matchId === row.id)
        .map((one): SeatResultRecord => ({
          seat: playerIds.indexOf(one.playerId),
          outcome: one.outcome,
          ...(one.score === null ? {} : { score: one.score }),
        }))
        .sort((a, b) => a.seat - b.seat);

      records.set(row.id, {
        matchId: row.id,
        roomId: row.roomId,
        gameVersionId: row.gameVersionId,
        mode: row.mode,
        timeControl: row.timeControl,
        status: row.status,
        abortReason: row.abortReason,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        playerIds,
        result: result ? { reason: result.reason, seats } : null,
      });
    }
    return matchIds.flatMap((id) => {
      const record = records.get(id);
      return record ? [record] : [];
    });
  }

  /** La partida en curso de una sala, y si la sala ya albergó alguna. */
  async describeRoom(
    roomId: string,
    executor?: DbExecutor,
  ): Promise<{ currentMatchId: string | null; hasPlayed: boolean }> {
    const currentMatchId = await this.repository.findInProgressIdOfRoom(roomId, executor);
    if (currentMatchId !== null) return { currentMatchId, hasPlayed: true };
    const lastMatchId = await this.repository.findLastIdOfRoom(roomId, executor);
    return { currentMatchId: null, hasPlayed: lastMatchId !== null };
  }

  /** La partida anterior de una sala, para alternar los asientos en la revancha. */
  async findLastOfRoom(roomId: string, executor?: DbExecutor): Promise<MatchRecord | null> {
    const matchId = await this.repository.findLastIdOfRoom(roomId, executor);
    return matchId === null ? null : this.find(matchId, executor);
  }

  /** Una página de las partidas de un jugador, de la más reciente a la más antigua. */
  async listOfPlayer(query: PlayerMatchesQuery, executor?: DbExecutor): Promise<MatchRecord[]> {
    if (query.gameVersionIds?.length === 0) return [];
    const matchIds = await this.repository.listIdsOfPlayer(query, executor);
    return this.findMany(matchIds, executor);
  }

  /** Las partidas en curso en las que participa el jugador, de cualquier modalidad o de una. */
  findInProgressIdsOf(
    playerId: string,
    mode?: MatchMode,
    executor?: DbExecutor,
  ): Promise<string[]> {
    return this.repository.findInProgressIdsOfPlayer(playerId, mode, executor);
  }

  /** Las partidas en curso en las que participa el jugador, con su modalidad y su asiento. */
  findInProgressSeatsOf(
    playerId: string,
    executor?: DbExecutor,
  ): Promise<{ matchId: string; mode: MatchMode; seat: number }[]> {
    return this.repository.findInProgressSeatsOfPlayer(playerId, executor);
  }

  /** Quién juega cada partida en curso de esa modalidad. */
  listInProgressParticipants(
    mode: MatchMode,
    executor?: DbExecutor,
  ): Promise<{ matchId: string; playerId: string }[]> {
    return this.repository.listInProgressParticipants(mode, executor);
  }
}
