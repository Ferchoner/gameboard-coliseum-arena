<script setup lang="ts">
import type { ItemList, PlayerGameStatistics, PublicPlayer } from '@gameboard/contracts';
import { computed, ref, watch } from 'vue';
import { useHead, useRoute } from '#imports';
import { useApi } from '../../composables/useApi';
import { useCatalog } from '../../composables/useCatalog';
import { useSession } from '../../composables/useSession';
import { useSignedInOnly } from '../../composables/useSignedInOnly';
import { es } from '../../i18n/es';
import type { Failure } from '../../utils/api';
import { failureText } from '../../utils/errors';

useSignedInOnly();

type ProfileState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly player: PublicPlayer;
      readonly statistics: readonly PlayerGameStatistics[];
    }
  | { readonly status: 'failed'; readonly failure: Failure };

const route = useRoute();
const api = useApi();
const { me } = useSession();
const { load: loadCatalog, gameName } = useCatalog();

const username = computed(() => String(route.params.username ?? ''));
const state = ref<ProfileState>({ status: 'loading' });

useHead(() => ({
  title: `${state.value.status === 'ready' ? state.value.player.displayName : username.value} · ${es.app.name}`,
}));

/** El perfil y sus estadísticas a la vez: los dos dicen lo mismo si el jugador no existe. */
async function load(): Promise<void> {
  state.value = { status: 'loading' };
  const path = `/players/${encodeURIComponent(username.value)}`;
  const [player, statistics] = await Promise.all([
    api.get<PublicPlayer>(path),
    api.get<ItemList<PlayerGameStatistics>>(`${path}/statistics`),
  ]);
  if (!player.ok) {
    state.value = { status: 'failed', failure: player.failure };
  } else if (!statistics.ok) {
    state.value = { status: 'failed', failure: statistics.failure };
  } else {
    state.value = { status: 'ready', player: player.data, statistics: statistics.data.items };
  }
}

/** Sin avatar editable, se muestra la inicial del nombre (ADR-017, U12). */
const initialOf = (name: string) => (Array.from(name.trim())[0] ?? '?').toLocaleUpperCase('es');

const isMe = computed(
  () => state.value.status === 'ready' && state.value.player.playerId === me.value?.playerId,
);

// Al pasar de un perfil a otro, la página no se vuelve a montar.
watch(
  username,
  () => {
    void loadCatalog();
    void load();
  },
  { immediate: true },
);
</script>

<template>
  <p v-if="state.status === 'loading'" class="muted" role="status">{{ es.player.loading }}</p>

  <div v-else-if="state.status === 'failed'" class="notice error" role="alert">
    <p>{{ failureText(state.failure) }}</p>
    <button
      v-if="!(state.failure.kind === 'api' && state.failure.error.code === 'PLAYER_NOT_FOUND')"
      type="button"
      class="button quiet"
      @click="load"
    >
      {{ es.home.retry }}
    </button>
  </div>

  <template v-else>
    <section class="intro player-profile" aria-labelledby="player-name">
      <div class="player-heading">
        <span class="avatar" aria-hidden="true">{{ initialOf(state.player.displayName) }}</span>
        <h1 id="player-name">{{ state.player.displayName }}</h1>
      </div>
      <p class="muted" data-testid="player-username">@{{ state.player.username }}</p>
      <p v-if="state.player.biography" class="biography">{{ state.player.biography }}</p>
      <p v-else class="muted">{{ es.player.noBiography }}</p>
      <NuxtLink v-if="isMe" class="button quiet" to="/cuenta">{{ es.player.editOwn }}</NuxtLink>
    </section>

    <section aria-labelledby="statistics-title">
      <h2 id="statistics-title">{{ es.player.statisticsTitle }}</h2>

      <p v-if="state.statistics.length === 0" class="empty">{{ es.player.emptyStatistics }}</p>

      <div v-else class="table-wrap">
        <table class="statistics">
          <thead>
            <tr>
              <th scope="col">{{ es.player.columns.game }}</th>
              <th scope="col">{{ es.player.columns.played }}</th>
              <th scope="col">{{ es.player.columns.wins }}</th>
              <th scope="col">{{ es.player.columns.losses }}</th>
              <th scope="col">{{ es.player.columns.draws }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in state.statistics" :key="entry.gameSlug" :data-game="entry.gameSlug">
              <th scope="row">{{ gameName(entry.gameSlug) }}</th>
              <td data-stat="played">{{ entry.played }}</td>
              <td data-stat="wins">{{ entry.wins }}</td>
              <td data-stat="losses">{{ entry.losses }}</td>
              <td data-stat="draws">{{ entry.draws }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </template>
</template>
