import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import { AppError } from '../../common/errors/app-error.js';
import type { DbExecutor } from '../../database/database.service.js';
import { ProfilesRepository, type ProfileRow } from './profiles.repository.js';

/** El perfil: cómo se presenta la persona (ADR-011, convención 9.11). */
export interface Profile {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly biography: string | null;
}

/** Lo que se puede cambiar del perfil (API, `PATCH /me`). */
export interface ProfileChanges {
  readonly displayName?: string;
  readonly biography?: string | null;
}

/**
 * El nombre visible sin los espacios de los extremos (ADR-017, U13). Un
 * nombre que se queda vacío no vale: se vería en blanco.
 */
export function normalizeDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed === '') {
    throw new AppError('VALIDATION_ERROR', 'The request body is not valid', {
      fields: [{ field: 'displayName', rule: 'TOO_SHORT' }],
    });
  }
  return trimmed;
}

/** La biografía sin los espacios de los extremos. Vacía es lo mismo que no tener (U13). */
export function normalizeBiography(biography: string | null): string | null {
  const trimmed = biography?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
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
      {
        userId: input.userId,
        displayName: normalizeDisplayName(input.displayName),
        updatedAt: this.clock.now(),
      },
      executor,
    );
    return toProfile(row);
  }

  /** Cambia el nombre visible o la biografía. Solo cambia lo indicado. */
  async update(userId: string, changes: ProfileChanges): Promise<Profile> {
    const row = await this.repository.update(userId, {
      ...(changes.displayName === undefined
        ? {}
        : { displayName: normalizeDisplayName(changes.displayName) }),
      ...(changes.biography === undefined
        ? {}
        : { biography: normalizeBiography(changes.biography) }),
      updatedAt: this.clock.now(),
    });
    if (!row) throw new Error(`La cuenta ${userId} no tiene perfil`);
    return toProfile(row);
  }

  async findByUserId(userId: string): Promise<Profile | null> {
    const row = await this.repository.findByUserId(userId);
    return row ? toProfile(row) : null;
  }

  /** El nombre visible de cada cuenta, por el identificador de la cuenta. */
  async findDisplayNames(
    userIds: readonly string[],
    executor?: DbExecutor,
  ): Promise<Map<string, string>> {
    const rows = await this.repository.findByUserIds(userIds, executor);
    return new Map(rows.map((row) => [row.userId, row.displayName]));
  }
}
