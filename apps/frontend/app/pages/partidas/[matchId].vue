<script setup lang="ts">
import type { MatchView } from '@gameboard/contracts';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useHead, useRoute } from '#imports';
import { useApi } from '../../composables/useApi';
import { useCatalog } from '../../composables/useCatalog';
import { useRealtime } from '../../composables/useRealtime';
import { useSignedInOnly } from '../../composables/useSignedInOnly';
import { gameUi } from '../../games';
import { es } from '../../i18n/es';
import type { Failure } from '../../utils/api';
import { failureText } from '../../utils/errors';
import { formatDuration } from '../../utils/format';
import {
  clockAfter,
  endReasonText,
  formatClock,
  outcomeOf,
  rejectionText,
  rivalNames,
  shouldRefreshAfter,
  supersedes,
} from '../../utils/matches';
import type { CommandResult } from '../../utils/realtime-client';

useSignedInOnly();

type MatchState =
  | { readonly status: 'loading' }
  /** `receivedAt` es el instante, en el reloj del navegador, en que llegó la partida. */
  | { readonly status: 'ready'; readonly match: MatchView; readonly receivedAt: number }
  | { readonly status: 'failed'; readonly failure: Failure };

/** Cada cuánto se redibujan los relojes. */
const TICK_MS = 250;

const route = useRoute();
const api = useApi();
const realtime = useRealtime();
const { load: loadCatalog, gameName } = useCatalog();

const matchId = computed(() => String(route.params.matchId));
const state = ref<MatchState>({ status: 'loading' });
/** La orden en curso, para no enviar dos a la vez, y el fallo de la última. */
const sending = ref<'move' | 'resign' | null>(null);
const actionError = ref<string | null>(null);
const confirmingResign = ref(false);
/** El instante actual en el reloj del navegador. Avanza mientras la página está abierta. */
const now = ref(performance.now());

const match = computed(() => (state.value.status === 'ready' ? state.value.match : null));
const ui = computed(() => (match.value ? gameUi(match.value.gameSlug) : null));
const inProgress = computed(() => match.value?.status === 'IN_PROGRESS');
const myTurn = computed(
  () => inProgress.value && (match.value?.activeSeats.includes(match.value.yourSeat) ?? false),
);
/** El tablero se bloquea mientras una orden espera respuesta y si no hay conexión. */
const canPlay = computed(
  () => myTurn.value && sending.value === null && realtime.state.value.status === 'open',
);
const myOutcome = computed(() =>
  match.value ? outcomeOf(match.value, match.value.yourSeat) : null,
);

const title = computed(() => {
  const rivals = match.value ? rivalNames(match.value) : '';
  return rivals ? es.match.title(rivals) : es.match.untitled;
});

/** Los jugadores, con el tiempo que le queda ahora a cada uno. */
const players = computed(() => {
  const current = state.value;
  if (current.status !== 'ready') return [];
  const elapsedMs = now.value - current.receivedAt;
  return current.match.players.map((player) => ({
    ...player,
    isYou: player.seat === current.match.yourSeat,
    hasTurn:
      current.match.status === 'IN_PROGRESS' && current.match.activeSeats.includes(player.seat),
    seatName: ui.value?.seatNames[player.seat] ?? null,
    clock: formatClock(clockAfter(current.match, player, elapsedMs)),
  }));
});

const turnText = computed(() => {
  if (!match.value || !inProgress.value) return null;
  if (sending.value === 'move') return es.match.turn.sending;
  if (myTurn.value) return es.match.turn.yours;
  const names = match.value.players
    .filter((player) => match.value?.activeSeats.includes(player.seat))
    .map((player) => player.displayName)
    .join(', ');
  return es.match.turn.theirs(names);
});

/** Cómo terminó, contado a quien mira: lo que dice el juego y lo que dice la plataforma. */
const endTexts = computed(() => {
  const current = match.value;
  if (!current?.result) return [];
  const fromGame =
    current.result.reason === 'COMPLETED' && current.view !== null
      ? (ui.value?.endText(current.view) ?? null)
      : null;
  return [fromGame ?? endReasonText(current)];
});

useHead({ title: () => `${title.value} · ${es.app.name}` });

// --- Carga y cambios en vivo -----------------------------------------------

/** Muestra un estado de la partida, salvo que sea más antiguo que el que ya se ve. */
function show(next: MatchView): void {
  if (!supersedes(match.value, next)) return;
  state.value = { status: 'ready', match: next, receivedAt: performance.now() };
  now.value = performance.now();
  if (next.status !== 'IN_PROGRESS') confirmingResign.value = false;
}

let unsubscribe: (() => void) | null = null;

function stopListening(): void {
  unsubscribe?.();
  unsubscribe = null;
}

/** Sigue la partida en vivo. Cuando deja de estar en curso, el servidor termina la suscripción. */
function listen(): void {
  if (unsubscribe) return;
  unsubscribe = realtime.subscribeMatch(matchId.value, {
    onMatch: (next) => {
      show(next);
      if (next.status !== 'IN_PROGRESS') unsubscribe = null;
    },
    onRejected: () => {
      unsubscribe = null;
      void load();
    },
  });
}

async function load(): Promise<void> {
  const result = await api.get<MatchView>(`/matches/${matchId.value}`);
  if (!result.ok) {
    state.value = { status: 'failed', failure: result.failure };
    return;
  }
  show(result.data);
  if (result.data.status === 'IN_PROGRESS') listen();
}

// --- Órdenes ---------------------------------------------------------------

