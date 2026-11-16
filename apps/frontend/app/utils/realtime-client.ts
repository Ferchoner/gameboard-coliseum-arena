import {
  CLOSE_CODES,
  CLOSE_CODES_WITHOUT_RECONNECT,
  type Command,
  type CommandRejectionCode,
  type GameEventView,
  type MatchView,
  type Notification,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_PARAM,
  REALTIME_PATH,
  type RoomCloseReason,
  type RoomView,
} from '@gameboard/contracts';

/**
 * Cliente del canal de tiempo real (`contracts/02-realtime.md`). Usa el
 * WebSocket del navegador y reconecta por su cuenta, sin librería
 * (ADR-003, condición 5.6; ADR-013, decisión H10).
 *
 * No depende de Vue ni de Nuxt: recibe por parámetro cómo abrir la
 * conexión y cómo esperar, para poder probarlo.
 */

/** En qué situación está la conexión. */
export type ConnectionState =
  /** No se ha pedido conectar, o se pidió parar. */
  | { readonly status: 'idle' }
  | { readonly status: 'connecting' }
  | { readonly status: 'open' }
  /** Se perdió la conexión y hay un reintento programado. */
  | { readonly status: 'reconnecting' }
  /** El servidor cerró la conexión y el cliente no reconecta solo. */
  | { readonly status: 'stopped'; readonly reason: StopReason };

export type StopReason =
  /** La sesión de autenticación terminó. */
  | 'SESSION_ENDED'
  /** El servidor no admite esta versión de la aplicación. */
  | 'UNSUPPORTED_VERSION'
  /** Hay demasiadas pestañas abiertas con la misma cuenta. */
  | 'TOO_MANY_CONNECTIONS'
  /** El servidor cortó porque la aplicación envió algo que no debía. */
  | 'PROTOCOL_ERROR';

/** Lo que recibe quien está suscrito a una sala. */
export interface RoomListener {
  /** El estado completo de la sala: al suscribirse, al reconectar y en cada cambio. */
  onRoom(room: RoomView): void;
  /** La sala se cerró. La suscripción termina aquí. */
  onClosed(closeReason: RoomCloseReason): void;
  /** El servidor rechazó la suscripción. Termina aquí. */
  onRejected(code: CommandRejectionCode): void;
}

/** Lo que recibe quien sigue una partida. */
export interface MatchListener {
  /**
   * El estado completo de la partida, desde el asiento propio: al
   * suscribirse, al reconectar y en cada cambio. `events` trae lo que
   * ocurrió en el juego, y `serverTime`, el instante en que se midieron los
   * relojes. Cuando la partida deja de estar en curso, este es el último aviso.
   */
  onMatch(match: MatchView, events: readonly GameEventView[], serverTime: string): void;
  /** El servidor rechazó la suscripción. Termina aquí. */
  onRejected(code: CommandRejectionCode): void;
}

/** Cómo terminó una orden de juego. */
export type CommandResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** `NOT_CONNECTED` si la conexión se cerró para no volver antes de tener respuesta. */
      readonly code: CommandRejectionCode | 'NOT_CONNECTED';
      /** Motivo propio del juego, cuando el rechazo viene de sus reglas. */
      readonly reason?: string;
    };

/** Una orden de juego enviada que todavía no tiene respuesta. */
interface PendingCommand {
  readonly command: Extract<Command, { type: 'SUBMIT_ACTION' | 'RESIGN_MATCH' }>;
  readonly resolve: (result: CommandResult) => void;
}

/** Un manejador de eventos, tan permisivo con su parámetro como los del navegador. */
type Handler<Event> = { on(event: Event): void }['on'] | null;

/** Lo que el cliente necesita de un WebSocket. El del navegador lo cumple. */
export interface SocketLike {
  onmessage: Handler<{ data: unknown }>;
  onclose: Handler<{ code: number }>;
  send(data: string): void;
  close(): void;
}

export interface RealtimeClientOptions {
  readonly url: string;
  readonly createSocket: (url: string) => SocketLike;
  readonly onState: (state: ConnectionState) => void;
  /**
   * Se llama antes de cada reintento. El navegador no dice por qué falló una
   * apertura, así que aquí se comprueba la sesión con la API (protocolo,
   * sección 2). Si devuelve `false`, el cliente deja de reintentar.
   */
  readonly canRetry: () => Promise<boolean>;
  readonly newRequestId?: () => string;
  readonly random?: () => number;
}

