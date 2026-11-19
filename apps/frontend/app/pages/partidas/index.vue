<script setup lang="ts">
import type { MatchSummaryView, Page } from '@gameboard/contracts';
import { computed, onMounted, ref } from 'vue';
import { useHead } from '#imports';
import OngoingMatches from '../../components/OngoingMatches.vue';
import PlayerNames from '../../components/PlayerNames.vue';
import { useApi } from '../../composables/useApi';
import { useCatalog } from '../../composables/useCatalog';
import { useRealtime } from '../../composables/useRealtime';
import { useSignedInOnly } from '../../composables/useSignedInOnly';
import { es } from '../../i18n/es';
import type { Failure } from '../../utils/api';
import { failureText } from '../../utils/errors';
import { formatDateTime } from '../../utils/format';
import { sortInProgress } from '../../utils/my-matches';

useSignedInOnly();
useHead({ title: `${es.matches.title} · ${es.app.name}` });

type ListState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready';
      readonly items: readonly MatchSummaryView[];
      readonly nextCursor: string | null;
    }
  | { readonly status: 'failed'; readonly failure: Failure };

const api = useApi();
const { load: loadCatalog, gameName } = useCatalog();

// Las partidas en curso son las que lleva la aplicación, al día con los avisos personales.
const { ongoing, loadMatches } = useRealtime();
const inProgress = computed(() => ongoing.value);
const sortedInProgress = computed(() =>
  ongoing.value.status === 'ready' ? sortInProgress(ongoing.value.items) : [],
);
const history = ref<ListState>({ status: 'loading' });
const loadingMore = ref(false);

function toState(result: Awaited<ReturnType<typeof fetchPage>>): ListState {
  return result.ok
    ? { status: 'ready', items: result.data.items, nextCursor: result.data.nextCursor }
    : { status: 'failed', failure: result.failure };
}

function fetchPage(status: 'FINISHED', cursor?: string) {
  const params = new URLSearchParams({ status });
  if (cursor) params.set('cursor', cursor);
  return api.get<Page<MatchSummaryView>>(`/me/matches?${params.toString()}`);
}

async function load(): Promise<void> {
  const [, finished] = await Promise.all([loadMatches(), fetchPage('FINISHED')]);
  history.value = toState(finished);
}

async function loadMore(): Promise<void> {
  if (history.value.status !== 'ready' || !history.value.nextCursor) return;
  const { items, nextCursor } = history.value;

  loadingMore.value = true;
  const result = await fetchPage('FINISHED', nextCursor);
  loadingMore.value = false;

  history.value = result.ok
    ? {
        status: 'ready',
        items: [...items, ...result.data.items],
        nextCursor: result.data.nextCursor,
      }
    : { status: 'failed', failure: result.failure };
}

onMounted(() => {
  void loadCatalog();
  void load();
});
</script>

<template>
  <section class="intro">
    <h1>{{ es.matches.title }}</h1>
    <p class="muted">{{ es.matches.intro }}</p>
  </section>

  <section aria-labelledby="in-progress-title">
    <h2 id="in-progress-title">{{ es.matches.inProgressTitle }}</h2>

    <p v-if="inProgress.status === 'loading'" class="muted" role="status">
      {{ es.matches.loading }}
    </p>
    <div v-else-if="inProgress.status === 'failed'" class="notice error" role="alert">
      <p>{{ failureText(inProgress.failure) }}</p>
      <button type="button" class="button quiet" @click="load">{{ es.home.retry }}</button>
    </div>
    <p v-else-if="inProgress.items.length === 0" class="empty">{{ es.matches.emptyInProgress }}</p>

    <template v-else>
      <OngoingMatches :items="sortedInProgress" />
      <p v-if="inProgress.hasMore" class="muted">{{ es.matches.hasMore }}</p>
    </template>
  </section>

  <section aria-labelledby="history-title">
    <h2 id="history-title">{{ es.matches.historyTitle }}</h2>

    <p v-if="history.status === 'loading'" class="muted" role="status">{{ es.matches.loading }}</p>
    <div v-else-if="history.status === 'failed'" class="notice error" role="alert">
      <p>{{ failureText(history.failure) }}</p>
      <button type="button" class="button quiet" @click="load">{{ es.home.retry }}</button>
    </div>
    <p v-else-if="history.items.length === 0" class="empty">{{ es.matches.emptyHistory }}</p>

    <template v-else>
      <ul class="rooms">
        <li
          v-for="match in history.items"
          :key="match.matchId"
          class="room"
          :data-outcome="match.yourOutcome"
        >
          <div>
            <h3>{{ gameName(match.gameSlug) }}</h3>
            <p>{{ es.matches.against }} <PlayerNames :players="match.opponents" /></p>
            <p class="muted">
              <template v-if="match.endedAt">
                {{ es.matches.endedAt(formatDateTime(match.endedAt)) }}
              </template>
            </p>
          </div>
          <div class="room-actions">
            <span v-if="match.yourOutcome" class="outcome" :class="match.yourOutcome.toLowerCase()">
              {{ es.matches.outcome[match.yourOutcome] }}
              <template v-if="match.endReason">
                · {{ es.matches.endReasons[match.endReason] }}
              </template>
            </span>
            <NuxtLink class="button quiet" :to="`/partidas/${match.matchId}`">
              {{ es.matches.open }}
            </NuxtLink>
          </div>
        </li>
      </ul>

      <button
        v-if="history.nextCursor"
        type="button"
        class="button quiet"
        :disabled="loadingMore"
        @click="loadMore"
      >
        {{ loadingMore ? es.matches.loadingMore : es.matches.more }}
      </button>
    </template>
  </section>
</template>
