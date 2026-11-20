/**
 * Cinco a ciegas: los tipos que ven la plataforma y el frontend (ADR-022,
 * decisiones CA2 a CA15).
 *
 * Este archivo contiene solo tipos. Es la entrada `blind-five` del paquete,
 * y el frontend la importa para conocer la forma de las acciones, de los
 * eventos y de la vista sin recibir el código del juego (ADR-014, K7).
 */

/** Nombre corto del juego (ADR-011, convención 9.6). */
export type BlindFiveSlug = 'blind-five';

/**
 * Uno de los cinco palos (CA3). El palo de un número `n` es el resto de
 * `n - 1` entre 5, más uno: 1, 6, 11… son `S1`; 2, 7, 12…, `S2`; y así.
 */
export type BlindFiveSuit = 'S1' | 'S2' | 'S3' | 'S4' | 'S5';

/** Puntos de una ficha: 1, 2 o 3, por tramos de 5 números que se repiten cada 15 (CA3). */
export type BlindFiveDots = 1 | 2 | 3;

/** Una ficha del catálogo: su número, del 1 al 60, su palo y sus puntos. */
export interface BlindFiveTile {
  readonly number: number;
  readonly suit: BlindFiveSuit;
  readonly dots: BlindFiveDots;
}

/**
 * Una ficha de un atril tal como la ve quien mira. Del atril propio, mientras
 * se sigue en juego, solo se ve el palo: el número y los puntos van a `null`.
 */
export interface BlindFiveStandTile {
  readonly suit: BlindFiveSuit;
  readonly number: number | null;
  readonly dots: BlindFiveDots | null;
}

/** El juego no tiene opciones (ADR-019, F3). */
export type BlindFiveSettings = Record<string, never>;

/** Sacar una ficha boca abajo del palo elegido y ponerla boca arriba (CA6). */
export interface BlindFiveRevealAction {
  readonly type: 'REVEAL';
  readonly suit: BlindFiveSuit;
}

/**
 * Pedir una pista sobre una ficha boca arriba (CA6 y CA7).
 *
 * - `SORT`: en cuál de los 6 huecos del atril propio cae.
 * - `COMPARE`: si tiene los mismos puntos que la ficha del atril en `position`
 *   (de 0 a 4, de menor a mayor).
 */
export type BlindFiveClueAction =
  | { readonly type: 'CLUE'; readonly tile: number; readonly clue: 'SORT' }
  | {
      readonly type: 'CLUE';
      readonly tile: number;
      readonly clue: 'COMPARE';
      readonly position: number;
    };

/**
 * Cantar los cinco números propios, de menor a mayor (CA9 y CA10). Se puede
 * en cualquier momento, también fuera de turno, mientras se siga en juego.
 */
export interface BlindFiveDeclareAction {
  readonly type: 'DECLARE';
  readonly numbers: readonly number[];
}

export type BlindFiveAction = BlindFiveRevealAction | BlindFiveClueAction | BlindFiveDeclareAction;

/**
 * Motivos con los que el juego precisa un rechazo `INVALID_ACTION` (CA15).
 *
 * - `MALFORMED_ACTION`: la acción no tiene la forma de `BlindFiveAction`.
 * - `WRONG_STEP`: pedir pista antes de revelar, o revelar después.
 * - `SUIT_EXHAUSTED`: no quedan fichas boca abajo de ese palo.
 * - `TILE_NOT_FACE_UP`: la ficha de la pista no está boca arriba.
 * - `POSITION_OUT_OF_RANGE`: comparar con una posición que no es de 0 a 4.
 * - `INVALID_DECLARATION`: cantar sin cinco números distintos del 1 al 60 en
 *   orden ascendente. No cuenta como intento.
 * - `MUST_DECLARE`: no queda ninguna ficha para revelar ni para pedir pista;
 *   solo se puede cantar (CA12).
 */
export type BlindFiveRejectionReason =
  | 'MALFORMED_ACTION'
  | 'WRONG_STEP'
  | 'SUIT_EXHAUSTED'
  | 'TILE_NOT_FACE_UP'
  | 'POSITION_OUT_OF_RANGE'
  | 'INVALID_DECLARATION'
  | 'MUST_DECLARE';

