/**
 * Tipos y listas de valores que el motor comparte con la API y con el
 * protocolo de tiempo real (ADR-012, decisión S2).
 *
 * Es una entrada aparte del paquete: quien la importa no recibe el código
 * de ningún juego. El paquete de contratos la usa para no definir estos
 * tipos por segunda vez.
 */
import type {
  MatchEndReason,
  MatchMode,
  SeatOutcome,
  SeatRetirementReason,
  TimeControl,
  TotalPerPlayerTimeControl,
} from './contract.js';

export type {
  MatchEndReason,
  MatchMode,
  SeatOutcome,
  SeatRetirementReason,
  TimeControl,
  TotalPerPlayerTimeControl,
};

export const MATCH_MODES = ['REALTIME', 'TURN_BASED'] as const satisfies readonly MatchMode[];

export const SEAT_OUTCOMES = ['WIN', 'LOSS', 'DRAW'] as const satisfies readonly SeatOutcome[];

export const MATCH_END_REASONS = [
  'COMPLETED',
  'TIMEOUT',
  'RESIGNATION',
  'ABANDONMENT',
] as const satisfies readonly MatchEndReason[];

export const TIME_CONTROL_TYPES = [
  'TOTAL_PER_PLAYER',
] as const satisfies readonly TimeControl['type'][];

/**
 * Comprobación en compilación: cada lista contiene todos los valores de su
 * tipo. Si el contrato gana un valor y la lista no, esto deja de compilar.
 */
type Covers<Union, List extends readonly unknown[]> = [Union] extends [List[number]] ? true : never;

export const LISTS_ARE_COMPLETE: [
  Covers<MatchMode, typeof MATCH_MODES>,
  Covers<SeatOutcome, typeof SEAT_OUTCOMES>,
  Covers<MatchEndReason, typeof MATCH_END_REASONS>,
  Covers<TimeControl['type'], typeof TIME_CONTROL_TYPES>,
] = [true, true, true, true];
