<script setup lang="ts">
import {
  MATCH_MODES,
  type MatchMode,
  type Page,
  type RoomSummary,
  type RoomView,
} from '@gameboard/contracts';
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { navigateTo, useHead } from '#imports';
import RoomCreateForm from '../../components/RoomCreateForm.vue';
import { useApi } from '../../composables/useApi';
import { useCatalog } from '../../composables/useCatalog';
import { useSession } from '../../composables/useSession';
import { useSignedInOnly } from '../../composables/useSignedInOnly';
import { es } from '../../i18n/es';
import { codeOf, type Failure } from '../../utils/api';
import { failureText } from '../../utils/errors';
import { formatDuration } from '../../utils/format';

useHead({ title: `${es.rooms.title} · ${es.app.name}` });
useSignedInOnly();

type RoomList =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly items: readonly RoomSummary[];
      readonly nextCursor: string | null;
    }
  | { readonly status: 'failed'; readonly failure: Failure };

const api = useApi();
const { me } = useSession();
const { catalog, games, load: loadCatalog, gameName } = useCatalog();

const filters = reactive({ gameSlug: '', mode: '' as MatchMode | '' });
const list = ref<RoomList>({ status: 'loading' });
const refreshing = ref(false);
const loadingMore = ref(false);
/** La sala a la que se está entrando, y el fallo de la última entrada. */
const joining = ref<string | null>(null);
const joinError = ref<{ roomId: string; text: string } | null>(null);

function listPath(cursor?: string): string {
  const query = new URLSearchParams();
  if (filters.gameSlug) query.set('gameSlug', filters.gameSlug);
  if (filters.mode) query.set('mode', filters.mode);
  if (cursor) query.set('cursor', cursor);
  const text = query.toString();
  return text ? `/rooms?${text}` : '/rooms';
}

/**
 * Pide la primera página. La lista no es en vivo (protocolo, decisión
 * T16): se actualiza con el botón y al volver a la pestaña.
 */
async function loadRooms(): Promise<void> {
  refreshing.value = true;
  const result = await api.get<Page<RoomSummary>>(listPath());
  refreshing.value = false;

  list.value = result.ok
    ? { status: 'ready', items: result.data.items, nextCursor: result.data.nextCursor }
    : { status: 'failed', failure: result.failure };
}

async function loadMore(): Promise<void> {
  if (list.value.status !== 'ready' || !list.value.nextCursor) return;
  const { items, nextCursor } = list.value;

  loadingMore.value = true;
  const result = await api.get<Page<RoomSummary>>(listPath(nextCursor));
  loadingMore.value = false;

  list.value = result.ok
    ? {
        status: 'ready',
        items: [...items, ...result.data.items],
        nextCursor: result.data.nextCursor,
      }
    : { status: 'failed', failure: result.failure };
}

async function join(room: RoomSummary): Promise<void> {
  joinError.value = null;
  joining.value = room.roomId;
  const result = await api.put<RoomView>(`/rooms/${room.roomId}/members/me`);
  joining.value = null;

  if (result.ok) {
    await navigateTo(`/salas/${room.roomId}`);
    return;
  }
  joinError.value = { roomId: room.roomId, text: failureText(result.failure) };
  // La sala se llenó o se cerró mientras se miraba la lista.
  if (codeOf(result) === 'ROOM_FULL' || codeOf(result) === 'ROOM_NOT_WAITING') void loadRooms();
}

function onCreated(room: RoomView): void {
  void navigateTo(`/salas/${room.roomId}`);
}

function onVisible(): void {
  if (document.visibilityState === 'visible') void loadRooms();
}

watch(filters, () => void loadRooms());

onMounted(() => {
  void loadCatalog();
  void loadRooms();
  document.addEventListener('visibilitychange', onVisible);
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible);
});
</script>

