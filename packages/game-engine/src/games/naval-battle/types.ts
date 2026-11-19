/**
 * Batalla naval: los tipos que ven la plataforma y el frontend (ADR-019,
 * decisiones X1 a X11).
 *
 * Este archivo contiene solo tipos. Es la entrada `naval-battle` del
 * paquete, y el frontend la importa para conocer la forma de las acciones,
 * de los eventos y de la vista sin recibir el código del juego (ADR-014,
 * decisión K7).
 */

/** Nombre corto del juego (ADR-011, convención 9.6). */
export type NavalBattleSlug = 'naval-battle';

/** El juego es de dos: los asientos son 0 y 1. Dispara primero el 0. */
export type NavalBattleSeat = 0 | 1;

/**
 * Los cinco barcos de cada flota: uno de 5 casillas, uno de 4, dos de 3 y
 * uno de 2 (X3).
 */
export type NavalBattleShipId = 'S5' | 'S4' | 'S3A' | 'S3B' | 'S2';

/** Una casilla de la cuadrícula: fila y columna, de 0 a 9 (X2). */
export interface NavalBattleCell {
  readonly row: number;
  readonly col: number;
}

/** `H`: hacia la derecha desde su casilla; `V`: hacia abajo. */
export type NavalBattleOrientation = 'H' | 'V';

/** Un barco colocado: su casilla de inicio y su orientación. */
export interface NavalBattlePlacement extends NavalBattleCell {
  readonly ship: NavalBattleShipId;
  readonly orientation: NavalBattleOrientation;
}

/** El juego no tiene opciones (ADR-019, F3). */
export type NavalBattleSettings = Record<string, never>;

/** Colocar la flota entera, una sola vez (X5). */
export interface NavalBattlePlaceFleetAction {
  readonly type: 'PLACE_FLEET';
  readonly ships: readonly NavalBattlePlacement[];
}

/** Disparar a una casilla de la cuadrícula del rival (X7). */
export interface NavalBattleFireAction extends NavalBattleCell {
  readonly type: 'FIRE';
}

export type NavalBattleAction = NavalBattlePlaceFleetAction | NavalBattleFireAction;

/**
 * Motivos con los que el juego precisa un rechazo `INVALID_ACTION` (X11).
 *
 * - `MALFORMED_ACTION`: la acción no tiene la forma de `NavalBattleAction`.
 * - `WRONG_PHASE`: disparar durante la colocación, o colocar durante los disparos.
 * - `INVALID_FLEET`: falta un barco, sobra uno o uno se repite.
 * - `SHIP_OUT_OF_BOUNDS`: un barco se sale de la cuadrícula.
 * - `SHIPS_OVERLAP`: dos barcos comparten casilla.
 * - `SHIPS_TOUCHING`: dos barcos se tocan, también en diagonal (X4).
 * - `CELL_OUT_OF_RANGE`: disparo fuera de la cuadrícula.
 * - `CELL_ALREADY_FIRED`: ya se disparó a esa casilla.
 */
export type NavalBattleRejectionReason =
  | 'MALFORMED_ACTION'
  | 'WRONG_PHASE'
  | 'INVALID_FLEET'
  | 'SHIP_OUT_OF_BOUNDS'
  | 'SHIPS_OVERLAP'
  | 'SHIPS_TOUCHING'
  | 'CELL_OUT_OF_RANGE'
  | 'CELL_ALREADY_FIRED';

/** Lo que dio un disparo. */
export type NavalBattleShotResult = 'MISS' | 'HIT' | 'SUNK';

/**
 * Los eventos de juego. Son públicos (contrato del motor, M8), así que
 * ninguno dice dónde está un barco sin hundir.
 *
 * - `FLEET_PLACED`: un asiento colocó su flota. Sin posiciones.
 * - `SHOT_FIRED`: un asiento disparó a la cuadrícula del otro, con el resultado.
 * - `SHIP_SUNK`: se hundió un barco; `seat` es su dueño y `cells`, sus casillas,
 *   que desde ahora son públicas (X8).
 */
export type NavalBattleEvent =
  | { readonly type: 'FLEET_PLACED'; readonly seat: NavalBattleSeat }
  | ({
      readonly type: 'SHOT_FIRED';
      readonly seat: NavalBattleSeat;
      readonly result: NavalBattleShotResult;
    } & NavalBattleCell)
  | {
      readonly type: 'SHIP_SUNK';
      readonly seat: NavalBattleSeat;
      readonly ship: NavalBattleShipId;
      readonly cells: readonly NavalBattleCell[];
    };

/** `PLACEMENT`: los dos colocan a la vez. `FIRING`: disparan por turnos. */
export type NavalBattlePhase = 'PLACEMENT' | 'FIRING';

/** Un barco con sus casillas. */
export interface NavalBattleShipView {
  readonly ship: NavalBattleShipId;
  readonly cells: readonly NavalBattleCell[];
}

/** Un disparo recibido en una cuadrícula, con su resultado. */
export interface NavalBattleShotView extends NavalBattleCell {
  readonly result: NavalBattleShotResult;
}

/** La cuadrícula de un asiento, tal como la ve quien mira. */
export interface NavalBattleGridView {
  /** Si su dueño ya colocó la flota. */
  readonly placed: boolean;
  /**
   * Los barcos de esta cuadrícula. Solo en la propia de quien mira, y solo
   * si ya los colocó; en las demás, `null` (X10).
   */
  readonly ships: readonly NavalBattleShipView[] | null;
  /** Los barcos ya hundidos de esta cuadrícula, que ve todo el mundo. */
  readonly sunk: readonly NavalBattleShipView[];
  /** Los disparos que ha recibido, en orden. */
  readonly shots: readonly NavalBattleShotView[];
}

/**
 * Lo que se ve del juego. Nunca lleva la posición de un barco rival sin
 * hundir; la vista de quien no ocupa asiento no lleva ninguna flota.
 */
export interface NavalBattleView {
  /** Lado de la cuadrícula: 10. */
  readonly size: number;
  /** Los barcos de cada flota y su tamaño, en el orden en que se colocan. */
  readonly fleet: readonly { readonly ship: NavalBattleShipId; readonly size: number }[];
  readonly phase: NavalBattlePhase;
  /** `grids[asiento]`: la cuadrícula de ese asiento. */
  readonly grids: readonly NavalBattleGridView[];
  /** El último disparo, para señalarlo. `null` si aún no hay ninguno. */
  readonly lastShot: ({ readonly seat: NavalBattleSeat } & NavalBattleCell) | null;
}
