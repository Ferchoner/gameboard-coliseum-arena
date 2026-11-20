/**
 * Dominó: los tipos que ven la plataforma y el frontend (ADR-020,
 * decisiones DO1 a DO14).
 *
 * Este archivo contiene solo tipos. Es la entrada `dominoes` del paquete, y
 * el frontend la importa para conocer la forma de las acciones, de los
 * eventos y de la vista sin recibir el código del juego (ADR-014, K7).
 */

/** Nombre corto del juego (ADR-011, convención 9.6). */
export type DominoesSlug = 'dominoes';

/**
 * Una ficha: sus dos lados, de 0 a 6. En la mano, en el pozo y en los
 * eventos va con el lado menor primero, `[2, 5]`. En la línea va orientada
 * como se dibuja, de izquierda a derecha.
 */
export type DominoesTile = readonly [number, number];

/** Extremo de la línea en el que se pone una ficha. */
export type DominoesEnd = 'LEFT' | 'RIGHT';

/** El juego no tiene opciones (ADR-019, F3). */
export type DominoesSettings = Record<string, never>;

/**
 * Jugar una ficha en un extremo (DO13). Los lados pueden ir en cualquier
 * orden. `end` solo hace falta si la ficha cabe en los dos extremos y estos
 * son distintos; en la primera ficha de la mano no se usa.
 */
export interface DominoesPlayAction {
  readonly type: 'PLAY';
  readonly tile: DominoesTile;
  readonly end?: DominoesEnd;
}

export type DominoesAction = DominoesPlayAction;

/**
 * Motivos con los que el juego precisa un rechazo `INVALID_ACTION`.
 *
 * - `MALFORMED_ACTION`: la acción no tiene la forma de `DominoesAction`.
 * - `TILE_NOT_IN_HAND`: esa ficha no está en la mano de quien juega.
 * - `WRONG_OPENING_TILE`: en la primera mano hay que salir con el doble más
 *   alto o, sin dobles, con la ficha de más puntos (DO5).
 * - `TILE_DOES_NOT_FIT`: la ficha no casa con ese extremo, o con ninguno.
 * - `END_REQUIRED`: la ficha cabe en los dos extremos y falta decir en cuál.
 */
export type DominoesRejectionReason =
  | 'MALFORMED_ACTION'
  | 'TILE_NOT_IN_HAND'
  | 'WRONG_OPENING_TILE'
  | 'TILE_DOES_NOT_FIT'
  | 'END_REQUIRED';

/**
 * Cómo terminó una mano (DO8).
 *
 * - `DOMINO`: alguien se quedó sin fichas.
 * - `BLOCKED`: tranque; ganó quien (o la pareja que) sumaba menos.
 * - `BLOCKED_TIE`: tranque con empate en lo más bajo; nadie anota.
 */
export type DominoesHandEnding = 'DOMINO' | 'BLOCKED' | 'BLOCKED_TIE';

/** El resumen de una mano terminada. Al terminar, las fichas que quedaban pasan a ser públicas. */
export interface DominoesHandSummary {
  /** Número de mano, desde 1. */
  readonly number: number;
  readonly ending: DominoesHandEnding;
  /** Quien ganó la mano y sale en la siguiente. `null` en un tranque empatado. */
  readonly winner: number | null;
  /** Los puntos que anotó quien ganó (o su pareja). 0 en un tranque empatado. */
  readonly points: number;
  /** `hands[asiento]`: las fichas que le quedaban. Vacía para un retirado. */
  readonly hands: readonly (readonly DominoesTile[])[];
}

/**
 * Los eventos de juego. Son públicos (contrato del motor, M8): ninguno dice
 * qué fichas tiene un jugador hasta que la mano termina (DO13).
 *
 * - `TILE_PLAYED`: un asiento puso una ficha en un extremo.
 * - `TILES_DRAWN`: el motor robó por un asiento; solo cuántas (DO7).
 * - `PASSED`: un asiento no pudo jugar y pasó.
 * - `HAND_ENDED`: terminó una mano, con su resumen.
 * - `HAND_STARTED`: empezó una mano, y quién sale.
 * - `SEAT_RETIRED`: un asiento se retiró (DO11).
 */
export type DominoesEvent =
  | {
      readonly type: 'TILE_PLAYED';
      readonly seat: number;
      readonly tile: DominoesTile;
      readonly end: DominoesEnd;
    }
  | { readonly type: 'TILES_DRAWN'; readonly seat: number; readonly count: number }
  | { readonly type: 'PASSED'; readonly seat: number }
  | ({ readonly type: 'HAND_ENDED' } & DominoesHandSummary)
  | { readonly type: 'HAND_STARTED'; readonly number: number; readonly leader: number }
  | { readonly type: 'SEAT_RETIRED'; readonly seat: number };

/** Una ficha de la mano propia que se puede jugar ahora, y en qué extremos. */
export interface DominoesPlayable {
  readonly tile: DominoesTile;
  /** Uno o dos extremos. Con dos, el tablero pregunta en cuál (DO16). */
  readonly ends: readonly DominoesEnd[];
}

/**
 * Lo que un asiento ve del juego (DO14). Nunca lleva las fichas de otro
 * asiento ni las del pozo, salvo las que quedaban al terminar una mano.
 */
export interface DominoesView {
  readonly playerCount: number;
  /** A cuántos puntos se juega: 100 (F6). */
  readonly target: number;
  /** Con 4 jugadores, las parejas: `[[0, 2], [1, 3]]`. Si no, `null` (DO3). */
  readonly teams: readonly (readonly number[])[] | null;
  /** Número de la mano en juego, o de la última si la partida terminó. */
  readonly handNumber: number;
  /** Quien salió en esta mano. */
  readonly leader: number;
  /** A quién le toca. `null` si la partida terminó. */
  readonly turn: number | null;
  /** La línea, de izquierda a derecha, con cada ficha orientada como se dibuja. */
  readonly line: readonly DominoesTile[];
  /** Los dos extremos de la línea. `null` si aún no hay fichas. */
  readonly ends: { readonly left: number; readonly right: number } | null;
  /** Cuántas fichas quedan en el pozo. */
  readonly boneyardCount: number;
  /** `tileCounts[asiento]`: cuántas fichas tiene en la mano. 0 para un retirado. */
  readonly tileCounts: readonly number[];
  /** La mano de quien mira, ordenada. `null` para quien no ocupa asiento o se retiró. */
  readonly hand: readonly DominoesTile[] | null;
  /**
   * Las fichas que quien mira puede jugar ahora, con sus extremos. Vacía si
   * no le toca. Es una ayuda para el tablero: quien decide es el servidor.
   */
  readonly playable: readonly DominoesPlayable[];
  /** `scores[asiento]`: sus puntos. Con parejas, los dos tienen los mismos. */
  readonly scores: readonly number[];
  /** Los asientos retirados, en el orden en que se retiraron. */
  readonly retiredSeats: readonly number[];
  /** El resumen de la última mano terminada. `null` en la primera. */
  readonly lastHand: DominoesHandSummary | null;
}
