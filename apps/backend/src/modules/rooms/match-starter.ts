import type { MatchMode, TimeControl } from '@gameboard/contracts';
import { Injectable } from '@nestjs/common';
import type { DbExecutor, Transaction } from '../../database/database.service.js';

/** Una sala que cumple la condición de inicio (ADR-009, reglas 7.9, 7.10 y 7.31). */
export interface RoomReadyToStart {
  readonly roomId: string;
  readonly gameId: string;
  readonly mode: MatchMode;
  readonly timeControl: TimeControl;
  /** Opciones propias del juego, tal como las validó su motor al crear la sala. */
  readonly settings: Readonly<Record<string, unknown>>;
  /** Los miembros, por orden de llegada. Quien inicia la partida reparte los asientos. */
  readonly playerIds: readonly string[];
}

/** Lo que `rooms` necesita saber de las partidas de una sala. */
export interface RoomMatches {
  /** La partida en curso, si la hay. */
  readonly currentMatchId: string | null;
  /** Si la sala ya albergó alguna partida, terminada o no. */
  readonly hasPlayed: boolean;
}

/**
 * Lo que `rooms` pide a quien dirige las partidas (ADR-013, decisión H1).
 * La interfaz se define aquí y la implementa `game-sessions`, de modo que
 * `game-sessions` conoce a `rooms` y no al revés (ADR-014, decisión K1).
 */
export interface MatchStarter {
  /**
   * Inicia la partida de la sala dentro de la transacción recibida, que es
   * la misma que hizo que la sala cumpliera la condición. Devuelve el
   * identificador de la partida, o `null` si no la inició.
   */
  startMatch(room: RoomReadyToStart, tx: Transaction): Promise<string | null>;

  describeRoom(roomId: string, executor?: DbExecutor): Promise<RoomMatches>;

  /**
   * En cuántas partidas en curso de esa modalidad está retirado el jugador
   * mientras siguen sin él. Su sala no cuenta para su límite (ADR-009,
   * regla 7.33; ADR-020, DO20).
   */
  countRetiredMatches(playerId: string, mode: MatchMode, executor?: DbExecutor): Promise<number>;
}

/**
 * Si nadie dirige partidas, ninguna empieza: una sala que cumple la
 * condición de inicio se queda en espera (ADR-013, decisión H2). Es lo que
 * hay hasta que `game-sessions` se registra al arrancar.
 */
export const NO_MATCHES_YET: MatchStarter = {
  startMatch: () => Promise.resolve(null),
  describeRoom: () => Promise.resolve({ currentMatchId: null, hasPlayed: false }),
  countRetiredMatches: () => Promise.resolve(0),
};

/**
 * Dónde se conecta quien dirige las partidas. El módulo que implementa
 * `MatchStarter` se registra aquí al arrancar; `rooms` no lo importa.
 */
@Injectable()
export class MatchStarterSlot {
  private starter: MatchStarter = NO_MATCHES_YET;

  get current(): MatchStarter {
    return this.starter;
  }

  register(starter: MatchStarter): void {
    this.starter = starter;
  }
}