<template>
  <section class="intro">
    <h1>{{ es.rooms.title }}</h1>
    <p class="muted">{{ es.rooms.intro }}</p>
  </section>

  <section aria-labelledby="create-title">
    <h2 id="create-title">{{ es.rooms.create.title }}</h2>

    <p v-if="catalog.status === 'loading'" class="muted" role="status">{{ es.home.loading }}</p>
    <div v-else-if="catalog.status === 'failed'" class="notice error" role="alert">
      <p>{{ failureText(catalog.failure) }}</p>
      <button type="button" class="button quiet" @click="loadCatalog">{{ es.home.retry }}</button>
    </div>
    <p v-else-if="games.length === 0" class="empty">{{ es.rooms.create.noGames }}</p>
    <div v-else class="panel">
      <RoomCreateForm :games="games" @created="onCreated" />
    </div>
  </section>

  <section aria-labelledby="list-title">
    <h2 id="list-title">{{ es.rooms.listTitle }}</h2>

    <div class="toolbar">
      <div class="field">
        <label for="filter-game">{{ es.rooms.filters.game }}</label>
        <select id="filter-game" v-model="filters.gameSlug" name="gameSlug">
          <option value="">{{ es.rooms.filters.anyGame }}</option>
          <option v-for="game in games" :key="game.gameSlug" :value="game.gameSlug">
            {{ game.name }}
          </option>
        </select>
      </div>
      <div class="field">
        <label for="filter-mode">{{ es.rooms.filters.mode }}</label>
        <select id="filter-mode" v-model="filters.mode" name="mode">
          <option value="">{{ es.rooms.filters.anyMode }}</option>
          <option v-for="mode in MATCH_MODES" :key="mode" :value="mode">
            {{ es.home.modes[mode] }}
          </option>
        </select>
      </div>
      <button type="button" class="button quiet" :disabled="refreshing" @click="loadRooms">
        {{ refreshing ? es.rooms.refreshing : es.rooms.refresh }}
      </button>
    </div>

    <p v-if="list.status === 'loading'" class="muted" role="status">{{ es.rooms.loading }}</p>

    <div v-else-if="list.status === 'failed'" class="notice error" role="alert">
      <p>{{ failureText(list.failure) }}</p>
      <button type="button" class="button quiet" @click="loadRooms">{{ es.home.retry }}</button>
    </div>

    <p v-else-if="list.items.length === 0" class="empty">{{ es.rooms.empty }}</p>

    <template v-else>
      <ul class="rooms">
        <li v-for="room in list.items" :key="room.roomId" class="room">
          <div>
            <h3>{{ gameName(room.gameSlug) }}</h3>
            <p>{{ es.rooms.ownedBy(room.owner.displayName) }}</p>
            <p class="muted">
              {{ es.home.modes[room.mode] }} · {{ formatDuration(room.timeControl.totalMs) }}
              {{ es.home.timePerPlayer }} ·
              {{ es.rooms.places(room.memberCount, room.maxPlayers) }}
              <template v-if="room.mode === 'TURN_BASED' && room.rematchEnabled">
                · {{ es.rooms.withRematch }}
              </template>
            </p>
          </div>
          <div class="room-actions">
            <NuxtLink
              v-if="room.owner.playerId === me?.playerId"
              class="button quiet"
              :to="`/salas/${room.roomId}`"
            >
              {{ es.rooms.open }}
            </NuxtLink>
            <button
              v-else
              type="button"
              class="button"
              :disabled="joining !== null"
              @click="join(room)"
            >
              {{ joining === room.roomId ? es.rooms.joining : es.rooms.join }}
            </button>
          </div>
          <p v-if="joinError?.roomId === room.roomId" class="field-error" role="alert">
            {{ joinError.text }}
          </p>
        </li>
      </ul>

      <button
        v-if="list.nextCursor"
        type="button"
        class="button quiet"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? es.rooms.loadingMore : es.rooms.more }}
      </button>
    </template>
  </section>
</template>
