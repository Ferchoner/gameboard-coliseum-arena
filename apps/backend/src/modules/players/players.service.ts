import { randomUUID } from 'node:crypto';
import type { PlayerRef } from '@gameboard/contracts';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import type { DbExecutor, Transaction } from '../../database/database.service.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { UsersService } from '../users/users.service.js';
import { PlayersRepository, type PlayerRow } from './players.repository.js';

/** El jugador: la identidad que participa en salas y partidas (ADR-011, 9.11). */
export interface Player {
  readonly id: string;
  readonly userId: string | null;
}

function toPlayer(row: PlayerRow): Player {
  return { id: row.id, userId: row.userId };
}

@Injectable()
export class PlayersService {
  constructor(
    private readonly repository: PlayersRepository,
    private readonly users: UsersService,
    private readonly profiles: ProfilesService,
    private readonly clock: Clock,
  ) {}

  async createForUser(userId: string, executor?: DbExecutor): Promise<Player> {
    const row = await this.repository.insert(
      { id: randomUUID(), userId, createdAt: this.clock.now() },
      executor,
    );
    return toPlayer(row);
  }

  async findByUserId(userId: string): Promise<Player | null> {
    const row = await this.repository.findByUserId(userId);
    return row ? toPlayer(row) : null;
  }

  /**
   * Bloquea al jugador hasta que termine la transacción, para que dos
   * operaciones suyas simultáneas no superen entre las dos un límite que
   * ninguna supera por separado (ADR-013, decisión H7). Quien bloquea
   * también una sala, bloquea siempre antes al jugador.
   */
  async lock(playerId: string, tx: Transaction): Promise<void> {
    const found = await this.repository.lockById(playerId, tx);
    if (!found) throw new Error(`El jugador ${playerId} no existe`);
  }

  /** Cómo se muestra cada jugador a los demás: su nombre de usuario y su nombre visible. */
  async findRefs(
    playerIds: readonly string[],
    executor?: DbExecutor,
  ): Promise<Map<string, PlayerRef>> {
    const rows = await this.repository.findByIds([...new Set(playerIds)], executor);
    const userIds = rows.flatMap((row) => (row.userId ? [row.userId] : []));
    // Una detrás de otra: dentro de una transacción comparten la misma conexión.
    const usernames = await this.users.findUsernames(userIds, executor);
    const displayNames = await this.profiles.findDisplayNames(userIds, executor);

    const refs = new Map<string, PlayerRef>();
    for (const row of rows) {
      const username = row.userId ? usernames.get(row.userId) : undefined;
      if (username === undefined) continue;
      const displayName = (row.userId && displayNames.get(row.userId)) || username;
      refs.set(row.id, { playerId: row.id, username, displayName });
    }
    return refs;
  }
}