/** La dirección del canal de tiempo real, a partir del origen de la API. */
export function realtimeUrl(apiOrigin: string): string {
  // `http` pasa a `ws` y `https` a `wss`.
  return `${apiOrigin.replace(/^http/, 'ws')}${REALTIME_PATH}?${PROTOCOL_VERSION_PARAM}=${PROTOCOL_VERSION}`;
}

const FIRST_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;
/** Hasta que el servidor diga su intervalo, se supone el del protocolo. */
const DEFAULT_HEARTBEAT_MS = 25_000;

/**
 * Cuánto esperar antes del reintento número `attempt`, empezando en 0:
 * 1 segundo, 2, 4… hasta 30, con una variación aleatoria de un 20 % para
 * que los clientes no reconecten todos a la vez (protocolo, sección 2).
 */
export function reconnectDelay(attempt: number, random: number): number {
  const base = Math.min(MAX_DELAY_MS, FIRST_DELAY_MS * 2 ** Math.min(attempt, 10));
  return Math.min(MAX_DELAY_MS, Math.round(base * (0.8 + 0.4 * random)));
}

const STOP_REASONS: Readonly<Record<number, StopReason>> = {
  [CLOSE_CODES.SESSION_ENDED]: 'SESSION_ENDED',
  [CLOSE_CODES.UNSUPPORTED_PROTOCOL_VERSION]: 'UNSUPPORTED_VERSION',
  [CLOSE_CODES.TOO_MANY_CONNECTIONS]: 'TOO_MANY_CONNECTIONS',
  [CLOSE_CODES.POLICY_VIOLATION]: 'PROTOCOL_ERROR',
  [CLOSE_CODES.MESSAGE_TOO_BIG]: 'PROTOCOL_ERROR',
};

export class RealtimeClient {
  private socket: SocketLike | null = null;
  private state: ConnectionState = { status: 'idle' };
  /** Cuántos reintentos seguidos van sin lograr una conexión. */
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatMs = DEFAULT_HEARTBEAT_MS;

  /** Salas a las que la aplicación quiere estar suscrita. Se recuperan al reconectar. */
  private readonly rooms = new Map<string, RoomListener>();
  /** A qué sala corresponde cada orden de suscripción que espera respuesta. */
  private readonly pendingSubscriptions = new Map<string, string>();
  /** Partidas que la aplicación quiere seguir. Se recuperan al reconectar. */
  private readonly matches = new Map<string, MatchListener>();
  private readonly pendingMatchSubscriptions = new Map<string, string>();
  /**
   * Órdenes de juego sin respuesta, por su `requestId`. Si la conexión se
   * corta antes de que llegue, se reenvían tal cual al reconectar: el
   * servidor no aplica dos veces la misma petición (ADR-010, regla 8.13).
   */
  private readonly pendingCommands = new Map<string, PendingCommand>();

  constructor(private readonly options: RealtimeClientOptions) {}

  /** Abre la conexión y la mantiene, reconectando si se pierde. */
  start(): void {
    if (this.state.status !== 'idle' && this.state.status !== 'stopped') return;
    this.attempt = 0;
    this.connect();
  }

  /** Cierra la conexión y deja de reconectar. Las suscripciones se olvidan. */
  stop(): void {
    this.clearTimers();
    this.forgetEverything();
    const socket = this.detach();
    socket?.close();
    this.setState({ status: 'idle' });
  }

  /**
   * Se suscribe a una sala. El estado llega por `listener.onRoom`, ahora y
   * cada vez que cambie. Devuelve cómo dejar la suscripción.
   */
  subscribeRoom(roomId: string, listener: RoomListener): () => void {
    this.rooms.set(roomId, listener);
    if (this.state.status === 'open') this.sendSubscribe(roomId);

    return () => {
      if (this.rooms.get(roomId) !== listener) return;
      this.rooms.delete(roomId);
      if (this.state.status === 'open') {
        this.send({ type: 'UNSUBSCRIBE_ROOM', requestId: this.newRequestId(), roomId });
      }
    };
  }

