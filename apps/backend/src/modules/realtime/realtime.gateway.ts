import type { IncomingMessage } from 'node:http';
import {
  CLOSE_CODES,
  type CloseCode,
  type Command,
  type CommandRejectionCode,
  type CommandType,
  ERROR_CATALOG,
  type GameEventView,
  type Notification,
  parseCommand,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_PARAM,
  REALTIME_PATH,
} from '@gameboard/contracts';
import {
  type BeforeApplicationShutdown,
  Inject,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import { Clock } from '../../common/clock.js';
import { AppError } from '../../common/errors/app-error.js';
import {
  CommandRejection,
  type CommandRejectionDetails,
} from '../../common/errors/command-rejection.js';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { type AuthContext, SessionsService } from '../auth/sessions.service.js';
import type { MatchSnapshot } from '../broadcast/match-snapshot.js';
import { Presence } from '../broadcast/presence.js';
import { type RealtimeEvent, RealtimeEvents } from '../broadcast/realtime-events.js';
import { GameSessionsService } from '../game-sessions/game-sessions.service.js';
import { seatOf, toMatchSummary, toMatchView } from '../game-sessions/match-views.js';
import { RoomsService } from '../rooms/rooms.service.js';
import { RealtimeHandshake } from './realtime-handshake.js';
import { FRAME_EVENT } from './realtime-ws.adapter.js';

/** Una notificación antes de ponerle la hora, que se añade al enviarla. */
type Outgoing = Notification extends infer One
  ? One extends Notification
    ? Omit<One, 'serverTime'>
    : never
  : never;

/** Una conexión abierta y aceptada. */
interface Connection {
  readonly socket: WebSocket;
  readonly auth: AuthContext;
  /** Salas a las que está suscrita. El servidor no las recuerda al reconectar. */
  readonly rooms: Set<string>;
  /** Partidas a las que está suscrita. */
  readonly matches: Set<string>;
  /** Respondió al último ping. Si no, la conexión está muerta. */
  alive: boolean;
  /** Las órdenes de una conexión se atienden de una en una, en el orden en que llegan. */
  pending: Promise<void>;
}

/** Una orden de juego que se está atendiendo, y si ya recibió su respuesta. */
interface CommandInFlight {
  readonly connection: Connection;
  answered: boolean;
}

type MatchChanged = Extract<RealtimeEvent, { type: 'MATCH_CHANGED' }>;

/** Cuánto se espera, al apagar, a que los clientes reciban el aviso de cierre. */
const SHUTDOWN_GRACE_MS = 500;

/**
 * El canal de tiempo real (`contracts/02-realtime.md`). Lleva la cuenta de
 * las conexiones y de sus suscripciones, atiende las órdenes y envía las
 * notificaciones. Todo mensaje que sale lo hace por `send`.
 *
 * No decide nada del dominio: pregunta a `rooms` y a `game-sessions`, les
 * pasa las órdenes de juego y escucha lo que los módulos publican en
 * `broadcast` (arquitectura, reglas 6 y 7).
 */
@WebSocketGateway({ path: REALTIME_PATH })
export class RealtimeGateway
  implements
    OnGatewayConnection<WebSocket>,
    OnGatewayDisconnect<WebSocket>,
    OnApplicationBootstrap,
    BeforeApplicationShutdown
{
  private readonly logger = new Logger(RealtimeGateway.name);

  private readonly connections = new Map<WebSocket, Connection>();
  /** Las conexiones de cada jugador, para sus avisos personales. */
  private readonly playerConnections = new Map<string, Set<Connection>>();
  /** Las conexiones suscritas a cada sala. */
  private readonly roomSubscribers = new Map<string, Set<Connection>>();
  /** Las conexiones suscritas a cada partida. */
  private readonly matchSubscribers = new Map<string, Set<Connection>>();
  /** Lo que cada sala o partida tiene pendiente de enviar, para que sus mensajes salgan en orden. */
  private readonly queues = new Map<string, Promise<void>>();
  /** Las órdenes de juego que se están atendiendo, por jugador y petición. */
  private readonly inFlight = new Map<string, CommandInFlight>();

  /**
   * Los jugadores que se quedaron sin conexiones y todavía están dentro del
   * margen antes de darlos por desconectados (ADR-015, decisión V3).
   */
  private readonly departures = new Map<string, NodeJS.Timeout>();

  private stopListening: (() => void) | null = null;
  private timers: NodeJS.Timeout[] = [];
  private stopping = false;

  constructor(
    private readonly handshake: RealtimeHandshake,
    private readonly sessions: SessionsService,
    private readonly rooms: RoomsService,
    private readonly gameSessions: GameSessionsService,
    private readonly presence: Presence,
    private readonly events: RealtimeEvents,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // --- Arranque y parada ---------------------------------------------------

  onApplicationBootstrap(): void {
    this.stopListening = this.events.subscribe((event) => this.onEvent(event));

    // Las pruebas llaman a los latidos y a la revalidación cuando les conviene.
    if (this.config.environment === 'test') return;
    const { heartbeatIntervalMs, sessionCheckIntervalMs } = this.config.realtime;
    this.timers = [
      setInterval(() => this.sendHeartbeats(), heartbeatIntervalMs),
      setInterval(() => void this.revalidateSessions(), sessionCheckIntervalMs),
    ];
    for (const timer of this.timers) timer.unref();
  }

  /** Al apagar, avisa a los clientes de que el servidor se reinicia, para que reconecten. */
  async beforeApplicationShutdown(): Promise<void> {
    // Al apagar nadie se da por desconectado: tras arrancar, la cuenta empieza de nuevo (regla 7.29).
    this.stopping = true;
    for (const timer of this.departures.values()) clearTimeout(timer);
    this.departures.clear();
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
    this.stopListening?.();
    this.stopListening = null;

    const open = [...this.connections.values()];
    if (open.length === 0) return;
    const closed = open.map(
      (connection) => new Promise<void>((resolve) => connection.socket.once('close', resolve)),
    );
    for (const connection of open) this.close(connection.socket, CLOSE_CODES.SERVICE_RESTART);
    await Promise.race([
      Promise.all(closed),
      new Promise((resolve) => setTimeout(resolve, SHUTDOWN_GRACE_MS)),
    ]);
  }

  // --- Conexiones ----------------------------------------------------------

  /**
   * Una conexión que ya pasó la comprobación de origen y de sesión. No hay
   * ninguna espera antes de anotarla: los mensajes del cliente empiezan a
   * atenderse en cuanto este método termina.
   */
  handleConnection(socket: WebSocket, request: IncomingMessage): void {
    const auth = this.handshake.identify(request);
    if (!auth) {
      // Solo puede pasar si la apertura no pasó por la comprobación previa.
      socket.terminate();
      return;
    }

    if (!isSupportedVersion(request)) {
      this.close(socket, CLOSE_CODES.UNSUPPORTED_PROTOCOL_VERSION);
      return;
    }
    const { maxConnectionsPerPlayer, heartbeatIntervalMs, maxMessageBytes } = this.config.realtime;
    if (this.presence.connectionCount(auth.playerId) >= maxConnectionsPerPlayer) {
      this.close(socket, CLOSE_CODES.TOO_MANY_CONNECTIONS);
      return;
    }

    const connection: Connection = {
      socket,
      auth,
      rooms: new Set(),
      matches: new Set(),
      alive: true,
      pending: Promise.resolve(),
    };
    this.connections.set(socket, connection);
    addTo(this.playerConnections, auth.playerId, connection);
    socket.on('pong', () => {
      connection.alive = true;
    });

    this.send(connection, {
      type: 'CONNECTION_ESTABLISHED',
      payload: {
        protocolVersion: PROTOCOL_VERSION,
        playerId: auth.playerId,
        heartbeatIntervalMs,
        maxMessageBytes,
      },
    });

    this.cancelDeparture(auth.playerId);
    if (this.presence.connectionOpened(auth.playerId)) this.playerArrived(auth.playerId);
  }

  handleDisconnect(socket: WebSocket): void {
    const connection = this.connections.get(socket);
    // Una conexión rechazada al abrirse nunca llegó a anotarse.
    if (!connection) return;

    this.connections.delete(socket);
    for (const roomId of connection.rooms) removeFrom(this.roomSubscribers, roomId, connection);
    connection.rooms.clear();
    for (const matchId of connection.matches) {
      removeFrom(this.matchSubscribers, matchId, connection);
    }
    connection.matches.clear();

    const { playerId } = connection.auth;
    removeFrom(this.playerConnections, playerId, connection);
    if (this.presence.connectionClosed(playerId)) this.scheduleDeparture(playerId);
  }

  /**
   * Envía un latido a cada conexión y comprueba que sigue viva con un ping
   * de WebSocket, al que el navegador responde solo (protocolo, sección 2).
   * La que no respondió al ping anterior se da por muerta.
   */
  sendHeartbeats(): void {
    for (const connection of this.connections.values()) {
      if (!connection.alive) {
        connection.socket.terminate();
        continue;
      }
      connection.alive = false;
      connection.socket.ping();
      this.send(connection, { type: 'SERVER_HEARTBEAT' });
    }
  }

  /**
   * Comprueba que la sesión de cada conexión abierta sigue valiendo y
   * cierra las de las sesiones que ya no valen (ADR-004, condición 5.8).
   */
  async revalidateSessions(): Promise<void> {
    const sessionIds = new Set([...this.connections.values()].map((one) => one.auth.sessionId));
    for (const sessionId of sessionIds) {
      try {
        if (!(await this.sessions.revalidate(sessionId))) this.closeSession(sessionId);
      } catch (error) {
        // Si la comprobación falla, la conexión sigue hasta la siguiente.
        this.logger.error(`Falló la revalidación de una sesión: ${String(error)}`);
      }
    }
  }

  // --- Órdenes -------------------------------------------------------------

  @SubscribeMessage(FRAME_EVENT)
  onFrame(socket: WebSocket, text: string | null): void {
    const connection = this.connections.get(socket);
    if (!connection) return;

    connection.pending = connection.pending
      .then(() => this.handleFrame(connection, text))
      .catch((error: unknown) => {
        this.logger.error(`Falló el tratamiento de un mensaje: ${String(error)}`);
      });
  }

  /** Toda orden recibe exactamente una respuesta, con su mismo `requestId` (protocolo, sección 3). */
  private async handleFrame(connection: Connection, text: string | null): Promise<void> {
    const parsed = text === null ? null : parseCommand(text);
    if (!parsed?.ok) {
      this.reject(connection, 'INVALID_MESSAGE', parsed?.commandType ?? null, parsed?.requestId);
      return;
    }

    const { command } = parsed;
    try {
      await this.execute(connection, command);
    } catch (error) {
      let code: CommandRejectionCode = 'INTERNAL_ERROR';
      let details: CommandRejectionDetails = {};
      if (error instanceof CommandRejection) {
        ({ code, details } = error);
      } else if (error instanceof AppError && ERROR_CATALOG[error.code].realtime) {
        code = error.code as CommandRejectionCode;
      } else {
        this.logger.error(
          `Falló la orden ${command.type}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      this.reject(connection, code, command.type, command.requestId, details);
    }
  }

  private async execute(connection: Connection, command: Command): Promise<void> {
    // Quién actúa sale siempre de la sesión de la conexión, nunca del mensaje.
    const { playerId } = connection.auth;
    switch (command.type) {
      case 'SUBSCRIBE_ROOM':
        return this.subscribeToRoom(connection, command.roomId, command.requestId);

      case 'UNSUBSCRIBE_ROOM':
        // Dejar de estar suscrito a algo a lo que no se estaba suscrito no es un error.
        removeFrom(this.roomSubscribers, command.roomId, connection);
        connection.rooms.delete(command.roomId);
        this.send(connection, {
          type: 'ROOM_UNSUBSCRIBED',
          requestId: command.requestId,
          roomId: command.roomId,
        });
        return;

      case 'SUBSCRIBE_MATCH':
        return this.subscribeToMatch(connection, command.matchId, command.requestId);

      case 'UNSUBSCRIBE_MATCH':
        removeFrom(this.matchSubscribers, command.matchId, connection);
        connection.matches.delete(command.matchId);
        this.send(connection, {
          type: 'MATCH_UNSUBSCRIBED',
          requestId: command.requestId,
          matchId: command.matchId,
        });
        return;

      case 'SUBMIT_ACTION':
        return this.answerWithMatch(connection, command.matchId, command.requestId, () =>
          this.gameSessions.submitAction(
            playerId,
            command.matchId,
            command.requestId,
            command.payload.stateVersion,
            command.payload.action,
          ),
        );

      case 'RESIGN_MATCH':
        return this.answerWithMatch(connection, command.matchId, command.requestId, () =>
          this.gameSessions.resign(playerId, command.matchId, command.requestId),
        );
    }
  }

  /**
   * Suscribe la conexión a una sala y le envía su estado completo. Pasa
   * por la cola de la sala: así ningún cambio se cuela entre la lectura del
   * estado y el alta de la suscripción.
   */
  private subscribeToRoom(
    connection: Connection,
    roomId: string,
    requestId: string,
  ): Promise<void> {
    if (!connection.rooms.has(roomId)) this.assertCanSubscribe(connection);

    return this.inOrder(roomKey(roomId), async () => {
      // Rechaza si la sala no existe, está cerrada o quien pide no es miembro.
      const room = await this.rooms.getForSubscriber(roomId, connection.auth.playerId);
      if (!this.connections.has(connection.socket)) return;

      connection.rooms.add(roomId);
      addTo(this.roomSubscribers, roomId, connection);
      this.send(connection, { type: 'ROOM_SUBSCRIBED', requestId, roomId, payload: { room } });
    });
  }

  /**
   * Suscribe la conexión a una partida y le envía su estado completo, desde
   * el asiento de quien la pide. Pasa por la cola de la partida, igual que
   * las salas. Una partida que ya no está en curso se responde con su
   * estado final y no deja suscripción (ADR-014, decisión K17).
   */
  private subscribeToMatch(
    connection: Connection,
    matchId: string,
    requestId: string,
  ): Promise<void> {
    if (!connection.matches.has(matchId)) this.assertCanSubscribe(connection);

    return this.inOrder(matchKey(matchId), async () => {
      // Rechaza si la partida no existe o quien pide no es participante.
      const { snapshot, seat } = await this.gameSessions.getForPlayer(
        matchId,
        connection.auth.playerId,
      );
      if (!this.connections.has(connection.socket)) return;

      if (snapshot.status === 'IN_PROGRESS') {
        connection.matches.add(matchId);
        addTo(this.matchSubscribers, matchId, connection);
      }
      const now = this.clock.now();
      this.send(
        connection,
        {
          type: 'MATCH_SUBSCRIBED',
          requestId,
          matchId,
          payload: { match: this.matchViewFor(snapshot, seat, now) },
        },
        now,
      );
    });
  }

  /**
   * Atiende una orden de juego, que se responde con la partida como queda
   * (protocolo, sección 5). Si la orden cambió la partida, su respuesta
   * sale junto con el aviso a los demás, en el orden de la partida. Si no
   * cambió nada, porque era una petición repetida, se responde aquí.
   */
  private async answerWithMatch(
    connection: Connection,
    matchId: string,
    requestId: string,
    run: () => Promise<MatchSnapshot>,
  ): Promise<void> {
    const key = originKey(connection.auth.playerId, requestId);
    const command: CommandInFlight = { connection, answered: false };
    this.inFlight.set(key, command);
    let snapshot: MatchSnapshot;
    try {
      snapshot = await run();
    } finally {
      this.inFlight.delete(key);
    }

    await this.inOrder(matchKey(matchId), () => {
      if (!command.answered) this.sendMatchUpdate(connection, snapshot, [], requestId);
      return Promise.resolve();
    });
  }

  private assertCanSubscribe(connection: Connection): void {
    const { maxSubscriptionsPerConnection } = this.config.realtime;
    if (connection.rooms.size + connection.matches.size >= maxSubscriptionsPerConnection) {
      throw new AppError('RATE_LIMITED', 'Too many subscriptions on this connection');
    }
  }

  private reject(
    connection: Connection,
    code: CommandRejectionCode,
    commandType: CommandType | null,
    requestId?: string | null,
    details: CommandRejectionDetails = {},
  ): void {
    this.send(connection, {
      type: 'COMMAND_REJECTED',
      ...(requestId ? { requestId } : {}),
      payload: { code, commandType, ...details },
    });
  }

  // --- Avisos --------------------------------------------------------------

  private onEvent(event: RealtimeEvent): void {
    switch (event.type) {
      case 'ROOM_CHANGED':
        this.announceRoom(event.roomId);
        return;

      case 'ROOM_CLOSED':
        void this.inOrder(roomKey(event.roomId), () => {
          const subscribers = this.roomSubscribers.get(event.roomId);
          if (!subscribers) return Promise.resolve();
          // La suscripción termina con este mensaje.
          this.roomSubscribers.delete(event.roomId);
          for (const connection of subscribers) {
            connection.rooms.delete(event.roomId);
            this.send(connection, {
              type: 'ROOM_CLOSED',
              roomId: event.roomId,
              payload: { closeReason: event.closeReason },
            });
          }
          return Promise.resolve();
        }).catch((error: unknown) => this.logFailedAnnouncement(event.roomId, error));
        return;

      case 'MATCH_CHANGED':
        this.announceMatchChange(event);
        return;

      case 'SESSION_ENDED':
        this.closeSession(event.sessionId);
        return;
    }
  }

  /**
   * Envía el estado completo de la sala a sus suscriptores (protocolo,
   * decisión T3). El estado se lee en el momento de enviar, así que varios
   * cambios seguidos acaban siempre con el estado más reciente.
   */
  private announceRoom(roomId: string): void {
    if (!this.roomSubscribers.has(roomId)) return;

    void this.inOrder(roomKey(roomId), async () => {
      const subscribers = this.roomSubscribers.get(roomId);
      if (!subscribers) return;
      const room = await this.rooms.findOpenView(roomId);
      // Si la sala se cerró, lo que llega después es su aviso de cierre.
      if (!room) return;

      const members = new Set(room.members.map((member) => member.playerId));
      for (const connection of [...subscribers]) {
        if (members.has(connection.auth.playerId)) {
          this.send(connection, { type: 'ROOM_UPDATED', roomId, payload: { room } });
        } else {
          // Quien salió de la sala deja de recibir sus cambios.
          removeFrom(this.roomSubscribers, roomId, connection);
          connection.rooms.delete(roomId);
        }
      }
    }).catch((error: unknown) => this.logFailedAnnouncement(roomId, error));
  }

  /**
   * Una partida empezó, cambió con una jugada, terminó o se anuló. Cada
   * suscriptor recibe lo que ve su asiento, y quien envió la orden recibe
   * su copia con el `requestId`, esté suscrito o no (protocolo, sección 3).
   * Cada participante recibe además su aviso personal en todas sus
   * conexiones (ADR-014, decisión K14).
   */
  private announceMatchChange({ snapshot, events, origin }: MatchChanged): void {
    const { matchId } = snapshot;
    // Se mira ahora quién envió la orden: cuando le toque a la cola, ya no constará.
    const command = origin && this.inFlight.get(originKey(origin.playerId, origin.requestId));
    if (command) command.answered = true;

    void this.inOrder(matchKey(matchId), () => {
      const now = this.clock.now();
      const subscribers = this.matchSubscribers.get(matchId);
      const recipients = new Set(subscribers);
      if (command) recipients.add(command.connection);
      for (const connection of recipients) {
        const requestId = connection === command?.connection ? origin?.requestId : undefined;
        this.sendMatchUpdate(connection, snapshot, events, requestId, now);
      }

      for (const [seat, player] of snapshot.players.entries()) {
        const summary = toMatchSummary(snapshot, seat);
        for (const connection of this.playerConnections.get(player.playerId) ?? []) {
          this.send(
            connection,
            { type: 'PLAYER_MATCH_UPDATED', matchId, payload: { match: summary } },
            now,
          );
        }
      }

      // Cuando la partida termina o se anula, la suscripción acaba con ese último mensaje.
      if (snapshot.status !== 'IN_PROGRESS' && subscribers) {
        this.matchSubscribers.delete(matchId);
        for (const connection of subscribers) connection.matches.delete(matchId);
      }
      return Promise.resolve();
    }).catch((error: unknown) => {
      this.logger.error(
        `No se pudo avisar de un cambio de la partida ${matchId}: ${String(error)}`,
      );
    });
  }

  /** Avisa a los suscriptores de una partida en curso de que cambió la presencia de un jugador. */
  private announceMatchPresence(matchId: string): void {
    if (!this.matchSubscribers.has(matchId)) return;

    void this.inOrder(matchKey(matchId), async () => {
      if (!this.matchSubscribers.has(matchId)) return;
      const snapshot = await this.gameSessions.findSnapshot(matchId);
      // Si la partida terminó, lo que llega después es su último aviso.
      if (!snapshot || snapshot.status !== 'IN_PROGRESS') return;

      const now = this.clock.now();
      for (const connection of this.matchSubscribers.get(matchId) ?? []) {
        this.sendMatchUpdate(connection, snapshot, [], undefined, now);
      }
    }).catch((error: unknown) => {
      this.logger.error(
        `No se pudo avisar de la presencia en la partida ${matchId}: ${String(error)}`,
      );
    });
  }

  private sendMatchUpdate(
    connection: Connection,
    snapshot: MatchSnapshot,
    events: readonly GameEventView[],
    requestId: string | undefined,
    now: Date = this.clock.now(),
  ): void {
    const seat = seatOf(snapshot, connection.auth.playerId);
    if (seat === undefined) return;
    this.send(
      connection,
      {
        type: 'MATCH_UPDATED',
        ...(requestId ? { requestId } : {}),
        matchId: snapshot.matchId,
        payload: { match: this.matchViewFor(snapshot, seat, now), events },
      },
      now,
    );
  }

  private matchViewFor(snapshot: MatchSnapshot, seat: number, now: Date) {
    return toMatchView(snapshot, seat, now, this.gameSessions.presenceIn(snapshot.matchId));
  }

  // --- Presencia ------------------------------------------------------------

  /**
   * Un jugador se quedó sin conexiones. Se le da por desconectado si sigue
   * así pasado el margen (ADR-015, decisión V3).
   */
  private scheduleDeparture(playerId: string): void {
    if (this.stopping) return;
    const { disconnectGraceMs } = this.config.realtime;
    this.cancelDeparture(playerId);
    if (disconnectGraceMs === 0) {
      this.playerDeparted(playerId);
      return;
    }
    const timer = setTimeout(() => {
      this.departures.delete(playerId);
      this.playerDeparted(playerId);
    }, disconnectGraceMs);
    timer.unref();
    this.departures.set(playerId, timer);
  }

  private cancelDeparture(playerId: string): void {
    const timer = this.departures.get(playerId);
    if (timer) clearTimeout(timer);
    this.departures.delete(playerId);
  }

  /** Un jugador pasa a estar presente: deja de contar su ausencia y lo ven los demás. */
  private playerArrived(playerId: string): void {
    this.gameSessions
      .playerConnected(playerId)
      .catch((error: unknown) => {
        this.logger.error(`No se pudo anotar la vuelta de un jugador: ${String(error)}`);
      })
      .finally(() => this.announcePresence(playerId));
  }

  /** Pasado el margen, un jugador sin conexiones se da por desconectado (regla 7.26). */
  private playerDeparted(playerId: string): void {
    if (!this.presence.markAbsent(playerId)) return;
    this.gameSessions
      .playerDisconnected(playerId)
      .catch((error: unknown) => {
        this.logger.error(`No se pudo anotar la ausencia de un jugador: ${String(error)}`);
      })
      .finally(() => this.announcePresence(playerId));
  }

  /**
   * Un jugador se conectó o se desconectó: lo ven los suscritos a sus
   * salas y a sus partidas en curso (protocolo, sección 7; ADR-014,
   * decisión K13).
   */
  private announcePresence(playerId: string): void {
    this.rooms
      .findOpenRoomIdsOf(playerId)
      .then((roomIds) => {
        for (const roomId of roomIds) this.announceRoom(roomId);
        return this.gameSessions.findInProgressMatchIdsOf(playerId);
      })
      .then((matchIds) => {
        for (const matchId of matchIds) this.announceMatchPresence(matchId);
      })
      .catch((error: unknown) => {
        this.logger.error(`No se pudo avisar de la presencia de un jugador: ${String(error)}`);
      });
  }

  private logFailedAnnouncement(roomId: string, error: unknown): void {
    this.logger.error(`No se pudo avisar de un cambio de la sala ${roomId}: ${String(error)}`);
  }

  // --- Piezas --------------------------------------------------------------

  /** Ejecuta `task` cuando haya terminado todo lo anterior de esa sala o de esa partida. */
  private inOrder(key: string, task: () => Promise<void>): Promise<void> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    // La cola sigue aunque una tarea falle; el fallo lo recibe quien la encargó.
    const tail = result.catch(() => undefined);
    this.queues.set(key, tail);
    void tail.then(() => {
      if (this.queues.get(key) === tail) this.queues.delete(key);
    });
    return result;
  }

  private closeSession(sessionId: string): void {
    for (const connection of this.connections.values()) {
      if (connection.auth.sessionId === sessionId) {
        this.close(connection.socket, CLOSE_CODES.SESSION_ENDED);
      }
    }
  }

  private close(socket: WebSocket, code: CloseCode): void {
    if (socket.readyState === socket.OPEN) socket.close(code);
  }

  /**
   * El único punto por el que sale un mensaje. Le pone la hora del
   * servidor: `now`, si el mensaje lleva relojes medidos en ese instante.
   */
  private send(connection: Connection, message: Outgoing, now: Date = this.clock.now()): void {
    const { socket } = connection;
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify({ ...message, serverTime: now.toISOString() }));
  }
}

function roomKey(roomId: string): string {
  return `room:${roomId}`;
}

function matchKey(matchId: string): string {
  return `match:${matchId}`;
}

function originKey(playerId: string, requestId: string): string {
  return `${playerId}:${requestId}`;
}

function addTo<Key>(index: Map<Key, Set<Connection>>, key: Key, connection: Connection): void {
  let connections = index.get(key);
  if (!connections) {
    connections = new Set();
    index.set(key, connections);
  }
  connections.add(connection);
}

function removeFrom<Key>(index: Map<Key, Set<Connection>>, key: Key, connection: Connection): void {
  const connections = index.get(key);
  if (!connections) return;
  connections.delete(connection);
  if (connections.size === 0) index.delete(key);
}

function isSupportedVersion(request: IncomingMessage): boolean {
  const { searchParams } = new URL(request.url ?? '/', 'ws://localhost');
  return searchParams.get(PROTOCOL_VERSION_PARAM) === String(PROTOCOL_VERSION);
}
