import { randomUUID } from 'node:crypto';
import type { UserRole } from '@gameboard/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import type { DbExecutor } from '../../database/database.service.js';
import { PlayersService } from '../players/players.service.js';
import { UsersService } from '../users/users.service.js';
import { generateSessionToken, hashSessionToken, looksLikeSessionToken } from './session-token.js';
import { SessionsRepository } from './sessions.repository.js';

/**
 * Quién hace una petición. Sale siempre de la sesión de autenticación,
 * nunca de un identificador enviado por el cliente (acuerdo B11).
 */
export interface AuthContext {
  readonly sessionId: string;
  readonly userId: string;
  readonly playerId: string;
  readonly role: UserRole;
}

export interface IssuedSession {
  /** El identificador en claro. Solo existe aquí y en la cookie. */
  readonly token: string;
  /** Instante a partir del cual la sesión deja de valer pase lo que pase. */
  readonly absoluteExpiresAt: Date;
}

/** Una sesión no se renueva más de una vez por hora, para no escribir en cada petición. */
const RENEW_AFTER_MS = 60 * 60 * 1000;

/**
 * Sesiones de autenticación (ADR-004). Es el único sitio que decide si una
 * sesión vale, tanto para la API como, más adelante, para la apertura del
 * WebSocket (arquitectura, regla 11).
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly repository: SessionsRepository,
    private readonly users: UsersService,
    private readonly players: PlayersService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Crea una sesión con un identificador nuevo (ADR-004, condición 5.7). */
  async create(userId: string, executor?: DbExecutor): Promise<IssuedSession> {
    const now = this.clock.now();
    const token = generateSessionToken();
    const absoluteExpiresAt = new Date(now.getTime() + this.config.session.absoluteMs);

    await this.repository.insert(
      {
        id: randomUUID(),
        userId,
        tokenHash: hashSessionToken(token),
        createdAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + this.config.session.idleMs),
        absoluteExpiresAt,
      },
      executor,
    );

    return { token, absoluteExpiresAt };
  }

  /**
   * Devuelve quién es el dueño de la sesión, o `null` si la sesión no
   * existe, caducó o su cuenta ya no está activa. Una sesión válida se
   * renueva con el uso, sin pasar de su tope (ADR-004, condición 5.6).
   */
  async authenticate(token: string | null): Promise<AuthContext | null> {
    if (!token || !looksLikeSessionToken(token)) return null;

    const session = await this.repository.findByTokenHash(hashSessionToken(token));
    if (!session) return null;

    const now = this.clock.now();
    if (now >= session.expiresAt || now >= session.absoluteExpiresAt) {
      await this.repository.deleteById(session.id);
      return null;
    }

    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.repository.deleteById(session.id);
      return null;
    }
    const player = await this.players.findByUserId(user.id);
    if (!player) return null;

    if (now.getTime() - session.lastUsedAt.getTime() >= RENEW_AFTER_MS) {
      const renewed = Math.min(
        now.getTime() + this.config.session.idleMs,
        session.absoluteExpiresAt.getTime(),
      );
      await this.repository.renew(session.id, now, new Date(renewed));
    }

    return { sessionId: session.id, userId: user.id, playerId: player.id, role: user.role };
  }

  /** Cierra la sesión de ese identificador, si existe. */
  async revoke(token: string | null): Promise<void> {
    if (!token || !looksLikeSessionToken(token)) return;
    await this.repository.deleteByTokenHash(hashSessionToken(token));
  }

  /** Limpieza: borra las sesiones caducadas por inactividad. */
  deleteExpired(): Promise<number> {
    return this.repository.deleteExpired(this.clock.now());
  }
}