/** Envía una orden de juego. La partida como queda llega por la suscripción. */
async function send(kind: 'move' | 'resign', order: () => Promise<CommandResult>): Promise<void> {
  if (sending.value !== null) return;
  actionError.value = null;
  sending.value = kind;
  const result = await order();
  sending.value = null;

  if (result.ok) return;
  actionError.value = rejectionText(result, ui.value?.rejections);
  // El rechazo suele significar que la partida cambió: se vuelve a pedir.
  if (shouldRefreshAfter(result)) void load();
}

function play(action: unknown): void {
  const current = match.value;
  if (!current || !canPlay.value) return;
  // La jugada indica la versión del estado que la persona tenía delante.
  void send('move', () => realtime.submitAction(current.matchId, current.stateVersion, action));
}

function resign(): void {
  const current = match.value;
  if (!current) return;
  confirmingResign.value = false;
  void send('resign', () => realtime.resignMatch(current.matchId));
}

let ticker: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  void loadCatalog();
  void load();
  ticker = setInterval(() => {
    if (inProgress.value) now.value = performance.now();
  }, TICK_MS);
});
onBeforeUnmount(() => {
  stopListening();
  if (ticker) clearInterval(ticker);
});
</script>

<template>
  <p v-if="state.status === 'loading'" class="muted" role="status">{{ es.match.loading }}</p>

  <section v-else-if="state.status === 'failed'">
    <div class="notice error" role="alert">
      <p>{{ failureText(state.failure) }}</p>
    </div>
    <NuxtLink to="/partidas">{{ es.match.after.allMatches }}</NuxtLink>
  </section>

  <template v-else-if="match">
    <section>
      <h1>{{ title }}</h1>
      <p class="status-line">
        <span class="badge" :class="{ on: inProgress }">{{ es.match.status[match.status] }}</span>
        <span>
          {{ gameName(match.gameSlug) }} · {{ es.home.modes[match.mode] }} ·
          {{ formatDuration(match.timeControl.totalMs) }} {{ es.home.timePerPlayer }}
        </span>
      </p>
    </section>

    <section v-if="match.result" class="result" :class="myOutcome?.toLowerCase()" role="status">
      <h2>{{ myOutcome ? es.match.outcome[myOutcome] : es.match.status.FINISHED }}</h2>
      <p v-for="text in endTexts" :key="text">{{ text }}</p>
    </section>
    <section v-else-if="match.abortReason" class="result aborted" role="status">
      <h2>{{ es.match.aborted.title }}</h2>
      <p>{{ es.match.aborted[match.abortReason] }}</p>
    </section>

    <section aria-labelledby="players-title">
      <h2 id="players-title" class="visually-hidden">{{ es.match.playersTitle }}</h2>
      <ul class="match-players">
        <li
          v-for="player in players"
          :key="player.playerId"
          class="match-player"
          :class="{ active: player.hasTurn }"
          :data-seat="player.seat"
        >
          <span class="token" :class="`seat-${player.seat}`" aria-hidden="true" />
          <span class="member-name">
            {{ player.displayName }}
            <span v-if="player.seatName" class="muted">({{ player.seatName }})</span>
          </span>
          <span
            class="clock"
            role="timer"
            :aria-label="es.match.clockOf(player.displayName)"
            :data-clock-seat="player.seat"
          >
            {{ player.clock }}
          </span>
          <span v-if="player.isYou || inProgress" class="match-badges">
            <span v-if="player.isYou" class="badge">{{ es.match.you }}</span>
            <span v-if="player.hasTurn" class="badge on">{{ es.match.turnBadge }}</span>
            <span v-if="inProgress" class="badge" :class="{ on: player.connected }">
              {{ player.connected ? es.room.connected : es.room.disconnected }}
            </span>
          </span>
        </li>
      </ul>
    </section>

    <section aria-labelledby="board-title">
      <h2 id="board-title" class="visually-hidden">{{ es.match.boardTitle }}</h2>
      <p v-if="turnText" class="turn" role="status">{{ turnText }}</p>

      <p v-if="!ui" class="notice warning">{{ es.match.unknownGame }}</p>
      <p v-else-if="match.view === null" class="empty">{{ es.match.noBoard }}</p>
      <component :is="ui.board" v-else :view="match.view" :can-play="canPlay" @play="play" />

      <p v-if="actionError" class="notice error" role="alert">{{ actionError }}</p>
    </section>

    <section v-if="inProgress" class="room-actions">
      <template v-if="confirmingResign">
        <p class="resign-question">{{ es.match.resign.question }}</p>
        <button type="button" class="button danger" :disabled="sending !== null" @click="resign">
          {{ es.match.resign.confirm }}
        </button>
        <button type="button" class="button quiet" @click="confirmingResign = false">
          {{ es.match.resign.cancel }}
        </button>
      </template>
      <button
        v-else
        type="button"
        class="button quiet"
        :disabled="sending !== null"
        @click="confirmingResign = true"
      >
        {{ sending === 'resign' ? es.match.resign.sending : es.match.resign.action }}
      </button>
    </section>

    <section v-else>
      <p class="hint">{{ es.match.after.rematchHint }}</p>
      <div class="room-actions">
        <NuxtLink class="button" :to="`/salas/${match.roomId}`">
          {{ es.match.after.backToRoom }}
        </NuxtLink>
        <NuxtLink class="button quiet" to="/partidas">{{ es.match.after.allMatches }}</NuxtLink>
      </div>
    </section>
  </template>
</template>
