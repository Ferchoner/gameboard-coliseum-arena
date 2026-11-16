import type {
  MatchAbortReason,
  MatchEndReason,
  MatchMode,
  MatchStatus,
  SeatOutcome,
  TimeControl,
} from '@gameboard/contracts';

/** El resultado de un asiento. */
export interface SeatResultRecord {
  readonly seat: number;
  readonly outcome: SeatOutcome;
  readonly score?: number;
}

/** El resultado de una partida terminada. */
export interface MatchResultRecord {
  readonly reason: MatchEndReason;
  /** Un resultado por asiento, por orden de asiento. */
  readonly seats: readonly SeatResultRecord[];
}

/** Una partida tal como quedó anotada: quién la jugó, en qué asiento y cómo acabó. */
export interface MatchRecord {
  readonly matchId: string;
  readonly roomId: string;
  readonly gameVersionId: string;
  readonly mode: MatchMode;
  readonly timeControl: TimeControl;
  readonly status: MatchStatus;
  readonly abortReason: MatchAbortReason | null;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  /** El jugador de cada asiento: la posición en la lista es el asiento. */
  readonly playerIds: readonly string[];
  /** Tiene valor solo si la partida terminó. */
  readonly result: MatchResultRecord | null;
}

/** Lo necesario para anotar una partida que empieza. */
export interface NewMatch {
  readonly matchId: string;
  readonly roomId: string;
  readonly gameVersionId: string;
  readonly mode: MatchMode;
  readonly timeControl: TimeControl;
  readonly startedAt: Date;
  /** El jugador de cada asiento: la posición en la lista es el asiento. */
  readonly playerIds: readonly string[];
}

/** Posición en una lista de partidas: la última de la página anterior. */
export interface MatchListPosition {
  readonly startedAt: Date;
  readonly matchId: string;
}

export interface PlayerMatchesQuery {
  readonly playerId: string;
  readonly status: MatchStatus;
  /** Si se indica, solo las partidas de esas versiones de juego. */
  readonly gameVersionIds?: readonly string[] | undefined;
  readonly after?: MatchListPosition | undefined;
  readonly limit: number;
}
