import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { RoomsService } from './rooms.service.js';

/**
 * Revisa cada cierto tiempo las salas en espera y cierra las inactivas
 * (ADR-009, regla 7.14). Es un temporizador propio, sin librería (ADR-013,
 * decisión H8): la lógica está en `RoomsService.closeIdleRooms`, que las
 * pruebas llaman directamente.
 */
@Injectable()
export class IdleRoomsCloser implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(IdleRoomsCloser.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly rooms: RoomsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    // Las pruebas llaman a la revisión cuando les conviene.
    if (this.config.environment === 'test') return;
    this.timer = setInterval(() => void this.run(), this.config.rooms.idleCheckIntervalMs);
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
      const closed = await this.rooms.closeIdleRooms();
      if (closed > 0) this.logger.log(`Se cerraron ${closed} salas por inactividad.`);
    } catch (error) {
      this.logger.error(`Falló la revisión de salas inactivas: ${String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
