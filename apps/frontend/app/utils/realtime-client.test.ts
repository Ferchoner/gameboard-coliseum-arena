import type { RoomView } from '@gameboard/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ConnectionState,
  RealtimeClient,
  realtimeUrl,
  reconnectDelay,
  type RoomListener,
  type SocketLike,
} from './realtime-client';

/** Un WebSocket de mentira que las pruebas manejan a mano. */
class FakeSocket implements SocketLike {
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  readonly sent: Record<string, unknown>[] = [];
  closedByClient = false;

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.closedByClient = true;
  }

  receive(message: object): void {
    this.onmessage?.({
      data: JSON.stringify({ serverTime: '2026-11-16T00:00:00.000Z', ...message }),
    });
  }

  welcome(heartbeatIntervalMs = 25_000): void {
    this.receive({
      type: 'CONNECTION_ESTABLISHED',
      payload: { protocolVersion: 1, playerId: 'p', heartbeatIntervalMs, maxMessageBytes: 16384 },
    });
  }

  drop(code = 1006): void {
    this.onclose?.({ code });
  }
}

const ROOM = { roomId: 'room-1', status: 'WAITING' } as unknown as RoomView;

function listener() {
  return { onRoom: vi.fn(), onClosed: vi.fn(), onRejected: vi.fn() } satisfies RoomListener;
}

