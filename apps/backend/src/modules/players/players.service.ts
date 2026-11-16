import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import type { DbExecutor } from '../../database/database.service.js';
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
}
