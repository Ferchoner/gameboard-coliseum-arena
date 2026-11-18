import type {
  EngineResponse,
  GameEngine,
  GameStatus,
  Rejected,
  SeatResult,
} from '../../contract.js';
import type {
  FourInARowAction,
  FourInARowCell,
  FourInARowEvent,
  FourInARowRejectionReason,
  FourInARowSeat,
  FourInARowSettings,
  FourInARowToken,
  FourInARowView,
} from './types.js';

export const FOUR_IN_A_ROW_SLUG = 'four-in-a-row';
export const FOUR_IN_A_ROW_VERSION = '1.0.0';

export const COLUMN_COUNT = 7;
export const ROW_COUNT = 6;
/** Fichas seguidas que hacen falta para ganar. */
const LINE_LENGTH = 4;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Estado del juego. Es un valor JSON plano, y es interno: la plataforma lo
 * guarda sin interpretarlo y los clientes solo reciben la vista.
 *
 * No guarda nada que se pueda deducir. Quién juega sale del número de
 * fichas, y si alguien ganó, de la última ficha: una línea solo puede
 * aparecer con la ficha que la completa.
 */
export interface FourInARowState {
  /** Las fichas de cada columna, de abajo arriba. `columns[columna][fila]`. */
  readonly columns: readonly (readonly FourInARowSeat[])[];
  /** La última ficha colocada. */
  readonly lastToken: FourInARowToken | null;
  /** El asiento retirado por tiempo agotado, rendición o abandono. */
  readonly retiredSeat: FourInARowSeat | null;
}

/** Las cuatro direcciones en las que se puede alinear: horizontal, vertical y las dos diagonales. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

function isSeat(value: unknown): value is FourInARowSeat {
  return value === 0 || value === 1;
}

function otherSeat(seat: FourInARowSeat): FourInARowSeat {
  return seat === 0 ? 1 : 0;
}

function seatAt(state: FourInARowState, column: number, row: number): FourInARowSeat | null {
  return state.columns[column]?.[row] ?? null;
}

function tokenCount(state: FourInARowState): number {
  return state.columns.reduce((total, column) => total + column.length, 0);
}

/** A quién le toca: empieza el asiento 0 y se alternan. */
function seatToPlay(state: FourInARowState): FourInARowSeat {
  return tokenCount(state) % 2 === 0 ? 0 : 1;
}

/**
 * La línea que completó la última ficha, o `null` si no completó ninguna.
 * Devuelve todas las casillas seguidas de esa línea, que pueden ser más de cuatro.
 */
function winningLine(state: FourInARowState): readonly FourInARowCell[] | null {
  const last = state.lastToken;
  if (!last) return null;

  for (const [stepColumn, stepRow] of DIRECTIONS) {
    // Desde la última ficha, se retrocede hasta el principio de la línea y se recorre entera.
    let column = last.column;
    let row = last.row;
    while (seatAt(state, column - stepColumn, row - stepRow) === last.seat) {
      column -= stepColumn;
      row -= stepRow;
    }
    const line: FourInARowCell[] = [];
    while (seatAt(state, column, row) === last.seat) {
      line.push({ column, row });
      column += stepColumn;
      row += stepRow;
    }
    if (line.length >= LINE_LENGTH) return line;
  }
  return null;
}

/** El resultado de cada asiento. Con `winner` en `null`, empate. */
function results(winner: FourInARowSeat | null): readonly SeatResult[] {
  return ([0, 1] as const).map((seat) => ({
    seat,
    outcome: winner === null ? 'DRAW' : seat === winner ? 'WIN' : 'LOSS',
  }));
}

function statusOf(state: FourInARowState): GameStatus {
  // Un asiento retirado pierde y gana el otro (ADR-009, regla 7.18).
  if (state.retiredSeat !== null) {
    return { finished: true, results: results(otherSeat(state.retiredSeat)) };
  }
  if (state.lastToken && winningLine(state)) {
    return { finished: true, results: results(state.lastToken.seat) };
  }
  if (tokenCount(state) === COLUMN_COUNT * ROW_COUNT) {
    return { finished: true, results: results(null) };
  }
  return { finished: false, activeSeats: [seatToPlay(state)] };
}

