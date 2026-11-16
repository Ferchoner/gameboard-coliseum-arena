import type {
  CommandRejectionCode,
  MatchPlayerView,
  MatchView,
  SeatOutcome,
} from '@gameboard/contracts';
import { es } from '../i18n/es';
import type { CommandResult } from './realtime-client';

type MatchProgress = Pick<MatchView, 'status' | 'activeSeats'>;

/**
 * El tiempo que le queda a un jugador `elapsedMs` después de recibir la
 * partida. El servidor envía los relojes medidos en el instante del
 * mensaje; desde entonces corre solo el de quien puede jugar, y nunca baja
 * de cero (protocolo, decisión T12; ADR-014, decisión K19).
 */
export function clockAfter(
  match: MatchProgress,
  player: MatchPlayerView,
  elapsedMs: number,
): number {
  const running = match.status === 'IN_PROGRESS' && match.activeSeats.includes(player.seat);
  if (!running) return player.clockRemainingMs;
  return Math.max(0, player.clockRemainingMs - Math.max(0, elapsedMs));
}

/** Un reloj en minutos y segundos: "4:07". Solo marca "0:00" cuando no queda nada. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/**
 * Si un estado recién llegado debe sustituir al que se muestra. Una
 * notificación con una versión menor que la que ya se tiene se descarta
 * (protocolo, sección 6).
 */
export function supersedes(current: MatchView | null, next: MatchView): boolean {
  if (!current || current.matchId !== next.matchId) return true;
  return next.stateVersion >= current.stateVersion;
}

/** El resultado de un asiento, si la partida terminó. */
export function outcomeOf(match: Pick<MatchView, 'result'>, seat: number): SeatOutcome | null {
  return match.result?.seats.find((one) => one.seat === seat)?.outcome ?? null;
}

/** Los nombres de los demás participantes: "Bea" o "Bea, Cleo". */
export function rivalNames(match: Pick<MatchView, 'players' | 'yourSeat'>): string {
  return match.players
    .filter((player) => player.seat !== match.yourSeat)
    .map((player) => player.displayName)
    .join(', ');
}

/**
 * Por qué terminó la partida, contado a quien la mira. El tiempo agotado,
 * la rendición y el abandono los provoca quien pierde.
 */
export function endReasonText(match: Pick<MatchView, 'result' | 'players' | 'yourSeat'>): string {
  if (!match.result) return '';
  const { reason } = match.result;
  if (reason === 'COMPLETED') return es.match.endReasons.COMPLETED;

  const texts = es.match.endReasons[reason];
  if (outcomeOf(match, match.yourSeat) === 'LOSS') return texts.you;
  const losers = match.result.seats
    .filter((one) => one.outcome === 'LOSS')
    .map((one) => match.players.find((player) => player.seat === one.seat)?.displayName)
    .filter((name) => name !== undefined);
  return texts.other(losers.join(', '));
}

/** Los rechazos tras los que conviene volver a pedir la partida, porque cambió. */
const REFRESH_CODES: ReadonlySet<string> = new Set<CommandRejectionCode>([
  'STALE_STATE_VERSION',
  'NOT_YOUR_TURN',
  'CLOCK_EXPIRED',
  'MATCH_NOT_IN_PROGRESS',
]);

export function shouldRefreshAfter(result: CommandResult): boolean {
  return !result.ok && REFRESH_CODES.has(result.code);
}

/**
 * El texto de una orden de juego rechazada. Si el rechazo viene de las
 * reglas del juego, `gameReasons` da el texto de su motivo.
 */
export function rejectionText(
  result: Extract<CommandResult, { ok: false }>,
  gameReasons: Readonly<Record<string, string>> = {},
): string {
  if (result.code === 'NOT_CONNECTED') return es.match.notConnected;
  if (result.code === 'INVALID_ACTION' && result.reason !== undefined) {
    return gameReasons[result.reason] ?? es.errors.INVALID_ACTION;
  }
  return es.errors[result.code];
}
