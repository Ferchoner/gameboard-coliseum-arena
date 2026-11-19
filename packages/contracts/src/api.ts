/**
 * API REST, versión 1: tipos y esquemas de validación.
 *
 * El contrato de la API es el archivo `contracts/01-rest-api.yaml`. Este
 * módulo lo expresa en código (ADR-012, decisiones S6 y S7):
 *
 * - Cada esquema valida en ejecución y da su tipo.
 * - Las vistas que la API comparte con el protocolo de tiempo real (sala,
 *   partida y resumen de partida) tienen su tipo en `realtime.ts`. Aquí
 *   solo se les añade el esquema, atado a ese tipo en compilación.
 * - Una prueba compara cada esquema con el del archivo OpenAPI.
 */
import { z } from 'zod';
import type { ApiErrorCode } from './errors.js';
import { API_ERROR_CODES } from './errors.js';
import type {
  MatchPlayerView,
  MatchResultView,
  MatchSummaryView,
  MatchView,
  RoomMemberView,
  RoomView,
  TimeControl,
} from './realtime.js';
import {
  CATALOG_STATUSES,
  MATCH_ABORT_REASONS,
  MATCH_END_REASONS,
  MATCH_MODES,
  MATCH_STATUSES,
  ROOM_CLOSE_REASONS,
  ROOM_STATUSES,
  SEAT_OUTCOMES,
  TIME_CONTROL_TYPES,
  USER_ROLES,
  USER_STATUSES,
} from './values.js';

/** Ruta base de la API. El número es la `apiVersion` (ADR-011, 9.10). */
export const API_BASE_PATH = '/api/v1';

// ---------------------------------------------------------------------------
// Sobre de respuesta
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  readonly success: true;
  readonly data: T;
}

export interface ApiError {
  readonly code: ApiErrorCode;
  /** Texto para quien desarrolla. No se muestra al usuario. */
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface ApiFailure {
  readonly success: false;
  readonly error: ApiError;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Lista completa, sin paginar. */
export interface ItemList<T> {
  readonly items: readonly T[];
}

/** Página de una lista paginada por cursor. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------------

const uuid = z.uuid();
const dateTime = z.iso.datetime();
const seat = z.int().min(0);

/** Límites de los datos de una cuenta (API, decisión A14). */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const DISPLAY_NAME_MAX_LENGTH = 30;
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const BIOGRAPHY_MAX_LENGTH = 280;
export const EMAIL_MAX_LENGTH = 254;

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_]+$/);

export const displayNameSchema = z.string().min(1).max(DISPLAY_NAME_MAX_LENGTH);

export const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const matchModeSchema = z.enum(MATCH_MODES);
export const roomStatusSchema = z.enum(ROOM_STATUSES);
export const roomCloseReasonSchema = z.enum(ROOM_CLOSE_REASONS);
export const matchStatusSchema = z.enum(MATCH_STATUSES);
export const matchAbortReasonSchema = z.enum(MATCH_ABORT_REASONS);
export const matchEndReasonSchema = z.enum(MATCH_END_REASONS);
export const seatOutcomeSchema = z.enum(SEAT_OUTCOMES);
export const userRoleSchema = z.enum(USER_ROLES);
export const userStatusSchema = z.enum(USER_STATUSES);
export const catalogStatusSchema = z.enum(CATALOG_STATUSES);
export const errorCodeSchema = z.enum(API_ERROR_CODES as [ApiErrorCode, ...ApiErrorCode[]]);

export const timeControlSchema = z.strictObject({
  type: z.enum(TIME_CONTROL_TYPES),
  totalMs: z.int().min(1),
}) satisfies z.ZodType<TimeControl>;