  /**
   * Sigue una partida. El estado llega por `listener.onMatch`, ahora y cada
   * vez que cambie. Devuelve cómo dejar de seguirla.
   */
  subscribeMatch(matchId: string, listener: MatchListener): () => void {
    this.matches.set(matchId, listener);
    if (this.state.status === 'open') this.sendSubscribeMatch(matchId);

    return () => {
      if (this.matches.get(matchId) !== listener) return;
      this.matches.delete(matchId);
      if (this.state.status === 'open') {
        this.send({ type: 'UNSUBSCRIBE_MATCH', requestId: this.newRequestId(), matchId });
      }
    };
  }

  /**
   * Envía una jugada. `stateVersion` es la versión del estado que la
   * persona tenía delante. La partida como queda llega por la suscripción;
   * aquí solo se sabe si la jugada se aceptó.
   */
  submitAction(matchId: string, stateVersion: number, action: unknown): Promise<CommandResult> {
    return this.sendCommand({
      type: 'SUBMIT_ACTION',
      requestId: this.newRequestId(),
      matchId,
      payload: { stateVersion, action },
    });
  }

  /** Se rinde en una partida. */
  resignMatch(matchId: string): Promise<CommandResult> {
    return this.sendCommand({ type: 'RESIGN_MATCH', requestId: this.newRequestId(), matchId });
  }

  // --- Conexión ------------------------------------------------------------