function invalidAction(reason: FourInARowRejectionReason): Rejected {
  return { ok: false, code: 'INVALID_ACTION', reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Comprueba que un snapshot guardado es un estado al que se puede llegar jugando. */
function parseState(snapshot: unknown): FourInARowState | null {
  if (!isRecord(snapshot)) return null;
  const { columns, lastToken, retiredSeat } = snapshot;

  if (!Array.isArray(columns) || columns.length !== COLUMN_COUNT) return null;
  for (const column of columns as unknown[]) {
    if (!Array.isArray(column) || column.length > ROW_COUNT || !column.every(isSeat)) return null;
  }
  if (retiredSeat !== null && !isSeat(retiredSeat)) return null;

  const state = { columns, lastToken, retiredSeat } as FourInARowState;

  // Los asientos se alternan y empieza el 0: nunca hay más de una ficha de diferencia.
  const tokens = state.columns.flat();
  const ofSeatZero = tokens.filter((seat) => seat === 0).length;
  const difference = ofSeatZero - (tokens.length - ofSeatZero);
  if (difference !== 0 && difference !== 1) return null;

  if (tokens.length === 0) return lastToken === null ? state : null;

  // La última ficha es la de arriba de su columna, y la puso quien jugó en último lugar.
  if (!isRecord(lastToken)) return null;
  const { column, row, seat } = lastToken;
  if (typeof column !== 'number' || typeof row !== 'number' || !isSeat(seat)) return null;
  const columnTokens = state.columns[column];
  if (!columnTokens || row !== columnTokens.length - 1 || columnTokens[row] !== seat) return null;
  if (seat !== otherSeat(seatToPlay(state))) return null;

  return state;
}

/**
 * Motor de Cuatro en raya, versión 1.0.0.
 *
 * Tablero de 7 columnas por 6 filas. Dos jugadores. Empieza el asiento 0.
 * Gana quien alinea cuatro fichas en horizontal, vertical o diagonal. Si el
 * tablero se llena sin línea, empate.
 */
export const fourInARowEngine: GameEngine<
  FourInARowSettings,
  FourInARowState,
  FourInARowAction,
  FourInARowEvent,
  FourInARowView
> = {
  gameSlug: FOUR_IN_A_ROW_SLUG,
  gameVersion: FOUR_IN_A_ROW_VERSION,

  metadata: {
    minPlayers: 2,
    maxPlayers: 2,
    timeControls: {
      REALTIME: [3, 5, 10].map((minutes) => ({
        type: 'TOTAL_PER_PLAYER',
        totalMs: minutes * MINUTE_MS,
      })),
      // Los controles por turnos no son una regla del juego: se añadieron en
      // la misma versión, sin cambiar reglas ni estado (ADR-016, decisión N1).
      TURN_BASED: [12, 24, 36].map((hours) => ({
        type: 'TOTAL_PER_PLAYER',
        totalMs: hours * HOUR_MS,
      })),
    },
  },

  parseSettings(input): EngineResponse<FourInARowSettings> {
    if (isRecord(input) && Object.keys(input).length === 0) return { ok: true, value: {} };
    return { ok: false, code: 'INVALID_SETTINGS' };
  },

  createInitialState() {
    return {
      columns: Array.from({ length: COLUMN_COUNT }, () => []),
      lastToken: null,
      retiredSeat: null,
    };
  },

  restoreState(snapshot) {
    const state = parseState(snapshot);
    return state ? { ok: true, value: state } : { ok: false, code: 'INVALID_GAME_STATE' };
  },

  getStatus: statusOf,

  applyAction(state, seat, input) {
    const status = statusOf(state);
    if (status.finished) return { ok: false, code: 'GAME_ALREADY_FINISHED' };
    if (!status.activeSeats.includes(seat) || !isSeat(seat)) {
      return { ok: false, code: 'NOT_YOUR_TURN' };
    }

    if (!isRecord(input) || input.type !== 'DROP_TOKEN' || !Number.isInteger(input.column)) {
      return invalidAction('MALFORMED_ACTION');
    }
    const column = input.column as number;
    const tokens = state.columns[column];
    if (!tokens) return invalidAction('COLUMN_OUT_OF_RANGE');
    if (tokens.length >= ROW_COUNT) return invalidAction('COLUMN_FULL');

    const token: FourInARowToken = { seat, column, row: tokens.length };
    return {
      ok: true,
      value: {
        state: {
          ...state,
          columns: state.columns.map((one, index) => (index === column ? [...one, seat] : one)),
          lastToken: token,
        },
        action: { type: 'DROP_TOKEN', column },
        events: [{ type: 'TOKEN_DROPPED', ...token }],
      },
    };
  },

  retireSeat(state, seat) {
    return { state: { ...state, retiredSeat: isSeat(seat) ? seat : null }, events: [] };
  },

  getView(state) {
    const finished = statusOf(state).finished;
    return {
      columnCount: COLUMN_COUNT,
      rowCount: ROW_COUNT,
      cells: state.columns.map((tokens) =>
        Array.from({ length: ROW_COUNT }, (_, row) => tokens[row] ?? null),
      ),
      playableColumns: finished
        ? []
        : state.columns.flatMap((tokens, column) => (tokens.length < ROW_COUNT ? [column] : [])),
      lastToken: state.lastToken,
      winningLine: winningLine(state),
    };
  },
};
