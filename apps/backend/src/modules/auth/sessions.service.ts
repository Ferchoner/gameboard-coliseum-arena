import { randomUUID } from 'node:crypto';
import type { UserRole } from '@gameboard/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import type { DbExecutor } from '../../database/database.service.js';
import { RealtimeEvents } from '../broadcast/realtime-events.js';
import { PlayersService } from '../players/players.service.js';
import { UsersService } from '../users/users.service.js';
import { generateSessionToken, hashSessionToken, looksLikeSessionToken } from './session-token.js';
import { type AuthSessionRow, SessionsRepository } from './sessions.repository.js';

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
 * sesión vale, tanto para la API como para el canal de tiempo real
 * (arquitectura, regla 11).
 *
 * Cuando una sesión deja de valer, lo avisa para que se cierren sus
 * conexiones abiertas (ADR-004, condición 5.8; ADR-013, decisión H5).
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly repository: SessionsRepository,
    private readonly users: UsersService,
    private readonly players: PlayersService,
    private readonly events: RealtimeEvents,
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
    return session ? this.validate(session) : null;
  }

  /**
   * Comprueba que una sesión ya identificada sigue valiendo. Lo usa el
   * canal de tiempo real para revalidar cada conexión abierta, y cuenta
   * como actividad de la sesión (protocolo, decisión T11; ADR-013, H19).
   */
  async revalidate(sessionId: string): Promise<boolean> {
    const session = await this.repository.findById(sessionId);
    return session !== null && (await this.validate(session)) !== null;
  }

  /** Cierra la sesión de ese identificador, si existe. */
  async revoke(token: string | null): Promise<void> {
    if (!token || !looksLikeSessionToken(token)) return;
    const sessionId = await this.repository.deleteByTokenHash(hashSessionToken(token));
    if (sessionId !== null) this.announceEnd(sessionId);
  }

  /** Limpieza: borra las sesiones caducadas por inactividad. Devuelve cuántas eran. */
  async deleteExpired(): Promise<number> {
    const sessionIds = await this.repository.deleteExpired(this.clock.now());
    for (const sessionId of sessionIds) this.announceEnd(sessionId);
    return sessionIds.length;
  }

  private async validate(session: AuthSessionRow): Promise<AuthContext | null> {
    const now = this.clock.now();
    if (now >= session.expiresAt || now >= session.absoluteExpiresAt) {
      await this.end(session.id);
      return null;
    }

    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.end(session.id);
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

  private async end(sessionId: string): Promise<void> {
    await this.repository.deleteById(sessionId);
    this.announceEnd(sessionId);
  }

  private announceEnd(sessionId: string): void {
    this.events.publish({ type: 'SESSION_ENDED', sessionId });
  }
}
