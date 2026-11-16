import { useRuntimeConfig, useState } from '#imports';
import {
  type ConnectionState,
  RealtimeClient,
  realtimeUrl,
  type RoomListener,
} from '../utils/realtime-client';
import { useSession } from './useSession';

/** Una sola conexión para toda la aplicación, no una por pantalla (protocolo, sección 2). */
let client: RealtimeClient | null = null;

/**
 * El canal de tiempo real. La conexión se abre al iniciar sesión y se
 * mantiene mientras la aplicación esté abierta (ADR-013, decisión H17).
 */
export function useRealtime() {
  const state = useState<ConnectionState>('realtime', () => ({ status: 'idle' }));
  const { apiOrigin } = useRuntimeConfig().public;
  const { stillSignedIn } = useSession();

  function getClient(): RealtimeClient {
    client ??= new RealtimeClient({
      url: realtimeUrl(apiOrigin),
      createSocket: (url) => new WebSocket(url),
      onState: (next) => {
        state.value = next;
        // El servidor dice que la sesión terminó: se confirma con la API, que
        // es quien manda sobre lo que muestra el resto de la aplicación.
        if (next.status === 'stopped' && next.reason === 'SESSION_ENDED') void stillSignedIn();
      },
      // Si la API no contesta, se sigue intentando: lo normal es que tampoco haya red.
      canRetry: stillSignedIn,
    });
    return client;
  }

  return {
    state,
    start: () => getClient().start(),
    stop: () => client?.stop(),
    subscribeRoom: (roomId: string, listener: RoomListener) =>
      getClient().subscribeRoom(roomId, listener),
  };
}
