import type { IncomingMessage } from 'node:http';
import {
  CLOSE_CODES,
  type CloseCode,
  type Command,
  type CommandRejectionCode,
  type CommandType,
  ERROR_CATALOG,
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
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { type AuthContext, SessionsService } from '../auth/sessions.service.js';
import { Presence } from '../broadcast/presence.js';
import { type RealtimeEvent, RealtimeEvents } from '../broadcast/realtime-events.js';
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
  /** Respondió al último ping. Si no, la conexión está muerta. */
  alive: boolean;
  /** Las órdenes de una conexión se atienden de una en una, en el orden en que llegan. */
  pending: Promise<void>;
}

/** Cuánto se espera, al apagar, a que los clientes reciban el aviso de cierre. */
const SHUTDOWN_GRACE_MS = 500;

/**
 * El canal de tiempo real (`contracts/02-realtime.md`). Lleva la cuenta de
 * las conexiones y de sus suscripciones, atiende las órdenes y envía las
 * notificaciones. Todo mensaje que sale lo hace por `send`.
 *
 * No decide nada del dominio: pregunta a `rooms` y escucha lo que los
 * módulos publican en `broadcast` (arquitectura, reglas 6 y 7).
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
  /** Las conexiones suscritas a cada sala. */
  private readonly roomSubscribers = new Map<string, Set<Connection>>();
  /** Lo que cada sala tiene pendiente de enviar, para que sus mensajes salgan en orden. */
  private readonly roomQueues = new Map<string, Promise<void>>();

  private stopListening: (() => void) | null = null;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly handshake: RealtimeHandshake,
    private readonly sessions: SessionsService,
    private readonly rooms: RoomsService,
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
      alive: true,
      pending: Promise.resolve(),
    };
    this.connections.set(socket, connection);
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

    if (this.presence.connectionOpened(auth.playerId)) this.announcePresence(auth.playerId);
  }

  handleDisconnect(socket: WebSocket): void {
    const connection = this.connections.get(socket);
    // Una conexión rechazada al abrirse nunca llegó a anotarse.
    if (!connection) return;

    this.connections.delete(socket);
    for (const roomId of connection.rooms) this.removeSubscriber(roomId, connection);
    connection.rooms.clear();

    const { playerId } = connection.auth;
    if (this.presence.connectionClosed(playerId)) this.announcePresence(playerId);
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
      if (error instanceof AppError && ERROR_CATALOG[error.code].realtime) {
        code = error.code as CommandRejectionCode;
      } else {
        this.logger.error(
          `Falló la orden ${command.type}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      this.reject(connection, code, command.type, command.requestId);
    }
  }

  private async execute(connection: Connection, command: Command): Promise<void> {
    switch (command.type) {
      case 'SUBSCRIBE_ROOM':
        return this.subscribeToRoom(connection, command.roomId, command.requestId);

      case 'UNSUBSCRIBE_ROOM':
        // Dejar de estar suscrito a algo a lo que no se estaba suscrito no es un error.
        this.removeSubscriber(command.roomId, connection);
        connection.rooms.delete(command.roomId);
        this.send(connection, {
          type: 'ROOM_UNSUBSCRIBED',
          requestId: command.requestId,
          roomId: command.roomId,
        });
        return;

      case 'UNSUBSCRIBE_MATCH':
        this.send(connection, {
          type: 'MATCH_UNSUBSCRIBED',
          requestId: command.requestId,
          matchId: command.matchId,
        });
        return;

      case 'SUBSCRIBE_MATCH':
      case 'SUBMIT_ACTION':
      case 'RESIGN_MATCH':
        // Todavía no existe ninguna partida (ADR-013, decisión H12).
        throw new AppError('MATCH_NOT_FOUND', 'The match does not exist');
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
    const { maxSubscriptionsPerConnection } = this.config.realtime;
    if (!connection.rooms.has(roomId) && connection.rooms.size >= maxSubscriptionsPerConnection) {
      throw new AppError('RATE_LIMITED', 'Too many subscriptions on this connection');
    }

    return this.inRoomOrder(roomId, async () => {
      // Rechaza si la sala no existe, está cerrada o quien pide no es miembro.
      const room = await this.rooms.getForSubscriber(roomId, connection.auth.playerId);
      if (!this.connections.has(connection.socket)) return;

      connection.rooms.add(roomId);
      let subscribers = this.roomSubscribers.get(roomId);
      if (!subscribers) {
        subscribers = new Set();
        this.roomSubscribers.set(roomId, subscribers);
      }
      subscribers.add(connection);
      this.send(connection, { type: 'ROOM_SUBSCRIBED', requestId, roomId, payload: { room } });
    });
  }

  private reject(
    connection: Connection,
    code: CommandRejectionCode,
    commandType: CommandType | null,
    requestId?: string | null,
  ): void {
    this.send(connection, {
      type: 'COMMAND_REJECTED',
      ...(requestId ? { requestId } : {}),
      payload: { code, commandType },
    });
  }

  // --- Avisos --------------------------------------------------------------

  private onEvent(event: RealtimeEvent): void {
    switch (event.type) {
      case 'ROOM_CHANGED':
        this.announceRoom(event.roomId);
        return;

      case 'ROOM_CLOSED':
        void this.inRoomOrder(event.roomId, () => {
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

    void this.inRoomOrder(roomId, async () => {
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
          this.removeSubscriber(roomId, connection);
          connection.rooms.delete(roomId);
        }
      }
    }).catch((error: unknown) => this.logFailedAnnouncement(roomId, error));
  }

  /** Un jugador se conectó o se desconectó: lo ven los suscritos a sus salas (protocolo, sección 7). */
  private announcePresence(playerId: string): void {
    this.rooms
      .findOpenRoomIdsOf(playerId)
      .then((roomIds) => {
        for (const roomId of roomIds) this.announceRoom(roomId);
      })
      .catch((error: unknown) => {
        this.logger.error(`No se pudo avisar de la presencia de un jugador: ${String(error)}`);
      });
  }

  private logFailedAnnouncement(roomId: string, error: unknown): void {
    this.logger.error(`No se pudo avisar de un cambio de la sala ${roomId}: ${String(error)}`);
  }

  // --- Piezas --------------------------------------------------------------

  /** Ejecuta `task` cuando haya terminado todo lo anterior de esa sala. */
  private inRoomOrder(roomId: string, task: () => Promise<void>): Promise<void> {
    const previous = this.roomQueues.get(roomId) ?? Promise.resolve();
    const result = previous.then(task);
    // La cola sigue aunque una tarea falle; el fallo lo recibe quien la encargó.
    const tail = result.catch(() => undefined);
    this.roomQueues.set(roomId, tail);
    void tail.then(() => {
      if (this.roomQueues.get(roomId) === tail) this.roomQueues.delete(roomId);
    });
    return result;
  }

  private removeSubscriber(roomId: string, connection: Connection): void {
    const subscribers = this.roomSubscribers.get(roomId);
    if (!subscribers) return;
    subscribers.delete(connection);
    if (subscribers.size === 0) this.roomSubscribers.delete(roomId);
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

  /** El único punto por el que sale un mensaje. Le pone la hora del servidor. */
  private send(connection: Connection, message: Outgoing): void {
    const { socket } = connection;
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify({ ...message, serverTime: this.clock.now().toISOString() }));
  }
}

function isSupportedVersion(request: IncomingMessage): boolean {
  const { searchParams } = new URL(request.url ?? '/', 'ws://localhost');
  return searchParams.get(PROTOCOL_VERSION_PARAM) === String(PROTOCOL_VERSION);
}
