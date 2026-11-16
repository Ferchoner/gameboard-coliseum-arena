/**
 * Protocolo de tiempo real, versión 1: tipos de los mensajes.
 *
 * Este archivo contiene solo definiciones de tipos. No contiene lógica.
 * La semántica, los ejemplos y las decisiones de diseño están en
 * `02-realtime.md`.
 *
 * No importa nada del contrato del motor: el paquete de contratos y el del
 * motor no dependen entre sí (ADR-005). Los pocos tipos comunes, como la
 * modalidad o el control de tiempo, se repiten aquí con la misma forma.
 */

// ---------------------------------------------------------------------------
// Tipos básicos
// ---------------------------------------------------------------------------

/** Versión de este protocolo (ADR-011, convención 9.10). */
export type ProtocolVersion = 1;

/** Identificador con formato UUID. */
export type Uuid = string;

/** Fecha y hora en formato ISO 8601, en UTC (ADR-011, convención 9.3). */
export type IsoDateTime = string;

export type MatchMode = 'REALTIME' | 'TURN_BASED';

export interface TimeControl {
  readonly type: 'TOTAL_PER_PLAYER';
  readonly totalMs: number;
}

export type RoomStatus = 'WAITING' | 'IN_MATCH' | 'CLOSED';
export type RoomCloseReason = 'OWNER_LEFT' | 'IDLE' | 'MATCH_ENDED' | 'ADMIN';

export type MatchStatus = 'IN_PROGRESS' | 'FINISHED' | 'ABORTED';
export type MatchAbortReason = 'ADMIN' | 'FAILURE';
export type MatchEndReason = 'COMPLETED' | 'TIMEOUT' | 'RESIGNATION' | 'ABANDONMENT';
export type SeatOutcome = 'WIN' | 'LOSS' | 'DRAW';

// ---------------------------------------------------------------------------
// Vistas
// ---------------------------------------------------------------------------

/** Un miembro de una sala. */
export interface RoomMemberView {
  readonly playerId: Uuid;
  readonly username: string;
  readonly displayName: string;
  readonly ready: boolean;
  /** Tiene al menos una conexión abierta. */
  readonly connected: boolean;
  readonly joinedAt: IsoDateTime;
}

/** Estado completo de una sala, tal como lo ve un miembro. */
export interface RoomView {
  readonly roomId: Uuid;
  readonly gameSlug: string;
  readonly mode: MatchMode;
  readonly timeControl: TimeControl;
  readonly maxPlayers: number;
  readonly rematchEnabled: boolean;
  /** Opciones propias del juego. */
  readonly settings: unknown;
  readonly status: RoomStatus;
  readonly closeReason: RoomCloseReason | null;
  readonly ownerPlayerId: Uuid;
  readonly members: readonly RoomMemberView[];
  /** La partida en curso, si la sala está en `IN_MATCH`. */
  readonly currentMatchId: Uuid | null;
}

/** Un participante de una partida. */
export interface MatchPlayerView {
  readonly seat: number;
  readonly playerId: Uuid;
  readonly username: string;
  readonly displayName: string;
  /** Tiene al menos una conexión abierta. */
  readonly connected: boolean;
  /** Tiempo que le queda, medido en el instante `serverTime` del mensaje. */
  readonly clockRemainingMs: number;
  /**
   * Instante en que perderá por abandono si no vuelve a conectarse. Solo
   * tiene valor en tiempo real y mientras está desconectado (ADR-009, 7.26).
   */
  readonly abandonAt: IsoDateTime | null;
}

export interface MatchResultView {
  readonly reason: MatchEndReason;
  readonly seats: readonly {
    readonly seat: number;
    readonly outcome: SeatOutcome;
    readonly score?: number;
  }[];
}

/** Estado completo de una partida, tal como lo ve uno de sus participantes. */
export interface MatchView {
  readonly matchId: Uuid;
  readonly roomId: Uuid;
  readonly gameSlug: string;
  readonly gameVersion: string;
  readonly mode: MatchMode;
  readonly timeControl: TimeControl;
  readonly status: MatchStatus;
  /** Contador de cambios del estado. Es el valor que debe indicar la siguiente jugada. */
  readonly stateVersion: number;
  /** El asiento de quien recibe esta vista. */
  readonly yourSeat: number;
  readonly players: readonly MatchPlayerView[];
  /** Asientos que pueden jugar ahora. Vacía si la partida no está en curso. */
  readonly activeSeats: readonly number[];
  /** Instante en que se agota el primer reloj de los asientos activos. */
  readonly turnDeadlineAt: IsoDateTime | null;
  /** Lo que este asiento puede ver del juego. Su forma la define cada juego. */
  readonly view: unknown;
  /** Tiene valor solo si la partida está en `FINISHED`. */
  readonly result: MatchResultView | null;
  /** Tiene valor solo si la partida está en `ABORTED`. */
  readonly abortReason: MatchAbortReason | null;
  readonly startedAt: IsoDateTime;
  readonly endedAt: IsoDateTime | null;
}