/**
 * El paso del turno en que está quien tiene el turno.
 *
 * - `REVEAL`: tiene que revelar una ficha.
 * - `CLUE`: tiene que pedir una pista.
 * - `DECLARE_ONLY`: no queda ninguna ficha boca abajo ni boca arriba; solo puede cantar (CA12).
 */
export type BlindFiveStep = 'REVEAL' | 'CLUE' | 'DECLARE_ONLY';

/** Una pista dada, pública (CA8). */
export type BlindFiveClue =
  | {
      /** Quien la pidió, sobre su propio atril. */
      readonly seat: number;
      readonly tile: number;
      readonly clue: 'SORT';
      /** El hueco del atril en que cae la ficha: 0 antes del primer número, 5 después del quinto. */
      readonly slot: number;
    }
  | {
      readonly seat: number;
      readonly tile: number;
      readonly clue: 'COMPARE';
      /** La posición del atril con la que se comparó, de 0 a 4. */
      readonly position: number;
      readonly sameDots: boolean;
    };

/** Por qué un asiento quedó fuera (CA11 y CA13). */
export type BlindFiveOutReason = 'WRONG_DECLARATION' | 'RETIRED';

/** Un intento de cantar, público. */
export interface BlindFiveDeclaration {
  readonly seat: number;
  readonly numbers: readonly number[];
  readonly correct: boolean;
}

/**
 * Los eventos de juego. Son públicos (contrato del motor, M8): ninguno
 * lleva un número de atril que su dueño no deba ver.
 *
 * - `TILE_REVEALED`: un asiento reveló una ficha, que desde ahora es pública.
 * - `CLUE_GIVEN`: el servidor dio una pista.
 * - `DECLARED`: un asiento cantó, y si acertó.
 * - `SEAT_OUT`: un asiento quedó fuera.
 */
export type BlindFiveEvent =
  | { readonly type: 'TILE_REVEALED'; readonly seat: number; readonly tile: number }
  | ({ readonly type: 'CLUE_GIVEN' } & BlindFiveClue)
  | ({ readonly type: 'DECLARED' } & BlindFiveDeclaration)
  | { readonly type: 'SEAT_OUT'; readonly seat: number; readonly reason: BlindFiveOutReason };

/** Lo que se ve de cada asiento. */
export interface BlindFiveSeatView {
  /** Sus cinco fichas, de menor a mayor. */
  readonly stand: readonly BlindFiveStandTile[];
  /** Las pistas que ha recibido, en orden. */
  readonly clues: readonly BlindFiveClue[];
  /** `null` si sigue en juego. */
  readonly out: BlindFiveOutReason | null;
}

/**
 * Lo que un asiento ve del juego (CA15). Nunca lleva los números ni los
 * puntos del atril propio mientras quien mira sigue en juego; quien queda
 * fuera los ve (CA11). Sin asiento, no se ve ningún atril hasta el final.
 */
export interface BlindFiveView {
  readonly playerCount: number;
  /** Las 60 fichas, del 1 al 60, para la hoja de deducción (CA16). */
  readonly catalog: readonly BlindFiveTile[];
  /** A quién le toca. `null` si la partida terminó. */
  readonly turn: number | null;
  /** En qué paso del turno está. `null` si la partida terminó. */
  readonly step: BlindFiveStep | null;
  /** `seats[asiento]`. */
  readonly seats: readonly BlindFiveSeatView[];
  /** Las fichas boca arriba, de menor a mayor. */
  readonly faceUp: readonly BlindFiveTile[];
  /** Las fichas reveladas desde el principio, en orden, incluidas las ya usadas en una pista. */
  readonly revealed: readonly number[];
  /** Cuántas fichas quedan boca abajo de cada palo, de `S1` a `S5`. */
  readonly supplyBySuit: Readonly<Record<BlindFiveSuit, number>>;
  /** Los intentos de cantar, en orden. */
  readonly declarations: readonly BlindFiveDeclaration[];
  /** Quien ganó. `null` mientras se juega. */
  readonly winner: number | null;
}
