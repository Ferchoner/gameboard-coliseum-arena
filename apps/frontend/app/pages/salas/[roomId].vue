<script setup lang="ts">
import type { RoomView } from '@gameboard/contracts';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { navigateTo, useHead, useRoute } from '#imports';
import { useApi } from '../../composables/useApi';
import { useCatalog } from '../../composables/useCatalog';
import { useRealtime } from '../../composables/useRealtime';
import { useSession } from '../../composables/useSession';
import { useSignedInOnly } from '../../composables/useSignedInOnly';
import { es } from '../../i18n/es';
import type { ApiResult, Failure } from '../../utils/api';
import { failureText } from '../../utils/errors';
import { formatDuration } from '../../utils/format';
import { canMarkReady, ownerName, startHint } from '../../utils/rooms';

useSignedInOnly();

type RoomState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly room: RoomView }
  | { readonly status: 'failed'; readonly failure: Failure };

const route = useRoute();
const api = useApi();
const realtime = useRealtime();
const { me } = useSession();
const { load: loadCatalog, gameName } = useCatalog();

const roomId = computed(() => String(route.params.roomId));
const state = ref<RoomState>({ status: 'loading' });
/** La acción en curso, para no enviar dos a la vez, y el fallo de la última. */
const busy = ref<'join' | 'leave' | 'ready' | null>(null);
const actionError = ref<string | null>(null);

const room = computed(() => (state.value.status === 'ready' ? state.value.room : null));
const myMembership = computed(
  () => room.value?.members.find((member) => member.playerId === me.value?.playerId) ?? null,
);
const isOwner = computed(() => room.value?.ownerPlayerId === me.value?.playerId);
/** Plazas por ocupar. Solo tienen sentido mientras la sala espera jugadores. */
const freePlaces = computed(() =>
  room.value?.status === 'WAITING'
    ? Math.max(0, room.value.maxPlayers - room.value.members.length)
    : 0,
);
const title = computed(() => {
  const owner = room.value ? ownerName(room.value) : null;
  return owner ? es.room.title(owner) : es.room.untitled;
});
/** Los cambios llegan en vivo solo a los miembros de una sala abierta (protocolo, sección 4). */
const shouldSubscribe = computed(
  () => myMembership.value !== null && room.value?.status !== 'CLOSED',
);

useHead({ title: () => `${title.value} · ${es.app.name}` });

async function load(): Promise<void> {
  const result = await api.get<RoomView>(`/rooms/${roomId.value}`);
  state.value = result.ok
    ? { status: 'ready', room: result.data }
    : { status: 'failed', failure: result.failure };
}

// --- Cambios en vivo -------------------------------------------------------

let unsubscribe: (() => void) | null = null;

function stopListening(): void {
  unsubscribe?.();
  unsubscribe = null;
}

watch(shouldSubscribe, (subscribe) => {
  if (!subscribe) {
    stopListening();
    return;
  }
  if (unsubscribe) return;
  unsubscribe = realtime.subscribeRoom(roomId.value, {
    onRoom: (next) => {
      state.value = { status: 'ready', room: next };
    },
    // La suscripción terminó: el estado final se pide a la API.
    onClosed: () => {
      unsubscribe = null;
      void load();
    },
    onRejected: () => {
      unsubscribe = null;
      void load();
    },
  });
});

// --- Acciones --------------------------------------------------------------

/** Ejecuta una acción sobre la sala. Si devuelve la sala, se muestra ya, sin esperar al aviso. */
async function act(
  action: 'join' | 'leave' | 'ready',
  request: () => Promise<ApiResult<RoomView | undefined>>,
): Promise<boolean> {
  actionError.value = null;
  busy.value = action;
  const result = await request();
  busy.value = null;

  if (!result.ok) {
    actionError.value = failureText(result.failure);
    // El fallo suele significar que la sala cambió: se vuelve a pedir.
    void load();
    return false;
  }
  if (result.data) state.value = { status: 'ready', room: result.data };
  return true;
}

const join = () => act('join', () => api.put<RoomView>(`/rooms/${roomId.value}/members/me`));

const setReady = (ready: boolean) =>
  act('ready', () => api.put<RoomView>(`/rooms/${roomId.value}/members/me/ready`, { ready }));

