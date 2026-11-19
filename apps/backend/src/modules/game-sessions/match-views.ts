import type { MatchPlayerView, MatchSummaryView, MatchView } from '@gameboard/contracts';
import type { MatchSnapshot } from '../broadcast/match-snapshot.js';
import { clocksAt } from './match-clock.js';

/** Lo que hace falta de una partida para resumirla. */
export type MatchOutline = Pick<
  MatchSnapshot,
  | 'matchId'
  | 'roomId'
  | 'gameSlug'
  | 'mode'
  | 'status'
  | 'players'
  | 'activeSeats'
  | 'turnDeadlineAt'
  | 'result'
  | 'startedAt'
  | 'endedAt'
>;

/** Cómo está un jugador ahora: dato en memoria, que no se guarda (ADR-009, regla 7.24). */
export interface PlayerPresence {
  readonly connected: boolean;
  /** Cuándo pierde por abandono, si falta en una partida en tiempo real (regla 7.26). */
  readonly abandonAt: Date | null;
}

/** El asiento de un jugador en una partida, o `undefined` si no participa. */
export function seatOf(
  match: Pick<MatchSnapshot, 'players'>,
  playerId: string,
): number | undefined {
  const seat = match.players.findIndex((player) => player.playerId === playerId);
  return seat === -1 ? undefined : seat;
}

/**
 * La partida tal como la ve uno de sus participantes en el instante `now`
 * (protocolo, sección 6). Los relojes se miden en ese instante, que es la
 * hora con la que sale el mensaje.
 */
export function toMatchView(
  snapshot: MatchSnapshot,
  seat: number,
  now: Date,
  presenceOf: (playerId: string) => PlayerPresence,
): MatchView {
  const clocks = clocksAt(snapshot.clocks, snapshot.activeSeats, snapshot.turnStartedAt, now);
  return {
    matchId: snapshot.matchId,
    roomId: snapshot.roomId,
    gameSlug: snapshot.gameSlug,
    gameVersion: snapshot.gameVersion,
    mode: snapshot.mode,
    timeControl: snapshot.timeControl,
    status: snapshot.status,
    stateVersion: snapshot.stateVersion,
    yourSeat: seat,
    players: snapshot.players.map((player, playerSeat): MatchPlayerView => {
      const presence = presenceOf(player.playerId);
      return {
        seat: playerSeat,
        playerId: player.playerId,
        username: player.username,
        displayName: player.displayName,
        connected: presence.connected,
        clockRemainingMs: clocks[playerSeat] ?? 0,
        // Se retiró y la partida siguió sin él (ADR-020, DO21).
        retired: snapshot.retiredSeats.includes(playerSeat),
        // Solo mientras la partida sigue en curso (ADR-015, decisión V8).
        abandonAt:
          snapshot.status === 'IN_PROGRESS' ? (presence.abandonAt?.toISOString() ?? null) : null,
      };
    }),
    activeSeats: [...snapshot.activeSeats],
    turnDeadlineAt: snapshot.turnDeadlineAt?.toISOString() ?? null,
    view: snapshot.views[seat] ?? null,
    result: snapshot.result,
    abortReason: snapshot.abortReason,
    startedAt: snapshot.startedAt.toISOString(),
    endedAt: snapshot.endedAt?.toISOString() ?? null,
  };
}

/** El resumen de una partida para uno de sus participantes (API, decisión A1). */
export function toMatchSummary(match: MatchOutline, seat: number): MatchSummaryView {
  const inProgress = match.status === 'IN_PROGRESS';
  return {
    matchId: match.matchId,
    roomId: match.roomId,
    gameSlug: match.gameSlug,
    mode: match.mode,
    status: match.status,
    yourTurn: inProgress && match.activeSeats.includes(seat),
    turnDeadlineAt: inProgress ? (match.turnDeadlineAt?.toISOString() ?? null) : null,
    opponents: match.players.filter((_, playerSeat) => playerSeat !== seat),
    yourOutcome: match.result?.seats.find((one) => one.seat === seat)?.outcome ?? null,
    endReason: match.result?.reason ?? null,
    startedAt: match.startedAt.toISOString(),
    endedAt: match.endedAt?.toISOString() ?? null,
  };
}