/** Resumen de una partida, para la lista de "mis partidas" y el aviso de turno. */
export interface MatchSummaryView {
  readonly matchId: Uuid;
  readonly roomId: Uuid;
  readonly gameSlug: string;
  readonly mode: MatchMode;
  readonly status: MatchStatus;
  /** Quien recibe el mensaje puede jugar ahora. */
  readonly yourTurn: boolean;
  readonly turnDeadlineAt: IsoDateTime | null;
  readonly opponents: readonly {
    readonly playerId: Uuid;
    readonly username: string;
    readonly displayName: string;
  }[];
  /** Resultado de quien recibe el mensaje. Tiene valor solo si la partida terminó. */
  readonly yourOutcome: SeatOutcome | null;
  /** Tiene valor solo si la partida terminó. */
  readonly endReason: MatchEndReason | null;
  readonly startedAt: IsoDateTime;
  readonly endedAt: IsoDateTime | null;
}

/** Evento de juego. Además de `type`, lleva los campos que defina cada juego. */
export interface GameEventView {
  readonly type: string;
  readonly [field: string]: unknown;
}

// ---------------------------------------------------------------------------
// Órdenes: del cliente al servidor
// ---------------------------------------------------------------------------

interface CommandBase {
  /** UUID generado por el cliente. Identifica la orden y su respuesta. */
  readonly requestId: Uuid;
}

export interface SubscribeRoomCommand extends CommandBase {
  readonly type: 'SUBSCRIBE_ROOM';
  readonly roomId: Uuid;
}

export interface UnsubscribeRoomCommand extends CommandBase {
  readonly type: 'UNSUBSCRIBE_ROOM';
  readonly roomId: Uuid;
}

export interface SubscribeMatchCommand extends CommandBase {
  readonly type: 'SUBSCRIBE_MATCH';
  readonly matchId: Uuid;
}

export interface UnsubscribeMatchCommand extends CommandBase {
  readonly type: 'UNSUBSCRIBE_MATCH';
  readonly matchId: Uuid;
}

export interface SubmitActionCommand extends CommandBase {
  readonly type: 'SUBMIT_ACTION';
  readonly matchId: Uuid;
  readonly payload: {
    /** La versión del estado que el jugador tenía delante (ADR-010, 8.11). */
    readonly stateVersion: number;
    /** La acción. Su forma la define cada juego. */
    readonly action: unknown;
  };
}

export interface ResignMatchCommand extends CommandBase {
  readonly type: 'RESIGN_MATCH';
  readonly matchId: Uuid;
}

export type Command =
  | SubscribeRoomCommand
  | UnsubscribeRoomCommand
  | SubscribeMatchCommand
  | UnsubscribeMatchCommand
  | SubmitActionCommand
  | ResignMatchCommand;

export type CommandType = Command['type'];

// ---------------------------------------------------------------------------
// Notificaciones: del servidor al cliente
// ---------------------------------------------------------------------------

interface NotificationBase {
  /** Hora del servidor al enviar el mensaje. */
  readonly serverTime: IsoDateTime;
  /**
   * Presente solo en la copia que recibe quien envió la orden que provocó
   * esta notificación.
   */
  readonly requestId?: Uuid;
}

/** Primer mensaje de toda conexión. */
export interface ConnectionEstablishedNotification extends NotificationBase {
  readonly type: 'CONNECTION_ESTABLISHED';
  readonly payload: {
    readonly protocolVersion: ProtocolVersion;
    readonly playerId: Uuid;
    readonly heartbeatIntervalMs: number;
    readonly maxMessageBytes: number;
  };
}

export interface ServerHeartbeatNotification extends NotificationBase {
  readonly type: 'SERVER_HEARTBEAT';
}

