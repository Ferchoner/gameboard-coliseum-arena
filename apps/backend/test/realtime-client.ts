import { randomUUID } from 'node:crypto';
import {
  type Command,
  type Notification,
  PROTOCOL_VERSION,
  PROTOCOL_VERSION_PARAM,
  REALTIME_PATH,
} from '@gameboard/contracts';
import { WebSocket } from 'ws';
import { FRONTEND_ORIGIN } from './app.js';

export interface OpenOptions {
  /** La cabecera `Cookie` de la sesión. Sin ella, la apertura no lleva sesión. */
  readonly cookie?: string;
  /** La cabecera `Origin`. Por defecto, la del frontend. `null` para no enviarla. */
  readonly origin?: string | null;
  /** La versión del protocolo que se pide. `null` para no indicar ninguna. */
  readonly protocolVersion?: string | null;
  /** Si responde solo a los pings del servidor, como hace un navegador. */
  readonly autoPong?: boolean;
}

export interface Closure {
  readonly code: number;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Una orden sin su `requestId`, que pone el cliente de prueba. */
export type CommandInput = DistributiveOmit<Command, 'requestId'>;

const WAIT_MS = 3000;

/**
 * Un cliente real del canal de tiempo real, para las pruebas (ADR-013,
 * decisión H18). Guarda lo que recibe para poder esperarlo en orden.
 */
export class TestSocket {
  /** Mensajes recibidos que ninguna espera ha consumido todavía. */
  private readonly unread: Notification[] = [];
  private readonly waiters: (() => void)[] = [];
  readonly closed: Promise<Closure>;

  private constructor(private readonly socket: WebSocket) {
    socket.on('message', (data) => {
      this.unread.push(JSON.parse(String(data)) as Notification);
      for (const wake of this.waiters.splice(0)) wake();
    });
    this.closed = new Promise((resolve) => {
      socket.on('close', (code) => resolve({ code }));
    });
  }

  /** Abre una conexión. Si el servidor rechaza la apertura, falla con su estado HTTP. */
  static open(server: string, options: OpenOptions = {}): Promise<TestSocket> {
    const version =
      options.protocolVersion === undefined ? String(PROTOCOL_VERSION) : options.protocolVersion;
    const query = version === null ? '' : `?${PROTOCOL_VERSION_PARAM}=${version}`;
    const origin = options.origin === undefined ? FRONTEND_ORIGIN : options.origin;

    const socket = new WebSocket(`${server}${REALTIME_PATH}${query}`, {
      headers: {
        ...(options.cookie ? { Cookie: options.cookie } : {}),
        ...(origin === null ? {} : { Origin: origin }),
      },
      autoPong: options.autoPong ?? true,
    });
    const client = new TestSocket(socket);

    return new Promise((resolve, reject) => {
      socket.once('open', () => resolve(client));
      socket.once('unexpected-response', (_request, response) => {
        reject(new HandshakeRejected(response.statusCode ?? 0));
        socket.terminate();
      });
      socket.once('error', (error) => reject(error));
    });
  }

  /** Espera el siguiente mensaje que cumpla la condición y lo consume, junto con los anteriores. */
  async next<T extends Notification = Notification>(
    matches: (message: Notification) => boolean = () => true,
  ): Promise<T> {
    const deadline = Date.now() + WAIT_MS;
    for (;;) {
      const index = this.unread.findIndex(matches);
      if (index !== -1) {
        const [message] = this.unread.splice(0, index + 1).slice(-1);
        return message as T;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `No llegó el mensaje esperado. Sin leer: ${JSON.stringify(this.unread.map((one) => one.type))}`,
        );
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, remaining);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  /** Espera el siguiente mensaje de ese tipo. */
  nextOfType<Type extends Notification['type']>(
    type: Type,
  ): Promise<Extract<Notification, { type: Type }>> {
    return this.next((message) => message.type === type);
  }

  /** Envía una orden y espera su respuesta, que es la que lleva su mismo `requestId`. */
  async command(input: CommandInput): Promise<Notification> {
    const requestId = randomUUID();
    this.sendRaw(JSON.stringify({ ...input, requestId }));
    const response = await this.next(
      (message) => (message as { requestId?: string }).requestId === requestId,
    );
    return response;
  }

  sendRaw(data: string | Buffer): void {
    this.socket.send(data);
  }

  /** Deja pasar un momento y devuelve lo recibido que nadie ha consumido. */
  async quiet(ms = 150): Promise<Notification[]> {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return this.unread.splice(0);
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    this.socket.close();
    await this.closed;
  }
}

export class HandshakeRejected extends Error {
  constructor(readonly status: number) {
    super(`El servidor rechazó la apertura con el estado ${status}`);
  }
}
