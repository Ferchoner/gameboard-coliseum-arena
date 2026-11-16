/**
 * Cuatro en raya: los tipos que ven la plataforma y el frontend (ADR-014,
 * decisión K6).
 *
 * Este archivo contiene solo tipos. Es la entrada `four-in-a-row` del
 * paquete, y el frontend la importa para conocer la forma de la acción, del
 * evento y de la vista sin recibir el código del juego (decisión K7).
 */

/** Nombre corto y versión del juego (ADR-011, convención 9.6). */
export type FourInARowSlug = 'four-in-a-row';

/** El juego es de dos: los asientos son 0 y 1. Empieza siempre el 0. */
export type FourInARowSeat = 0 | 1;

/** Una casilla del tablero. La fila 0 es la de abajo. */
export interface FourInARowCell {
  readonly column: number;
  readonly row: number;
}

/** Una ficha colocada: la casilla y el asiento que la puso. */
export interface FourInARowToken extends FourInARowCell {
  readonly seat: FourInARowSeat;
}

/** El juego no tiene opciones. */
export type FourInARowSettings = Record<string, never>;

/** La única acción: soltar una ficha en una columna, de 0 a 6. */
export interface FourInARowAction {
  readonly type: 'DROP_TOKEN';
  readonly column: number;
}

/**
 * Motivos con los que el juego precisa un rechazo `INVALID_ACTION`.
 *
 * - `MALFORMED_ACTION`: la acción no tiene la forma de `FourInARowAction`.
 * - `COLUMN_OUT_OF_RANGE`: la columna no existe.
 * - `COLUMN_FULL`: la columna ya tiene sus seis fichas.
 */
export type FourInARowRejectionReason = 'MALFORMED_ACTION' | 'COLUMN_OUT_OF_RANGE' | 'COLUMN_FULL';

/** El único evento de juego: alguien colocó una ficha. */
export interface FourInARowEvent extends FourInARowToken {
  readonly type: 'TOKEN_DROPPED';
}

/**
 * Lo que se ve del juego. No hay información oculta: todos los asientos, y
 * quien no ocupa ninguno, ven lo mismo.
 */
export interface FourInARowView {
  readonly columnCount: number;
  readonly rowCount: number;
  /** `cells[columna][fila]`, con la fila 0 abajo. `null` si la casilla está vacía. */
  readonly cells: readonly (readonly (FourInARowSeat | null)[])[];
  /** Columnas en las que cabe una ficha. Vacía si el juego terminó. */
  readonly playableColumns: readonly number[];
  /** La última ficha colocada. */
  readonly lastToken: FourInARowToken | null;
  /** Las casillas de la línea ganadora, en orden. `null` si nadie ha alineado cuatro. */
  readonly winningLine: readonly FourInARowCell[] | null;
}
