/**
 * Listas de valores de los tipos enumerados de la API y del protocolo.
 * Cada lista está atada en compilación a su tipo.
 */
import {
  MATCH_END_REASONS,
  MATCH_MODES,
  SEAT_OUTCOMES,
  TIME_CONTROL_TYPES,
} from '@gameboard/game-engine/shared';
import type {
  MatchAbortReason,
  MatchStatus,
  RoomCloseReason,
  RoomStatus,
} from './realtime.js';

export { MATCH_END_REASONS, MATCH_MODES, SEAT_OUTCOMES, TIME_CONTROL_TYPES };

export const ROOM_STATUSES = ['WAITING', 'IN_MATCH', 'CLOSED'] as const satisfies readonly RoomStatus[];

export const ROOM_CLOSE_REASONS = [
  'OWNER_LEFT',
  'IDLE',
  'MATCH_ENDED',
  'ADMIN',
] as const satisfies readonly RoomCloseReason[];

export const MATCH_STATUSES = [
  'IN_PROGRESS',
  'FINISHED',
  'ABORTED',
] as const satisfies readonly MatchStatus[];

export const MATCH_ABORT_REASONS = ['ADMIN', 'FAILURE'] as const satisfies readonly MatchAbortReason[];

/** Roles guardados de una cuenta (ADR-011, convención 9.15). */
export const USER_ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** Estado de un juego o de una versión en el catálogo. */
export const CATALOG_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

type Covers<Union, List extends readonly unknown[]> = [Union] extends [List[number]] ? true : never;

export const LISTS_ARE_COMPLETE: [
  Covers<RoomStatus, typeof ROOM_STATUSES>,
  Covers<RoomCloseReason, typeof ROOM_CLOSE_REASONS>,
  Covers<MatchStatus, typeof MATCH_STATUSES>,
  Covers<MatchAbortReason, typeof MATCH_ABORT_REASONS>,
] = [true, true, true, true];