describe('cliente del canal de tiempo real', () => {
  let sockets: FakeSocket[];
  let states: ConnectionState['status'][];
  let canRetry: () => Promise<boolean>;
  let client: RealtimeClient;
  let nextId: number;

  const last = () => sockets.at(-1) as FakeSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    states = [];
    nextId = 0;
    canRetry = () => Promise.resolve(true);
    client = new RealtimeClient({
      url: 'ws://api.test/realtime?protocolVersion=1',
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onState: (state) => states.push(state.status),
      canRetry: () => canRetry(),
      newRequestId: () => `request-${(nextId += 1)}`,
      // Sin variación: las esperas son exactas.
      random: () => 0.5,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('está abierta cuando llega el mensaje de bienvenida', () => {
    client.start();
    expect(states).toEqual(['connecting']);

    last().welcome();

    expect(states).toEqual(['connecting', 'open']);
  });

  it('se suscribe a una sala y entrega su estado, al suscribirse y en cada cambio', () => {
    const room = listener();
    client.start();
    last().welcome();

    client.subscribeRoom('room-1', room);

    expect(last().sent).toEqual([
      { type: 'SUBSCRIBE_ROOM', requestId: 'request-1', roomId: 'room-1' },
    ]);
    last().receive({
      type: 'ROOM_SUBSCRIBED',
      requestId: 'request-1',
      roomId: 'room-1',
      payload: { room: ROOM },
    });
    last().receive({ type: 'ROOM_UPDATED', roomId: 'room-1', payload: { room: ROOM } });
    last().receive({ type: 'ROOM_UPDATED', roomId: 'otra', payload: { room: ROOM } });

    expect(room.onRoom).toHaveBeenCalledTimes(2);
    expect(room.onRoom).toHaveBeenCalledWith(ROOM);
  });

  it('una suscripción pedida antes de conectar se envía al abrirse la conexión', () => {
    client.subscribeRoom('room-1', listener());
    client.start();
    expect(last().sent).toEqual([]);

    last().welcome();

    expect(last().sent).toMatchObject([{ type: 'SUBSCRIBE_ROOM', roomId: 'room-1' }]);
  });

  it('al dejar una suscripción avisa al servidor y deja de entregar cambios', () => {
    const room = listener();
    client.start();
    last().welcome();
    const unsubscribe = client.subscribeRoom('room-1', room);

    unsubscribe();
    last().receive({ type: 'ROOM_UPDATED', roomId: 'room-1', payload: { room: ROOM } });

    expect(last().sent.at(-1)).toMatchObject({ type: 'UNSUBSCRIBE_ROOM', roomId: 'room-1' });
    expect(room.onRoom).not.toHaveBeenCalled();
  });

  it('avisa del cierre de la sala y del rechazo de la suscripción, y las da por terminadas', () => {
    const [closed, rejected] = [listener(), listener()];
    client.start();
    last().welcome();
    client.subscribeRoom('room-1', closed);
    client.subscribeRoom('room-2', rejected);

    last().receive({
      type: 'ROOM_CLOSED',
      roomId: 'room-1',
      payload: { closeReason: 'OWNER_LEFT' },
    });
    last().receive({
      type: 'COMMAND_REJECTED',
      requestId: 'request-2',
      payload: { code: 'PLAYER_NOT_IN_ROOM', commandType: 'SUBSCRIBE_ROOM' },
    });
    // Tras reconectar no se vuelven a pedir.
    last().drop();
    vi.advanceTimersByTime(1000);

    expect(closed.onClosed).toHaveBeenCalledWith('OWNER_LEFT');
    expect(rejected.onRejected).toHaveBeenCalledWith('PLAYER_NOT_IN_ROOM');
  });

  it('si se corta la conexión, reconecta y vuelve a suscribirse a lo que mostraba', async () => {
    const room = listener();
    client.start();
    last().welcome();
    client.subscribeRoom('room-1', room);

    last().drop();
    expect(states.at(-1)).toBe('reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(2);
    last().welcome();

    expect(states.at(-1)).toBe('open');
    expect(last().sent).toMatchObject([{ type: 'SUBSCRIBE_ROOM', roomId: 'room-1' }]);
  });

  it('espera cada vez más entre reintentos: 1 segundo, 2, 4… hasta 30', async () => {
    client.start();
    const waits = [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000];

    for (const wait of waits) {
      const before = sockets.length;
      last().drop();
      await vi.advanceTimersByTimeAsync(wait - 1);
      expect(sockets).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(before + 1);
    }
  });

  it('tras conectar de nuevo, la espera vuelve a empezar en 1 segundo', async () => {
    client.start();
    last().drop();
    await vi.advanceTimersByTimeAsync(1000);
    last().drop();
    await vi.advanceTimersByTimeAsync(2000);
    last().welcome();

    last().drop();
    await vi.advanceTimersByTimeAsync(1000);

    expect(sockets).toHaveLength(4);
  });

  it.each([
    [4001, 'SESSION_ENDED'],
    [4002, 'UNSUPPORTED_VERSION'],
    [4003, 'TOO_MANY_CONNECTIONS'],
    [1008, 'PROTOCOL_ERROR'],
    [1009, 'PROTOCOL_ERROR'],
  ])('no reconecta si el servidor cierra con %i', async (code, reason) => {
    const seen: ConnectionState[] = [];
    client = new RealtimeClient({
      url: 'ws://api.test/realtime',
      createSocket: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onState: (state) => seen.push(state),
      canRetry: () => Promise.resolve(true),
    });
    client.start();
    last().welcome();

    last().drop(code);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sockets).toHaveLength(1);
    expect(seen.at(-1)).toEqual({ status: 'stopped', reason });
  });

  it('reconecta si el servidor avisa de que se reinicia', async () => {
    client.start();
    last().welcome();

    last().drop(1012);
    await vi.advanceTimersByTimeAsync(1000);

    expect(sockets).toHaveLength(2);
  });

  it('antes de reintentar comprueba la sesión, y si ya no hay deja de intentarlo', async () => {
    canRetry = () => Promise.resolve(false);
    client.start();

    last().drop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(sockets).toHaveLength(1);
    expect(states.at(-1)).toBe('stopped');
  });

  it('si no puede comprobar la sesión, sigue intentándolo', async () => {
    canRetry = () => Promise.reject(new Error('sin red'));
    client.start();
    last().drop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sockets).toHaveLength(1);

    canRetry = () => Promise.resolve(true);
    await vi.advanceTimersByTimeAsync(2000);

    expect(sockets).toHaveLength(2);
  });

  it('da la conexión por perdida si pasa el doble del intervalo de latidos sin recibir nada', async () => {
    client.start();
    last().welcome(10_000);

    await vi.advanceTimersByTimeAsync(15_000);
    last().receive({ type: 'SERVER_HEARTBEAT' });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(states.at(-1)).toBe('open');

    await vi.advanceTimersByTimeAsync(1);

    expect(sockets[0]?.closedByClient).toBe(true);
    expect(states.at(-1)).toBe('reconnecting');
  });

  it('al parar cierra la conexión y no reconecta', async () => {
    client.start();
    last().welcome();

    client.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(last().closedByClient).toBe(true);
    expect(states.at(-1)).toBe('idle');
    expect(sockets).toHaveLength(1);
  });

  it('se puede volver a arrancar después de parar o de un cierre definitivo', () => {
    client.start();
    last().drop(4001);

    client.start();

    expect(sockets).toHaveLength(2);
    expect(states.at(-1)).toBe('connecting');
  });
});

describe('espera entre reintentos', () => {
  it('varía un 20 % alrededor de su valor, sin pasar de 30 segundos', () => {
    expect(reconnectDelay(0, 0)).toBe(800);
    expect(reconnectDelay(0, 1)).toBe(1200);
    expect(reconnectDelay(3, 0.5)).toBe(8000);
    expect(reconnectDelay(5, 1)).toBe(30_000);
    expect(reconnectDelay(50, 0.5)).toBe(30_000);
  });
});

describe('dirección del canal', () => {
  it('usa ws con http y wss con https, en el host de la API', () => {
    expect(realtimeUrl('http://localhost:3000')).toBe(
      'ws://localhost:3000/realtime?protocolVersion=1',
    );
    expect(realtimeUrl('https://api.example.com')).toBe(
      'wss://api.example.com/realtime?protocolVersion=1',
    );
  });
});
