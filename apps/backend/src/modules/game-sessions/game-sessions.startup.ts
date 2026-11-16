import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ClockSweeper } from './clock-sweeper.js';
import { GameSessionsService } from './game-sessions.service.js';
import { ServerLiveness } from './server-liveness.js';

/**
 * El arranque de las partidas, en el orden de ADR-015, decisión V10:
 *
 * 1. Ajuste de relojes por el tiempo que el servidor estuvo parado (V4).
 * 2. Temporizadores de reloj y cuenta de ausencias (V1).
 * 3. Revisión periódica de relojes vencidos.
 * 4. Anotación periódica de actividad.
 *
 * La API y el canal de tiempo real aceptan conexiones después: NestJS
 * termina de arrancar todos los módulos antes de escuchar. Si el ajuste
 * falla, el arranque falla y el servidor no se pone en marcha.
 */
@Injectable()
export class GameSessionsStartup implements OnApplicationBootstrap {
  private readonly logger = new Logger(GameSessionsStartup.name);

  constructor(
    private readonly liveness: ServerLiveness,
    private readonly sessions: GameSessionsService,
    private readonly sweeper: ClockSweeper,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { downtimeMs, shiftedSessions } = await this.liveness.recoverFromDowntime();
    if (downtimeMs !== null && shiftedSessions > 0) {
      this.logger.log(
        `El servidor estuvo parado ${Math.round(downtimeMs / 1000)} s: ` +
          `se devolvió ese tiempo a ${shiftedSessions} partidas en curso.`,
      );
    }
    await this.sessions.resume();
    this.sweeper.start();
    this.liveness.startRecording();
  }
}