  private connect(): void {
    this.setState({ status: 'connecting' });
    const socket = this.options.createSocket(this.options.url);
    this.socket = socket;

    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.watchSilence();
      this.onMessage(event.data);
    };
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.detach();
      this.onClose(event.code);
    };
  }

  /** Suelta la conexión actual sin atender ya nada de lo que le llegue. */
  private detach(): SocketLike | null {
    const socket = this.socket;
    if (socket) {
      socket.onmessage = null;
      socket.onclose = null;
    }
    this.socket = null;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
    this.pendingSubscriptions.clear();
    this.pendingMatchSubscriptions.clear();
    return socket;
  }

  /** Olvida las suscripciones y da por perdidas las órdenes sin respuesta. */
  private forgetEverything(): void {
    this.rooms.clear();
    this.matches.clear();
    this.pendingSubscriptions.clear();
    this.pendingMatchSubscriptions.clear();
    const commands = [...this.pendingCommands.values()];
    this.pendingCommands.clear();
    for (const { resolve } of commands) resolve({ ok: false, code: 'NOT_CONNECTED' });
  }

  private onClose(code: number): void {
    if (CLOSE_CODES_WITHOUT_RECONNECT.includes(code)) {
      this.forgetEverything();
      this.setState({ status: 'stopped', reason: STOP_REASONS[code] ?? 'PROTOCOL_ERROR' });
      return;
    }
    // Cualquier otro cierre se trata como un corte de red.
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    this.setState({ status: 'reconnecting' });
    const delay = reconnectDelay(this.attempt, (this.options.random ?? Math.random)());
    this.attempt += 1;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.options.canRetry().then(
        (allowed) => {
          if (this.state.status !== 'reconnecting') return;
          if (allowed) {
            this.connect();
          } else {
            this.forgetEverything();
            this.setState({ status: 'stopped', reason: 'SESSION_ENDED' });
          }
        },
        // No se pudo comprobar la sesión: seguramente tampoco hay red. Se sigue intentando.
        () => {
          if (this.state.status === 'reconnecting') this.scheduleRetry();
        },
      );
    }, delay);
  }

  /**
   * Si pasa más del doble del intervalo de latidos sin recibir nada, la
   * conexión se da por perdida y se reconecta (protocolo, sección 2).
   */
  private watchSilence(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      const socket = this.detach();
      socket?.close();
      this.scheduleRetry();
    }, 2 * this.heartbeatMs);
  }

  private clearTimers(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.retryTimer = null;
    this.silenceTimer = null;
  }

  // --- Mensajes ------------------------------------------------------------

  private onMessage(data: unknown): void {
    let message: Notification;
    try {
      message = JSON.parse(String(data)) as Notification;
    } catch {
      return;
    }

    switch (message.type) {
      case 'CONNECTION_ESTABLISHED':
        this.heartbeatMs = message.payload.heartbeatIntervalMs;
        this.watchSilence();
        this.attempt = 0;
        this.setState({ status: 'open' });
        // El servidor no recuerda las suscripciones de la conexión anterior.
        for (const roomId of this.rooms.keys()) this.sendSubscribe(roomId);
        for (const matchId of this.matches.keys()) this.sendSubscribeMatch(matchId);
        // Las órdenes que se quedaron sin respuesta se repiten con su mismo identificador.
        for (const { command } of this.pendingCommands.values()) this.send(command);
        return;

      case 'ROOM_SUBSCRIBED':
        if (message.requestId) this.pendingSubscriptions.delete(message.requestId);
        this.rooms.get(message.roomId)?.onRoom(message.payload.room);
        return;

      case 'ROOM_UPDATED':
        this.rooms.get(message.roomId)?.onRoom(message.payload.room);
        return;

      case 'ROOM_CLOSED': {
        const listener = this.rooms.get(message.roomId);
        this.rooms.delete(message.roomId);
        listener?.onClosed(message.payload.closeReason);
        return;
      }

      case 'MATCH_SUBSCRIBED':
        if (message.requestId) this.pendingMatchSubscriptions.delete(message.requestId);
        this.deliverMatch(message.payload.match, [], message.serverTime);
        return;

      case 'MATCH_UPDATED': {
        this.deliverMatch(message.payload.match, message.payload.events, message.serverTime);
        // Si es la respuesta a una orden propia, la orden se aceptó.
        const command = message.requestId && this.pendingCommands.get(message.requestId);
        if (command && message.requestId) {
          this.pendingCommands.delete(message.requestId);
          command.resolve({ ok: true });
        }
        return;
      }

      case 'COMMAND_REJECTED':
        if (message.requestId) this.onRejection(message.requestId, message.payload);
        return;

      default:
        // Los latidos solo cuentan como señal de vida. El aviso personal de
        // partida se usará con la modalidad por turnos (Hito 5).
        return;
    }
  }

  private deliverMatch(
    match: MatchView,
    events: readonly GameEventView[],
    serverTime: string,
  ): void {
    const listener = this.matches.get(match.matchId);
    // Cuando la partida termina o se anula, la suscripción acaba con este aviso.
    if (match.status !== 'IN_PROGRESS') this.matches.delete(match.matchId);
    listener?.onMatch(match, events, serverTime);
  }

  /** Un rechazo responde a una suscripción o a una orden de juego. */
  private onRejection(
    requestId: string,
    payload: Extract<Notification, { type: 'COMMAND_REJECTED' }>['payload'],
  ): void {
    const roomId = this.pendingSubscriptions.get(requestId);
    if (roomId !== undefined) {
      this.pendingSubscriptions.delete(requestId);
      const listener = this.rooms.get(roomId);
      this.rooms.delete(roomId);
      listener?.onRejected(payload.code);
      return;
    }

    const matchId = this.pendingMatchSubscriptions.get(requestId);
    if (matchId !== undefined) {
      this.pendingMatchSubscriptions.delete(requestId);
      const listener = this.matches.get(matchId);
      this.matches.delete(matchId);
      listener?.onRejected(payload.code);
      return;
    }

    const command = this.pendingCommands.get(requestId);
    if (command) {
      this.pendingCommands.delete(requestId);
      command.resolve({
        ok: false,
        code: payload.code,
        ...(payload.reason === undefined ? {} : { reason: payload.reason }),
      });
    }
  }

  private sendSubscribeMatch(matchId: string): void {
    const requestId = this.newRequestId();
    this.pendingMatchSubscriptions.set(requestId, matchId);
    this.send({ type: 'SUBSCRIBE_MATCH', requestId, matchId });
  }

  /**
   * Envía una orden de juego y espera su respuesta. Si no hay conexión
   * ahora mismo, sale al reconectar.
   */
  private sendCommand(command: PendingCommand['command']): Promise<CommandResult> {
    if (this.state.status === 'idle' || this.state.status === 'stopped') {
      return Promise.resolve({ ok: false, code: 'NOT_CONNECTED' });
    }
    return new Promise((resolve) => {
      this.pendingCommands.set(command.requestId, { command, resolve });
      if (this.state.status === 'open') this.send(command);
    });
  }

  private sendSubscribe(roomId: string): void {
    const requestId = this.newRequestId();
    this.pendingSubscriptions.set(requestId, roomId);
    this.send({ type: 'SUBSCRIBE_ROOM', requestId, roomId });
  }

  private send(command: Command): void {
    this.socket?.send(JSON.stringify(command));
  }

  private newRequestId(): string {
    return (this.options.newRequestId ?? (() => crypto.randomUUID()))();
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.options.onState(state);
  }
}
