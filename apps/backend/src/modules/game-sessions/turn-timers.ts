import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';

/** El mayor retraso que admite un temporizador de Node.js. */
const MAX_DELAY_MS = 2 ** 31 - 1;

/**
 * Un temporizador por partida en curso, puesto a la hora en que se agota
 * el primer reloj (ADR-014, decisión K3). Viven solo en memoria: si el
 * servidor se reinicia se pierden, y por eso existe además la revisión
 * periódica de relojes vencidos.
 *
 * Un temporizador solo avisa. Si de verdad se agotó el tiempo lo decide
 * quien recibe el aviso, mirando de nuevo el reloj guardado.
 */
@Injectable()
export class TurnTimers implements OnApplicationShutdown {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private onDue: ((matchId: string) => void) | null = null;

  constructor(
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** A quién se avisa cuando llega la hora de una partida. */
  listen(onDue: (matchId: string) => void): void {
    this.onDue = onDue;
  }

  /** Pone, o cambia, la hora del aviso de una partida. */
  arm(matchId: string, at: Date): void {
    // Las pruebas llaman a la comprobación cuando les conviene (ADR-013, decisión H8).
    if (this.config.environment === 'test') return;
    this.cancel(matchId);

    const delayMs = Math.min(Math.max(0, at.getTime() - this.clock.now().getTime()), MAX_DELAY_MS);
    const timer = setTimeout(() => {
      this.timers.delete(matchId);
      this.onDue?.(matchId);
    }, delayMs);
    // Un temporizador pendiente no debe impedir que el proceso termine.
    timer.unref();
    this.timers.set(matchId, timer);
  }

  cancel(matchId: string): void {
    const timer = this.timers.get(matchId);
    if (timer) clearTimeout(timer);
    this.timers.delete(matchId);
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
