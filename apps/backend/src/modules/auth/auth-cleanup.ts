import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { PasswordResetService } from './password-reset.service.js';
import { SessionsService } from './sessions.service.js';

/**
 * Borra cada cierto tiempo las sesiones caducadas y los enlaces de
 * recuperación caducados o usados (ADR-017, U14). Es un temporizador
 * propio, sin librería (ADR-013, decisión H8). Las pruebas llaman a `run`
 * cuando les conviene.
 */
@Injectable()
export class AuthCleanup implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AuthCleanup.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly sessions: SessionsService,
    private readonly passwordReset: PasswordResetService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.environment === 'test') return;
    this.timer = setInterval(() => void this.run(), this.config.session.cleanupIntervalMs);
    // La limpieza no debe impedir que el proceso termine.
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async run(): Promise<void> {
    // Si una limpieza tarda más que el intervalo, la siguiente se salta.
    if (this.running) return;
    this.running = true;
    try {
      const sessions = await this.sessions.deleteExpired();
      const tokens = await this.passwordReset.deleteExpiredOrUsed();
      if (sessions + tokens > 0) {
        this.logger.log(
          `Limpieza: ${sessions} sesiones caducadas y ${tokens} enlaces de recuperación borrados.`,
        );
      }
    } catch (error) {
      this.logger.error(`Falló la limpieza de sesiones y enlaces: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
