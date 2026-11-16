import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { GameSessionsService } from './game-sessions.service.js';

/**
 * Revisa cada pocos segundos si hay partidas con el reloj vencido y les
 * aplica el vencimiento (ADR-010, regla 8.17; ADR-014, decisión K3). Cubre
 * a los temporizadores de cada partida, que viven en memoria y se pierden
 * si el servidor se reinicia.
 *
 * Es un temporizador propio, sin librería (ADR-013, decisión H8): la lógica
 * está en `GameSessionsService.expireDueMatches`, que las pruebas llaman
 * directamente.
 */
@Injectable()
export class ClockSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ClockSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly sessions: GameSessionsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    // Las pruebas llaman a la revisión cuando les conviene.
    if (this.config.environment === 'test') return;
    this.timer = setInterval(() => void this.run(), this.config.matches.clockCheckIntervalMs);
    // La revisión no debe impedir que el proceso termine.
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async run(): Promise<void> {
    // Si una revisión tarda más que el intervalo, la siguiente se salta.
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.sessions.expireDueMatches();
      if (expired > 0) this.logger.log(`Se aplicaron ${expired} vencimientos de reloj.`);
    } catch (error) {
      this.logger.error(`Falló la revisión de relojes vencidos: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
