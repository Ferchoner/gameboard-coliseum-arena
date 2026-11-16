import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Clock } from '../../common/clock.js';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';

/** El mayor retraso que admite un temporizador de Node.js. */
const MAX_DELAY_MS = 2 ** 31 - 1;

/** Un jugador ausente de una partida, y cuándo pierde por abandono. */
interface Absence {
  readonly abandonAt: Date;
  timer: NodeJS.Timeout | null;
}

/**
 * Quién falta en cada partida en tiempo real en curso, y desde cuándo
 * (ADR-015, decisión V1). Vive solo en memoria, como la presencia (regla
 * 7.24): tras un reinicio se vuelve a empezar la cuenta de todos (regla
 * 7.29).
 *
 * Cada ausencia tiene un temporizador puesto a la hora del abandono. Un
 * temporizador solo avisa: si de verdad pierde lo decide quien recibe el
 * aviso, mirando la partida con su fila bloqueada.
 */
@Injectable()
export class AbandonmentWatch implements OnApplicationShutdown {
  /** Por partida, los jugadores que faltan. */
  private readonly absences = new Map<string, Map<string, Absence>>();
  private onDue: ((matchId: string) => void) | null = null;

  constructor(
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** A quién se avisa cuando vence el plazo de un ausente. */
  listen(onDue: (matchId: string) => void): void {
    this.onDue = onDue;
  }

  /** Empieza a contar la ausencia de un jugador. Si ya se contaba, no cambia nada. */
  markAbsent(matchId: string, playerId: string, abandonAt: Date): void {
    let players = this.absences.get(matchId);
    if (!players) {
      players = new Map();
      this.absences.set(matchId, players);
    }
    if (players.has(playerId)) return;

    const absence: Absence = { abandonAt, timer: null };
    players.set(playerId, absence);
    this.arm(matchId, absence);
  }

  private arm(matchId: string, absence: Absence): void {
    // Las pruebas piden la comprobación cuando les conviene (ADR-013, decisión H8).
    if (this.config.environment === 'test') return;
    const delayMs = Math.min(
      Math.max(0, absence.abandonAt.getTime() - this.clock.now().getTime()),
      MAX_DELAY_MS,
    );
    absence.timer = setTimeout(() => {
      absence.timer = null;
      // Un temporizador puede saltar un instante antes de tiempo: se vuelve a poner.
      if (this.clock.now().getTime() < absence.abandonAt.getTime()) {
        this.arm(matchId, absence);
        return;
      }
      this.onDue?.(matchId);
    }, delayMs);
    // Un temporizador pendiente no debe impedir que el proceso termine.
    absence.timer.unref();
  }

  /** El jugador volvió: deja de contar su ausencia. */
  markPresent(matchId: string, playerId: string): void {
    const players = this.absences.get(matchId);
    const absence = players?.get(playerId);
    if (!players || !absence) return;
    if (absence.timer) clearTimeout(absence.timer);
    players.delete(playerId);
    if (players.size === 0) this.absences.delete(matchId);
  }

  /** Cuándo pierde por abandono ese jugador, o `null` si no falta. */
  abandonAtOf(matchId: string, playerId: string): Date | null {
    return this.absences.get(matchId)?.get(playerId)?.abandonAt ?? null;
  }

  /** Los jugadores de la partida cuyo plazo ya venció en `now`. */
  dueAbsentees(matchId: string, now: Date): string[] {
    const players = this.absences.get(matchId);
    if (!players) return [];
    return [...players]
      .filter(([, absence]) => absence.abandonAt.getTime() <= now.getTime())
      .map(([playerId]) => playerId);
  }

  /** Las partidas con algún ausente cuyo plazo ya venció en `now`. */
  dueMatchIds(now: Date): string[] {
    return [...this.absences.keys()].filter(
      (matchId) => this.dueAbsentees(matchId, now).length > 0,
    );
  }

  /** La partida terminó: ya no hay ausencias que contar. */
  forget(matchId: string): void {
    for (const absence of this.absences.get(matchId)?.values() ?? []) {
      if (absence.timer) clearTimeout(absence.timer);
    }
    this.absences.delete(matchId);
  }

  onApplicationShutdown(): void {
    for (const matchId of [...this.absences.keys()]) this.forget(matchId);
  }
}