export const errorResponseSchema = z.strictObject({
  success: z.literal(false),
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

// ---------------------------------------------------------------------------
// Cuenta y jugadores
// ---------------------------------------------------------------------------

/** La persona que ha iniciado sesión: su cuenta, su perfil y su jugador. */
export const meSchema = z.strictObject({
  userId: uuid,
  playerId: uuid,
  email: z.email(),
  username: usernameSchema,
  displayName: displayNameSchema,
  avatarUrl: z.url().nullable(),
  biography: z.string().max(BIOGRAPHY_MAX_LENGTH).nullable(),
  role: userRoleSchema,
  createdAt: dateTime,
});
export type Me = z.infer<typeof meSchema>;

export const playerRefSchema = z.strictObject({
  playerId: uuid,
  username: usernameSchema,
  displayName: displayNameSchema,
});
export type PlayerRef = z.infer<typeof playerRefSchema>;

/** Lo que cualquiera con sesión puede ver de un jugador. */
export const publicPlayerSchema = z.strictObject({
  playerId: uuid,
  username: usernameSchema,
  displayName: displayNameSchema,
  avatarUrl: z.url().nullable(),
  biography: z.string().max(BIOGRAPHY_MAX_LENGTH).nullable(),
});
export type PublicPlayer = z.infer<typeof publicPlayerSchema>;

export const playerGameStatisticsSchema = z.strictObject({
  gameSlug: z.string(),
  played: z.int().min(0),
  wins: z.int().min(0),
  losses: z.int().min(0),
  draws: z.int().min(0),
});
export type PlayerGameStatistics = z.infer<typeof playerGameStatisticsSchema>;

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/** Un juego del catálogo, con lo que declara el motor de su versión vigente. */
export const gameSchema = z.strictObject({
  gameSlug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  gameVersion: z.string(),
  minPlayers: z.int().min(1),
  maxPlayers: z.int().min(1),
  timeControls: z.strictObject({
    REALTIME: z.array(timeControlSchema),
    TURN_BASED: z.array(timeControlSchema),
  }),
});
export type Game = z.infer<typeof gameSchema>;

// ---------------------------------------------------------------------------
// Salas
// ---------------------------------------------------------------------------

export const roomSummarySchema = z.strictObject({
  roomId: uuid,
  gameSlug: z.string(),
  mode: matchModeSchema,
  timeControl: timeControlSchema,
  maxPlayers: z.int(),
  memberCount: z.int(),
  rematchEnabled: z.boolean(),
  status: roomStatusSchema,
  owner: playerRefSchema,
  createdAt: dateTime,
});
export type RoomSummary = z.infer<typeof roomSummarySchema>;

export const roomMemberSchema = z.strictObject({
  playerId: uuid,
  username: usernameSchema,
  displayName: displayNameSchema,
  ready: z.boolean(),
  connected: z.boolean(),
  joinedAt: dateTime,
}) satisfies z.ZodType<RoomMemberView>;

export const roomViewSchema = z.strictObject({
  roomId: uuid,
  gameSlug: z.string(),
  mode: matchModeSchema,
  timeControl: timeControlSchema,
  maxPlayers: z.int(),
  rematchEnabled: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
  status: roomStatusSchema,
  closeReason: roomCloseReasonSchema.nullable(),
  ownerPlayerId: uuid,
  members: z.array(roomMemberSchema),
  currentMatchId: uuid.nullable(),
}) satisfies z.ZodType<RoomView>;

// ---------------------------------------------------------------------------
// Partidas
// ---------------------------------------------------------------------------

export const matchPlayerSchema = z.strictObject({
  seat,
  playerId: uuid,
  username: usernameSchema,
  displayName: displayNameSchema,
  connected: z.boolean(),
  clockRemainingMs: z.int(),
  abandonAt: dateTime.nullable(),
  retired: z.boolean(),
}) satisfies z.ZodType<MatchPlayerView>;

export const matchResultSchema = z.strictObject({
  reason: matchEndReasonSchema,
  seats: z.array(
    z.strictObject({
      seat,
      outcome: seatOutcomeSchema,
      score: z.int().exactOptional(),
    }),
  ),
}) satisfies z.ZodType<MatchResultView>;

export const matchViewSchema = z.strictObject({
  matchId: uuid,
  roomId: uuid,
  gameSlug: z.string(),
  gameVersion: z.string(),
  mode: matchModeSchema,
  timeControl: timeControlSchema,
  status: matchStatusSchema,
  stateVersion: z.int().min(0),
  yourSeat: seat,
  players: z.array(matchPlayerSchema),
  activeSeats: z.array(seat),
  turnDeadlineAt: dateTime.nullable(),
  view: z.unknown(),
  result: matchResultSchema.nullable(),
  abortReason: matchAbortReasonSchema.nullable(),
  startedAt: dateTime,
  endedAt: dateTime.nullable(),
}) satisfies z.ZodType<MatchView>;

export const matchSummarySchema = z.strictObject({
  matchId: uuid,
  roomId: uuid,
  gameSlug: z.string(),
  mode: matchModeSchema,
  status: matchStatusSchema,
  yourTurn: z.boolean(),
  turnDeadlineAt: dateTime.nullable(),
  opponents: z.array(playerRefSchema),
  yourOutcome: seatOutcomeSchema.nullable(),
  endReason: matchEndReasonSchema.nullable(),
  startedAt: dateTime,
  endedAt: dateTime.nullable(),
}) satisfies z.ZodType<MatchSummaryView>;

// ---------------------------------------------------------------------------
// Administración
// ---------------------------------------------------------------------------

export const adminUserSchema = z.strictObject({
  userId: uuid,
  playerId: uuid,
  email: z.email(),
  username: usernameSchema,
  displayName: displayNameSchema,
  role: userRoleSchema,
  status: userStatusSchema,
  createdAt: dateTime,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminGameVersionSchema = z.strictObject({
  gameVersion: z.string(),
  status: catalogStatusSchema,
  isCurrent: z.boolean(),
  engineRegistered: z.boolean(),
  releasedAt: dateTime.nullable(),
});
export type AdminGameVersion = z.infer<typeof adminGameVersionSchema>;

export const adminGameSchema = z.strictObject({
  gameSlug: z.string(),
  name: z.string(),
  status: catalogStatusSchema,
  versions: z.array(adminGameVersionSchema),
});
export type AdminGame = z.infer<typeof adminGameSchema>;

// ---------------------------------------------------------------------------
// Cuerpos de petición
// ---------------------------------------------------------------------------

export const registerRequestSchema = z.strictObject({
  email: z.email().max(EMAIL_MAX_LENGTH),
  username: usernameSchema,
  password: newPasswordSchema,
  /** Si falta, se usa el nombre de usuario. */
  displayName: displayNameSchema.exactOptional(),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.strictObject({
  username: z.string(),
  password: z.string(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const passwordResetRequestSchema = z.strictObject({
  email: z.email(),
});
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmRequestSchema = z.strictObject({
  token: z.string(),
  newPassword: newPasswordSchema,
});
export type PasswordResetConfirmRequest = z.infer<typeof passwordResetConfirmRequestSchema>;

export const changePasswordRequestSchema = z.strictObject({
  currentPassword: z.string(),
  newPassword: newPasswordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

export const updateMeRequestSchema = z.strictObject({
  displayName: displayNameSchema.exactOptional(),
  biography: z.string().max(BIOGRAPHY_MAX_LENGTH).nullable().exactOptional(),
});
export type UpdateMeRequest = z.infer<typeof updateMeRequestSchema>;

export const createRoomRequestSchema = z.strictObject({
  gameSlug: z.string(),
  mode: matchModeSchema,
  timeControl: timeControlSchema,
  maxPlayers: z.int().min(1),
  rematchEnabled: z.boolean().default(false),
  settings: z.record(z.string(), z.unknown()).exactOptional(),
});
export type CreateRoomRequest = z.infer<typeof createRoomRequestSchema>;

export const setReadyRequestSchema = z.strictObject({
  ready: z.boolean(),
});
export type SetReadyRequest = z.infer<typeof setReadyRequestSchema>;

/** Tamaño de página de las listas paginadas (API, decisión A11). */
export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 50;

/**
 * Parámetros de `GET /rooms`. Llegan en la dirección, como texto, y por eso
 * `limit` se convierte a número.
 */
export const listRoomsQuerySchema = z.object({
  gameSlug: z.string().min(1).exactOptional(),
  mode: matchModeSchema.exactOptional(),
  cursor: z.string().min(1).exactOptional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});
export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>;

/**
 * Parámetros de `GET /me/matches`. Sin `status`, la lista es la de las
 * partidas en curso.
 */
export const listMyMatchesQuerySchema = z.object({
  status: matchStatusSchema.default('IN_PROGRESS'),
  gameSlug: z.string().min(1).exactOptional(),
  cursor: z.string().min(1).exactOptional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});
export type ListMyMatchesQuery = z.infer<typeof listMyMatchesQuerySchema>;

/** Parámetros de `GET /admin/users`. */
export const adminListUsersQuerySchema = z.object({
  /** El nombre de usuario empieza por este texto, sin distinguir mayúsculas. */
  username: z.string().min(1).exactOptional(),
  /** El correo coincide entero, sin distinguir mayúsculas. */
  email: z.string().min(1).exactOptional(),
  status: userStatusSchema.exactOptional(),
  cursor: z.string().min(1).exactOptional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});
export type AdminListUsersQuery = z.infer<typeof adminListUsersQuerySchema>;

export const setUserStatusRequestSchema = z.strictObject({
  status: userStatusSchema,
});
export type SetUserStatusRequest = z.infer<typeof setUserStatusRequestSchema>;

export const setCatalogStatusRequestSchema = z.strictObject({
  status: catalogStatusSchema,
});
export type SetCatalogStatusRequest = z.infer<typeof setCatalogStatusRequestSchema>;

export const setCurrentVersionRequestSchema = z.strictObject({
  gameVersion: z.string(),
});
export type SetCurrentVersionRequest = z.infer<typeof setCurrentVersionRequestSchema>;

// ---------------------------------------------------------------------------
// Correspondencia con el archivo OpenAPI
// ---------------------------------------------------------------------------

/**
 * Cada esquema del archivo OpenAPI, por su nombre en `components.schemas`,
 * con el esquema de este módulo que le corresponde. La usa la prueba que
 * compara los dos.
 */
export const OPENAPI_SCHEMAS = {
  ErrorResponse: errorResponseSchema,
  ErrorCode: errorCodeSchema,
  MatchMode: matchModeSchema,
  TimeControl: timeControlSchema,
  RoomStatus: roomStatusSchema,
  RoomCloseReason: roomCloseReasonSchema,
  MatchStatus: matchStatusSchema,
  MatchAbortReason: matchAbortReasonSchema,
  MatchEndReason: matchEndReasonSchema,
  SeatOutcome: seatOutcomeSchema,
  UserRole: userRoleSchema,
  UserStatus: userStatusSchema,
  CatalogStatus: catalogStatusSchema,
  Me: meSchema,
  PlayerRef: playerRefSchema,
  PublicPlayer: publicPlayerSchema,
  PlayerGameStatistics: playerGameStatisticsSchema,
  Game: gameSchema,
  RoomSummary: roomSummarySchema,
  RoomMember: roomMemberSchema,
  RoomView: roomViewSchema,
  MatchPlayer: matchPlayerSchema,
  MatchResult: matchResultSchema,
  MatchView: matchViewSchema,
  MatchSummary: matchSummarySchema,
  AdminUser: adminUserSchema,
  AdminGameVersion: adminGameVersionSchema,
  AdminGame: adminGameSchema,
  RegisterRequest: registerRequestSchema,
  LoginRequest: loginRequestSchema,
  PasswordResetRequest: passwordResetRequestSchema,
  PasswordResetConfirmRequest: passwordResetConfirmRequestSchema,
  ChangePasswordRequest: changePasswordRequestSchema,
  UpdateMeRequest: updateMeRequestSchema,
  CreateRoomRequest: createRoomRequestSchema,
  SetReadyRequest: setReadyRequestSchema,
  SetUserStatusRequest: setUserStatusRequestSchema,
  SetCatalogStatusRequest: setCatalogStatusRequestSchema,
  SetCurrentVersionRequest: setCurrentVersionRequestSchema,
} as const satisfies Record<string, z.ZodType>;
