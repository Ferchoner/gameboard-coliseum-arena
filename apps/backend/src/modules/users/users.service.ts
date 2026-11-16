import { randomUUID } from 'node:crypto';
import type { UserRole, UserStatus } from '@gameboard/contracts';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import { AppError } from '../../common/errors/app-error.js';
import type { DbExecutor } from '../../database/database.service.js';
import { uniqueViolationOf } from '../../database/errors.js';
import { UsersRepository, type UserRow } from './users.repository.js';

/** La cuenta: credenciales, estado y rol (ADR-011, convención 9.11). */
export interface User {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly createdAt: Date;
}

export interface NewUser {
  readonly email: string;
  readonly username: string;
  readonly passwordHash: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    passwordHash: row.passwordHash,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Crea una cuenta. Rechaza con `EMAIL_TAKEN` o `USERNAME_TAKEN` si el
   * correo o el nombre de usuario ya están en uso (API, decisión A12).
   */
  async create(input: NewUser, executor?: DbExecutor): Promise<User> {
    const now = this.clock.now();
    try {
      const row = await this.repository.insert(
        {
          id: randomUUID(),
          email: input.email.toLowerCase(),
          username: input.username,
          passwordHash: input.passwordHash,
          createdAt: now,
          updatedAt: now,
        },
        executor,
      );
      return toUser(row);
    } catch (error) {
      // La comprobación previa de `assertAvailable` no cubre a dos personas
      // que se registran a la vez: la última palabra la tiene el índice único.
      const constraint = uniqueViolationOf(error);
      if (constraint === 'users_email_unique') throw emailTaken();
      if (constraint === 'users_username_unique') throw usernameTaken();
      throw error;
    }
  }

  /** Comprueba que el correo y el nombre de usuario están libres. */
  async assertAvailable(email: string, username: string): Promise<void> {
    if (await this.repository.findByEmail(email)) throw emailTaken();
    if (await this.repository.findByUsername(username)) throw usernameTaken();
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.repository.findById(id);
    return row ? toUser(row) : null;
  }

  /** El nombre de usuario de cada cuenta, por su identificador. */
  async findUsernames(ids: readonly string[], executor?: DbExecutor): Promise<Map<string, string>> {
    const rows = await this.repository.findByIds(ids, executor);
    return new Map(rows.map((row) => [row.id, row.username]));
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = await this.repository.findByUsername(username);
    return row ? toUser(row) : null;
  }

  async updatePasswordHash(id: string, passwordHash: string): Promise<void> {
    await this.repository.updatePasswordHash(id, passwordHash, this.clock.now());
  }
}

function emailTaken(): AppError {
  return new AppError('EMAIL_TAKEN', 'An account with that email already exists');
}

function usernameTaken(): AppError {
  return new AppError('USERNAME_TAKEN', 'An account with that username already exists');
}
