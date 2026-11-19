import type {
  MatchAbortReason,
  MatchMode,
  MatchResultView,
  MatchStatus,
  PlayerRef,
  TimeControl,
} from '@gameboard/contracts';

/**
 * Una partida en un instante, tal como está guardada, con lo que ve cada
 * asiento. Es un dato neutral: lo construye quien dirige la partida y lo
 * convierte en mensajes quien conoce a cada destinatario.
 */
export interface MatchSnapshot {
  readonly matchId: string;
  readonly roomId: string;
  readonly gameSlug: string;
  readonly gameVersion: string;
  readonly mode: MatchMode;
  readonly timeControl: TimeControl;
  readonly status: MatchStatus;
  readonly abortReason: MatchAbortReason | null;
  /** Contador de cambios del estado. */
  readonly stateVersion: number;
  /** El jugador de cada asiento: la posición en la lista es el asiento. */
  readonly players: readonly PlayerRef[];
  /** Asientos que pueden jugar ahora. Vacía si la partida no está en curso. */
  readonly activeSeats: readonly number[];
  /** Asientos retirados de una partida que siguió sin ellos (ADR-020, DO18). */
  readonly retiredSeats: readonly number[];
  /** Tiempo que le quedaba a cada asiento, en milisegundos, medido en `turnStartedAt`. */
  readonly clocks: readonly number[];
  /** Desde cuándo corren los relojes de los asientos activos. `null` si ninguno corre. */
  readonly turnStartedAt: Date | null;
  readonly turnDeadlineAt: Date | null;
  /** Lo que ve cada asiento del juego. `null` si el motor no pudo leer el estado. */
  readonly views: readonly unknown[];
  readonly result: MatchResultView | null;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
}
