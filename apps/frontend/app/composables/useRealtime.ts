import type { MatchSummaryView, Page } from '@gameboard/contracts';
import { useRuntimeConfig, useState } from '#imports';
import {
  type ConnectionState,
  type MatchListener,
  RealtimeClient,
  realtimeUrl,
  type RoomListener,
} from '../utils/realtime-client';
import { useApi } from './useApi';
import { useSession } from './useSession';

/** Una sola conexión para toda la aplicación, no una por pantalla (protocolo, sección 2). */
let client: RealtimeClient | null = null;

/**
 * El canal de tiempo real. La conexión se abre al iniciar sesión y se
 * mantiene mientras la aplicación esté abierta (ADR-013, decisión H17).
 *
 * Lleva además la cuenta de las partidas en tiempo real en curso del
 * jugador, para avisarle de que puede perderlas por abandono mientras no
 * tenga conexión (ADR-015, decisión V8).
 */
export function useRealtime() {
  const state = useState<ConnectionState>('realtime', () => ({ status: 'idle' }));
  const realtimeMatches = useState<string[]>('realtime-matches', () => []);
  const { apiOrigin } = useRuntimeConfig().public;
  const { stillSignedIn } = useSession();
  const api = useApi();

  function track(match: Pick<MatchSummaryView, 'matchId' | 'mode' | 'status'>): void {
    const others = realtimeMatches.value.filter((matchId) => matchId !== match.matchId);
    const ongoing = match.mode === 'REALTIME' && match.status === 'IN_PROGRESS';
    realtimeMatches.value = ongoing ? [...others, match.matchId] : others;
  }

  /** Al conectar, pregunta qué partidas tiene en curso: los avisos personales cuentan el resto. */
  async function loadRealtimeMatches(): Promise<void> {
    const result = await api.get<Page<MatchSummaryView>>('/me/matches?status=IN_PROGRESS');
    if (!result.ok) return;
    realtimeMatches.value = result.data.items
      .filter((match) => match.mode === 'REALTIME')
      .map((match) => match.matchId);
  }

  function getClient(): RealtimeClient {
    if (client) return client;
    const created = new RealtimeClient({
      url: realtimeUrl(apiOrigin),
      createSocket: (url) => new WebSocket(url),
      onState: (next) => {
        state.value = next;
        if (next.status === 'open') void loadRealtimeMatches();
        if (next.status === 'idle') realtimeMatches.value = [];
        // El servidor dice que la sesión terminó: se confirma con la API, que
        // es quien manda sobre lo que muestra el resto de la aplicación.
        if (next.status === 'stopped' && next.reason === 'SESSION_ENDED') void stillSignedIn();
      },
      // Si la API no contesta, se sigue intentando: lo normal es que tampoco haya red.
      canRetry: stillSignedIn,
      onPlayerMatch: track,
    });
    client = created;

    // Cuando vuelve la red o la página vuelve a estar a la vista, no se
    // espera al siguiente reintento (ADR-015, decisión V7).
    window.addEventListener('online', () => created.reconnectNow('online'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') created.reconnectNow('visible');
    });
    return created;
  }

  return {
    state,
    /** Las partidas en tiempo real en curso del jugador. */
    realtimeMatches,
    /** La página de una partida cuenta lo que ve: así no depende de la conexión. */
    track,
    start: () => getClient().start(),
    stop: () => client?.stop(),
    subscribeRoom: (roomId: string, listener: RoomListener) =>
      getClient().subscribeRoom(roomId, listener),
    subscribeMatch: (matchId: string, listener: MatchListener) =>
      getClient().subscribeMatch(matchId, listener),
    submitAction: (matchId: string, stateVersion: number, action: unknown) =>
      getClient().submitAction(matchId, stateVersion, action),
    resignMatch: (matchId: string) => getClient().resignMatch(matchId),
  };
}
