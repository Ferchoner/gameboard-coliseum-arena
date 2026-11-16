/**
 * Catálogo de errores de la plataforma.
 *
 * Es la lista única de códigos que leen el backend y el frontend. Su
 * significado y las decisiones que la fijan están en
 * `contracts/04-error-catalog.md`. Una prueba comprueba que esta lista y
 * ese documento coinciden.
 */

/** Qué hace el cliente con un código (catálogo de errores, decisión E5). */
export type ErrorReaction = 'FIX' | 'SIGN_IN' | 'REFRESH' | 'INFORM' | 'WAIT' | 'BUG';

export interface ErrorCodeInfo {
  /** Estado HTTP con el que el código aparece en la API, o `null` si no aparece en ella. */
  readonly httpStatus: number | null;
  /** Puede llegar en un `COMMAND_REJECTED` del canal de tiempo real. */
  readonly realtime: boolean;
  /** Lo emite el motor de juego. */
  readonly engine: boolean;
  /** `null` en los dos códigos del motor que nunca llegan al cliente (decisión E3). */
  readonly reaction: ErrorReaction | null;
}

export const ERROR_CATALOG = {
  // Generales
  VALIDATION_ERROR: { httpStatus: 400, realtime: false, engine: false, reaction: 'FIX' },
  INVALID_MESSAGE: { httpStatus: null, realtime: true, engine: false, reaction: 'BUG' },
  UNAUTHENTICATED: { httpStatus: 401, realtime: false, engine: false, reaction: 'SIGN_IN' },
  FORBIDDEN: { httpStatus: 403, realtime: false, engine: false, reaction: 'INFORM' },
  ORIGIN_NOT_ALLOWED: { httpStatus: 403, realtime: false, engine: false, reaction: 'BUG' },
  ROUTE_NOT_FOUND: { httpStatus: 404, realtime: false, engine: false, reaction: 'BUG' },
  METHOD_NOT_ALLOWED: { httpStatus: 405, realtime: false, engine: false, reaction: 'BUG' },
  PAYLOAD_TOO_LARGE: { httpStatus: 413, realtime: false, engine: false, reaction: 'BUG' },
  RATE_LIMITED: { httpStatus: 429, realtime: true, engine: false, reaction: 'WAIT' },
  INTERNAL_ERROR: { httpStatus: 500, realtime: true, engine: false, reaction: 'WAIT' },

  // Autenticación y cuenta
  EMAIL_TAKEN: { httpStatus: 409, realtime: false, engine: false, reaction: 'FIX' },
  USERNAME_TAKEN: { httpStatus: 409, realtime: false, engine: false, reaction: 'FIX' },
  INVALID_CREDENTIALS: { httpStatus: 401, realtime: false, engine: false, reaction: 'FIX' },
  ACCOUNT_SUSPENDED: { httpStatus: 403, realtime: false, engine: false, reaction: 'INFORM' },
  INVALID_RESET_TOKEN: { httpStatus: 400, realtime: false, engine: false, reaction: 'INFORM' },
  INVALID_CURRENT_PASSWORD: { httpStatus: 400, realtime: false, engine: false, reaction: 'FIX' },

  // Jugadores y catálogo
  PLAYER_NOT_FOUND: { httpStatus: 404, realtime: false, engine: false, reaction: 'INFORM' },
  GAME_NOT_FOUND: { httpStatus: 404, realtime: false, engine: false, reaction: 'INFORM' },

  // Salas
  ROOM_NOT_FOUND: { httpStatus: 404, realtime: true, engine: false, reaction: 'INFORM' },
  PLAYER_NOT_IN_ROOM: { httpStatus: 403, realtime: true, engine: false, reaction: 'REFRESH' },
  ROOM_NOT_WAITING: { httpStatus: 409, realtime: false, engine: false, reaction: 'REFRESH' },
  ROOM_FULL: { httpStatus: 409, realtime: false, engine: false, reaction: 'REFRESH' },
  ROOM_IN_MATCH: { httpStatus: 409, realtime: false, engine: false, reaction: 'INFORM' },
  MATCH_LIMIT_REACHED: { httpStatus: 409, realtime: false, engine: false, reaction: 'INFORM' },
  UNSUPPORTED_ROOM_OPTIONS: { httpStatus: 400, realtime: false, engine: false, reaction: 'FIX' },
  INVALID_SETTINGS: { httpStatus: 400, realtime: false, engine: true, reaction: 'FIX' },

  // Partidas y juego
  MATCH_NOT_FOUND: { httpStatus: 404, realtime: true, engine: false, reaction: 'INFORM' },
  PLAYER_NOT_IN_MATCH: { httpStatus: 403, realtime: true, engine: false, reaction: 'INFORM' },
  MATCH_NOT_IN_PROGRESS: { httpStatus: 409, realtime: true, engine: false, reaction: 'REFRESH' },
  STALE_STATE_VERSION: { httpStatus: null, realtime: true, engine: false, reaction: 'REFRESH' },
  CLOCK_EXPIRED: { httpStatus: null, realtime: true, engine: false, reaction: 'REFRESH' },
  NOT_YOUR_TURN: { httpStatus: null, realtime: true, engine: true, reaction: 'REFRESH' },
  INVALID_ACTION: { httpStatus: null, realtime: true, engine: true, reaction: 'FIX' },
  GAME_ALREADY_FINISHED: { httpStatus: null, realtime: false, engine: true, reaction: null },
  INVALID_GAME_STATE: { httpStatus: null, realtime: false, engine: true, reaction: null },

  // Administración
  USER_NOT_FOUND: { httpStatus: 404, realtime: false, engine: false, reaction: 'INFORM' },
  CANNOT_CHANGE_OWN_STATUS: { httpStatus: 409, realtime: false, engine: false, reaction: 'INFORM' },
  GAME_VERSION_NOT_FOUND: { httpStatus: 404, realtime: false, engine: false, reaction: 'INFORM' },
  ENGINE_NOT_REGISTERED: { httpStatus: 409, realtime: false, engine: false, reaction: 'INFORM' },
  GAME_VERSION_IS_CURRENT: { httpStatus: 409, realtime: false, engine: false, reaction: 'INFORM' },
  GAME_VERSION_NOT_ACTIVE: { httpStatus: 409, realtime: false, engine: false, reaction: 'INFORM' },} as const satisfies Record<string, ErrorCodeInfo>;

/** Cualquier código del catálogo. */
export type ErrorCode = keyof typeof ERROR_CATALOG;

export const ERROR_CODES = Object.keys(ERROR_CATALOG) as readonly ErrorCode[];

/** Códigos que pueden aparecer en una respuesta de la API. */
export type ApiErrorCode = {
  [Code in ErrorCode]: (typeof ERROR_CATALOG)[Code]['httpStatus'] extends number ? Code : never;
}[ErrorCode];

export const API_ERROR_CODES = ERROR_CODES.filter(
  (code): code is ApiErrorCode => ERROR_CATALOG[code].httpStatus !== null,
);

/** Estado HTTP de un código de la API. Es fijo para cada código. */
export function httpStatusOf(code: ApiErrorCode): number {
  return ERROR_CATALOG[code].httpStatus;
}

/** Reglas que puede incumplir un campo en un `VALIDATION_ERROR` (decisión E7). */
export const VALIDATION_RULES = [
  'REQUIRED',
  'INVALID_FORMAT',
  'TOO_SHORT',
  'TOO_LONG',
  'OUT_OF_RANGE',
] as const;

export type ValidationRule = (typeof VALIDATION_RULES)[number];

export interface ValidationField {
  readonly field: string;
  readonly rule: ValidationRule;
}
