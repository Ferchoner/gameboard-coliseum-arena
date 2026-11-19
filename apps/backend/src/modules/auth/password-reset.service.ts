import { randomUUID } from 'node:crypto';
import type { PasswordResetConfirmRequest } from '@gameboard/contracts';
import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import { AppError } from '../../common/errors/app-error.js';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { DatabaseService } from '../../database/database.service.js';
import { Mailer, type OutgoingMail } from '../mail/mailer.js';
import { ProfilesService } from '../profiles/profiles.service.js';
import { type User, UsersService } from '../users/users.service.js';
import {
  type PasswordResetTokenRow,
  PasswordResetTokensRepository,
} from './password-reset-tokens.repository.js';
import { PasswordHasher } from './password-hasher.js';
import { generateSessionToken, hashSessionToken, looksLikeSessionToken } from './session-token.js';
import { SessionsService } from './sessions.service.js';

/** Nombre de la aplicación en los correos (ADR-016, N11). */
const APP_NAME = 'Juegos de Mesa en Línea';

function invalidResetToken(): AppError {
  return new AppError('INVALID_RESET_TOKEN', 'The reset link does not exist, expired or was used');
}

/**
 * Recuperación de la contraseña por correo (ADR-008, punto 17; ADR-017,
 * U7). El enlace lleva un token de un solo uso, del que solo se guarda el
 * hash, igual que el de la sesión.
 */
@Injectable()
export class PasswordResetService implements OnApplicationShutdown {
  private readonly logger = new Logger(PasswordResetService.name);
  /** Peticiones que se están atendiendo después de haber respondido. */
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly repository: PasswordResetTokensRepository,
    private readonly database: DatabaseService,
    private readonly users: UsersService,
    private readonly profiles: ProfilesService,
    private readonly sessions: SessionsService,
    private readonly hasher: PasswordHasher,
    private readonly mailer: Mailer,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Pide un enlace de recuperación. No espera a nada: el trabajo se hace
   * después de responder, para que la respuesta no tarde más cuando la
   * cuenta existe y no revele qué correos están registrados (U7).
   */
  request(email: string): void {
    const work = this.issue(email)
      .catch((error: unknown) => {
        this.logger.error(`Falló el envío del enlace de recuperación: ${String(error)}`);
      })
      .finally(() => this.inFlight.delete(work));
    this.inFlight.add(work);
  }

  /** Espera a que terminen las peticiones en curso. Lo usan las pruebas y el apagado. */
  async settle(): Promise<void> {
    await Promise.all([...this.inFlight]);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.settle();
  }

  /**
   * Fija la contraseña nueva con el token del enlace. En una sola
   * transacción: la contraseña cambia, el token queda usado, los demás
   * tokens de la cuenta se borran y se cierran todas sus sesiones. Sus
   * conexiones se cierran al confirmarse (U7).
   */
  async confirm(input: PasswordResetConfirmRequest): Promise<void> {
    if (!looksLikeSessionToken(input.token)) throw invalidResetToken();
    const tokenHash = hashSessionToken(input.token);

    // Primero sin bloquear, para no calcular el hash de la contraseña con un enlace que no vale.
    const found = await this.repository.findByTokenHash(tokenHash);
    if (!found || !this.isUsable(found)) throw invalidResetToken();
    const passwordHash = await this.hasher.hash(input.newPassword);

    await this.database.transaction(async (tx) => {
      const token = await this.repository.lockByTokenHash(tokenHash, tx);
      // Entre la lectura y el bloqueo pudo usarse en otra petición.
      if (!token || !this.isUsable(token)) throw invalidResetToken();
      const user = await this.users.lock(token.userId, tx);
      if (!user) throw invalidResetToken();

      await this.users.updatePasswordHash(user.id, passwordHash, tx);
      await this.repository.markUsed(token.id, this.clock.now(), tx);
      await this.repository.deleteOthersOf(user.id, token.id, tx);
      await this.sessions.endAllOf(user.id, tx);
    });
  }

  /** Limpieza: borra los tokens caducados o ya usados (U14). Devuelve cuántos eran. */
  deleteExpiredOrUsed(): Promise<number> {
    return this.repository.deleteExpiredOrUsed(this.clock.now());
  }

  private isUsable(token: PasswordResetTokenRow): boolean {
    return token.usedAt === null && this.clock.now() < token.expiresAt;
  }

  private async issue(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    // A una cuenta suspendida no se le envía: no podría iniciar sesión de todos modos (U7).
    if (!user || user.status !== 'ACTIVE') return;

    const now = this.clock.now();
    const token = generateSessionToken();
    await this.database.transaction(async (tx) => {
      // Pedir un enlace nuevo anula los anteriores sin usar.
      await this.repository.deleteUnusedOf(user.id, tx);
      await this.repository.insert(
        {
          id: randomUUID(),
          userId: user.id,
          tokenHash: hashSessionToken(token),
          createdAt: now,
          expiresAt: new Date(now.getTime() + this.config.passwordReset.ttlMs),
          usedAt: null,
        },
        tx,
      );
    });
    await this.mailer.send(await this.composeMail(user, token));
  }

  private async composeMail(user: User, token: string): Promise<OutgoingMail> {
    const profile = await this.profiles.findByUserId(user.id);
    // Lo que va tras `#` no sale del navegador: no llega a ningún registro ni a `Referer` (U7).
    const link = `${this.config.http.frontendOrigin}/recuperar-contrasena#token=${token}`;
    const minutes = Math.round(this.config.passwordReset.ttlMs / 60_000);
    return {
      to: user.email,
      subject: `Recupera tu contraseña de ${APP_NAME}`,
      text: [
        `Hola, ${profile?.displayName ?? user.username}:`,
        '',
        `Alguien, probablemente tú, ha pedido cambiar la contraseña de la cuenta ${user.username} en ${APP_NAME}.`,
        '',
        `Para elegir una contraseña nueva, abre este enlace en los próximos ${minutes} minutos:`,
        link,
        '',
        'El enlace solo sirve una vez. Si no lo pediste, ignora este correo: tu contraseña no cambia.',
      ].join('\n'),
    };
  }
}