/** Códigos con los que el servidor rechaza una orden. */
export type CommandRejectionCode =
  | 'INVALID_MESSAGE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'ROOM_NOT_FOUND'
  | 'PLAYER_NOT_IN_ROOM'
  | 'MATCH_NOT_FOUND'
  | 'PLAYER_NOT_IN_MATCH'
  | 'MATCH_NOT_IN_PROGRESS'
  | 'STALE_STATE_VERSION'
  | 'NOT_YOUR_TURN'
  | 'CLOCK_EXPIRED'
  | 'INVALID_ACTION';

export interface CommandRejectedNotification extends NotificationBase {
  readonly type: 'COMMAND_REJECTED';
  /** Ausente solo si el mensaje recibido no traía un `requestId` legible. */
  readonly requestId?: Uuid;
  readonly payload: {
    readonly code: CommandRejectionCode;
    /** Tipo de la orden rechazada, si pudo leerse. */
    readonly commandType: CommandType | null;
    /** Motivo propio del juego, cuando el rechazo viene del motor. */
    readonly reason?: string;
    /** Versión actual del estado, cuando el código es `STALE_STATE_VERSION`. */
    readonly currentStateVersion?: number;
  };
}

export interface RoomSubscribedNotification extends NotificationBase {
  readonly type: 'ROOM_SUBSCRIBED';
  readonly roomId: Uuid;
  readonly payload: { readonly room: RoomView };
}

export interface RoomUnsubscribedNotification extends NotificationBase {
  readonly type: 'ROOM_UNSUBSCRIBED';
  readonly roomId: Uuid;
}

export interface RoomUpdatedNotification extends NotificationBase {
  readonly type: 'ROOM_UPDATED';
  readonly roomId: Uuid;
  readonly payload: { readonly room: RoomView };
}

/** La sala se cerró. La suscripción termina con este mensaje. */
export interface RoomClosedNotification extends NotificationBase {
  readonly type: 'ROOM_CLOSED';
  readonly roomId: Uuid;
  readonly payload: { readonly closeReason: RoomCloseReason };
}

export interface MatchSubscribedNotification extends NotificationBase {
  readonly type: 'MATCH_SUBSCRIBED';
  readonly matchId: Uuid;
  readonly payload: { readonly match: MatchView };
}

export interface MatchUnsubscribedNotification extends NotificationBase {
  readonly type: 'MATCH_UNSUBSCRIBED';
  readonly matchId: Uuid;
}

/** Algo cambió en la partida: una jugada, su final, su anulación o la presencia de un jugador. */
export interface MatchUpdatedNotification extends NotificationBase {
  readonly type: 'MATCH_UPDATED';
  readonly matchId: Uuid;
  readonly payload: {
    readonly match: MatchView;
    /** Eventos de juego que produjo el cambio. Vacía si no hubo ninguno. */
    readonly events: readonly GameEventView[];
  };
}

/** Aviso personal. Se recibe sin necesidad de suscripción. */
export interface PlayerMatchUpdatedNotification extends NotificationBase {
  readonly type: 'PLAYER_MATCH_UPDATED';
  readonly matchId: Uuid;
  readonly payload: { readonly match: MatchSummaryView };
}

export type Notification =
  | ConnectionEstablishedNotification
  | ServerHeartbeatNotification
  | CommandRejectedNotification
  | RoomSubscribedNotification
  | RoomUnsubscribedNotification
  | RoomUpdatedNotification
  | RoomClosedNotification
  | MatchSubscribedNotification
  | MatchUnsubscribedNotification
  | MatchUpdatedNotification
  | PlayerMatchUpdatedNotification;

export type NotificationType = Notification['type'];

// ---------------------------------------------------------------------------
// Códigos de cierre de la conexión
// ---------------------------------------------------------------------------

/**
 * Códigos con los que el servidor cierra una conexión. Los que empiezan por
 * 1 son estándar de WebSocket; los que empiezan por 4 son de este protocolo.
 *
 * - 1008: el cliente incumplió el protocolo de forma repetida.
 * - 1009: mensaje demasiado grande.
 * - 1012: el servidor se reinicia.
 * - 4001: la sesión de autenticación terminó.
 * - 4002: versión del protocolo no admitida.
 * - 4003: demasiadas conexiones abiertas para el mismo jugador.
 */
export type ServerCloseCode = 1008 | 1009 | 1012 | 4001 | 4002 | 4003;