async function leave(): Promise<void> {
  const left = await act('leave', () => api.delete<undefined>(`/rooms/${roomId.value}/members/me`));
  if (left) {
    stopListening();
    await navigateTo('/salas');
  }
}

onMounted(() => {
  void loadCatalog();
  void load();
});
onBeforeUnmount(stopListening);
</script>

<template>
  <p v-if="state.status === 'loading'" class="muted" role="status">{{ es.room.loading }}</p>

  <section v-else-if="state.status === 'failed'">
    <div class="notice error" role="alert">
      <p>{{ failureText(state.failure) }}</p>
    </div>
    <NuxtLink to="/salas">{{ es.room.back }}</NuxtLink>
  </section>

  <template v-else-if="room">
    <section>
      <p>
        <NuxtLink to="/salas">{{ es.room.back }}</NuxtLink>
      </p>
      <h1>{{ title }}</h1>

      <p class="status-line">
        <span class="badge" :class="{ on: room.status !== 'CLOSED' }">
          {{ es.room.status[room.status] }}
        </span>
        <span v-if="room.closeReason">{{ es.room.closeReasons[room.closeReason] }}</span>
        <span v-else-if="room.status === 'IN_MATCH'">{{ es.room.inMatch }}</span>
        <span v-else>{{ es.room.howItStarts[startHint(room)] }}</span>
      </p>

      <dl class="details">
        <div>
          <dt>{{ es.room.details.game }}</dt>
          <dd>{{ gameName(room.gameSlug) }}</dd>
        </div>
        <div>
          <dt>{{ es.room.details.mode }}</dt>
          <dd>{{ es.home.modes[room.mode] }}</dd>
        </div>
        <div>
          <dt>{{ es.room.details.timeControl }}</dt>
          <dd>{{ formatDuration(room.timeControl.totalMs) }}</dd>
        </div>
        <div v-if="room.status !== 'CLOSED'">
          <dt>{{ es.room.details.rematch }}</dt>
          <dd>
            {{ room.rematchEnabled ? es.room.details.rematchOn : es.room.details.rematchOff }}
          </dd>
        </div>
      </dl>
    </section>

    <section aria-labelledby="members-title">
      <h2 id="members-title">
        {{ es.room.membersTitle(room.members.length, room.maxPlayers) }}
      </h2>

      <ul class="members">
        <li v-for="member in room.members" :key="member.playerId" class="member">
          <span class="member-name">{{ member.displayName }}</span>
          <span v-if="member.playerId === me?.playerId" class="badge">{{ es.room.you }}</span>
          <span v-if="member.playerId === room.ownerPlayerId" class="badge">
            {{ es.room.owner }}
          </span>
          <span v-if="room.status !== 'CLOSED'" class="badge" :class="{ on: member.connected }">
            {{ member.connected ? es.room.connected : es.room.disconnected }}
          </span>
          <span v-if="room.status === 'WAITING'" class="badge" :class="{ on: member.ready }">
            {{ member.ready ? es.room.ready : es.room.notReady }}
          </span>
        </li>
        <li v-for="place in freePlaces" :key="`free-${place}`" class="member free">
          {{ es.room.freePlace }}
        </li>
      </ul>

      <p v-if="actionError" class="notice error" role="alert">{{ actionError }}</p>

      <div v-if="room.status === 'WAITING'" class="room-actions">
        <template v-if="myMembership">
          <button
            v-if="canMarkReady(room)"
            type="button"
            class="button"
            :disabled="busy !== null"
            @click="setReady(!myMembership.ready)"
          >
            {{ myMembership.ready ? es.room.actions.unsetReady : es.room.actions.setReady }}
          </button>
          <button type="button" class="button quiet" :disabled="busy !== null" @click="leave">
            {{ busy === 'leave' ? es.room.actions.leaving : es.room.actions.leave }}
          </button>
        </template>
        <button
          v-else-if="freePlaces > 0"
          type="button"
          class="button"
          :disabled="busy !== null"
          @click="join"
        >
          {{ busy === 'join' ? es.room.actions.joining : es.room.actions.join }}
        </button>
      </div>
      <p v-if="room.status === 'WAITING' && myMembership && isOwner" class="hint">
        {{ es.room.actions.ownerLeaveHint }}
      </p>
    </section>
  </template>
</template>
