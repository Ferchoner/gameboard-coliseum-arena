import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import type { DbExecutor } from '../../database/database.service.js';
import { ProfilesRepository, type ProfileRow } from './profiles.repository.js';

/** El perfil: cómo se presenta la persona (ADR-011, convención 9.11). */
export interface Profile {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly biography: string | null;
}

function toProfile(row: ProfileRow): Profile {
  return {
    userId: row.userId,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    biography: row.biography,
  };
}

@Injectable()
export class ProfilesService {
  constructor(
    private readonly repository: ProfilesRepository,
    private readonly clock: Clock,
  ) {}

  async create(
    input: { readonly userId: string; readonly displayName: string },
    executor?: DbExecutor,
  ): Promise<Profile> {
    const row = await this.repository.insert(
      { userId: input.userId, displayName: input.displayName, updatedAt: this.clock.now() },
      executor,
    );
    return toProfile(row);
  }

  async findByUserId(userId: string): Promise<Profile | null> {
    const row = await this.repository.findByUserId(userId);
    return row ? toProfile(row) : null;
  }
}
