import type { MatchSummaryView, Page } from '@gameboard/contracts';
import { useRuntimeConfig, useState } from '#imports';
import type { Failure } from '../utils/api';
import { applySummary } from '../utils/my-matches';
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

/** Las partidas en curso del jugador, como las lleva la aplicación. */
export type OngoingMatches =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly items: readonly MatchSummaryView[];
      /** La API tiene más de las que caben en una página (ADR-016, decisión N3). */
      readonly hasMore: boolean;
    }
  | { readonly status: 'failed'; readonly failure: Failure };

/** El máximo de la API. Con los límites de partidas simultáneas, caben todas (ADR-016, N3). */
const ONGOING_LIMIT = 50;

/**
 * El canal de tiempo real. La conexión se abre al iniciar sesión y se
 * mantiene mientras la aplicación esté abierta (ADR-013, decisión H17).
 *
 * Lleva además las partidas en curso del jugador: las de tiempo real, para
 * avisarle de que puede perderlas por abandono mientras no tenga conexión
 * (ADR-015, decisión V8), y todas, para el aviso de turno (ADR-016,
 * decisiones N2 y N3).
 */
export function useRealtime() {
  const state = useState<ConnectionState>('realtime', () => ({ status: 'idle' }));
  const realtimeMatches = useState<string[]>('realtime-matches', () => []);
  const ongoing = useState<OngoingMatches>('ongoing-matches', () => ({ status: 'loading' }));
  /** Las partidas por turnos en las que acaba de empezar su turno, para el aviso emergente. */
  const turnAlerts = useState<MatchSummaryView[]>('turn-alerts', () => []);
  const { apiOrigin } = useRuntimeConfig().public;
  const { stillSignedIn } = useSession();
  const api = useApi();

  function track(match: Pick<MatchSummaryView, 'matchId' | 'mode' | 'status'>): void {
    const others = realtimeMatches.value.filter((matchId) => matchId !== match.matchId);
    const running = match.mode === 'REALTIME' && match.status === 'IN_PROGRESS';
    realtimeMatches.value = running ? [...others, match.matchId] : others;
  }

  /** Un aviso personal: pone al día la lista y, si empieza su turno por turnos, avisa. */
  function onPlayerMatch(summary: MatchSummaryView): void {
    track(summary);
    const current = ongoing.value;
    const items = current.status === 'ready' ? current.items : [];
    const update = applySummary(items, summary);
    if (current.status === 'ready') ongoing.value = { ...current, items: update.items };

    const others = turnAlerts.value.filter((alert) => alert.matchId !== summary.matchId);
    turnAlerts.value = update.turnStarted ? [...others, summary] : others;
  }

  /**
   * Pregunta qué partidas tiene en curso: al conectar, porque pudo perderse
   * avisos (protocolo, sección 2), y al abrir las páginas que las muestran.
   */
  async function loadMatches(): Promise<void> {
    const result = await api.get<Page<MatchSummaryView>>(
      `/me/matches?status=IN_PROGRESS&limit=${ONGOING_LIMIT}`,
    );
    if (!result.ok) {
      // Si ya había una lista, se sigue mostrando: lo normal es que falte la red.
      if (ongoing.value.status !== 'ready') {
        ongoing.value = { status: 'failed', failure: result.failure };
      }
      return;
    }
    const { items, nextCursor } = result.data;
    ongoing.value = { status: 'ready', items, hasMore: nextCursor !== null };
    realtimeMatches.value = items
      .filter((match) => match.mode === 'REALTIME')
      .map((match) => match.matchId);
  }

  function dismissTurnAlert(matchId: string): void {
    turnAlerts.value = turnAlerts.value.filter((alert) => alert.matchId !== matchId);
  }

  function getClient(): RealtimeClient {
    if (client) return client;
    const created = new RealtimeClient({
      url: realtimeUrl(apiOrigin),
      createSocket: (url) => new WebSocket(url),
      onState: (next) => {
        state.value = next;
        if (next.status === 'open') void loadMatches();
        if (next.status === 'idle') {
          realtimeMatches.value = [];
          ongoing.value = { status: 'loading' };
          turnAlerts.value = [];
        }
        // El servidor dice que la sesión terminó: se confirma con la API, que
        // es quien manda sobre lo que muestra el resto de la aplicación.
        if (next.status === 'stopped' && next.reason === 'SESSION_ENDED') void stillSignedIn();
      },
      // Si la API no contesta, se sigue intentando: lo normal es que tampoco haya red.
      canRetry: stillSignedIn,
      onPlayerMatch,
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
    /** Las partidas en curso del jugador, al día con los avisos personales. */
    ongoing,
    loadMatches,
    turnAlerts,
    dismissTurnAlert,
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
