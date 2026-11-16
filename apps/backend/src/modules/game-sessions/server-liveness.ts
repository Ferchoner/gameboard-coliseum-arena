import { type BeforeApplicationShutdown, Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { DatabaseService } from '../../database/database.service.js';
import { GameSessionsRepository } from './game-sessions.repository.js';

/** Lo que encontró el arranque: cuánto estuvo parado el servidor y cuántos turnos se desplazaron. */
export interface DowntimeRecovery {
  /** `null` la primera vez que arranca, cuando todavía no hay anotación. */
  readonly downtimeMs: number | null;
  readonly shiftedSessions: number;
}

/**
 * La anotación de actividad del servidor (ADR-010, regla 8.18; ADR-015,
 * decisión V4). Cada pocos segundos anota que el servidor sigue en marcha,
 * y una vez más al apagarse en orden, con la hora exacta. Al arrancar, con
 * esa anotación, desplaza el turno de cada partida en curso para que nadie
 * pierda el tiempo que el servidor estuvo parado (regla 7.29).
 */
@Injectable()
export class ServerLiveness implements BeforeApplicationShutdown {
  private readonly logger = new Logger(ServerLiveness.name);
  private timer: NodeJS.Timeout | null = null;
  private recording = false;

  constructor(
    private readonly repository: GameSessionsRepository,
    private readonly database: DatabaseService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Ajusta los relojes tras una parada y anota el arranque, en una sola
   * transacción. Va antes de poner los temporizadores, de revisar relojes
   * y de aceptar conexiones (decisión V10). Si falla, el servidor no arranca.
   */
  recoverFromDowntime(): Promise<DowntimeRecovery> {
    return this.database.transaction(async (tx) => {
      const now = this.clock.now();
      const previous = await this.repository.lockLiveness(tx);
      const shiftedSessions = previous
        ? await this.repository.shiftActiveTurns(previous.lastAliveAt, now, tx)
        : 0;
      await this.repository.recordStart(now, tx);
      return {
        downtimeMs: previous ? Math.max(0, now.getTime() - previous.lastAliveAt.getTime()) : null,
        shiftedSessions,
      };
    });
  }

  /** Empieza la anotación periódica. Desde aquí, apagarse en orden deja también su anotación. */
  startRecording(): void {
    this.recording = true;
    // Las pruebas anotan cuando les conviene.
    if (this.config.environment === 'test') return;
    this.timer = setInterval(() => void this.record(), this.config.matches.livenessIntervalMs);
    // La anotación no debe impedir que el proceso termine.
    this.timer.unref();
  }

  /** Anota que el servidor sigue en marcha. Un fallo no para el servidor: lo intenta la siguiente. */
  async record(): Promise<void> {
    try {
      await this.repository.recordAlive(this.clock.now());
    } catch (error) {
      this.logger.error(`Falló la anotación de actividad del servidor: ${String(error)}`);
    }
  }

  /**
   * Al apagarse en orden, la última anotación lleva la hora exacta de la
   * parada. Va antes de que se cierre la conexión con la base de datos.
   */
  async beforeApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!this.recording) return;
    this.recording = false;
    await this.record();
  }
}
