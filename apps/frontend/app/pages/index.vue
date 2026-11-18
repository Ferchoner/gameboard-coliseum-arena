<script setup lang="ts">
import { MATCH_MODES } from '@gameboard/contracts';
import { computed, onMounted, watch } from 'vue';
import OngoingMatches from '../components/OngoingMatches.vue';
import { useCatalog } from '../composables/useCatalog';
import { useRealtime } from '../composables/useRealtime';
import { useSession } from '../composables/useSession';
import { es } from '../i18n/es';
import { failureText } from '../utils/errors';
import { formatDuration, formatPlayers } from '../utils/format';
import { sortInProgress } from '../utils/my-matches';

const { session, me } = useSession();
const { catalog, load } = useCatalog();
const { ongoing, loadMatches } = useRealtime();

/** Al entrar se ven primero las partidas en las que le toca (ADR-016, decisión N3). */
const yourTurn = computed(() =>
  me.value && ongoing.value.status === 'ready'
    ? sortInProgress(ongoing.value.items.filter((match) => match.yourTurn))
    : [],
);

// El catálogo puede cambiar sin que se vuelva a construir el sitio: se pide en el navegador.
onMounted(load);
// Con sesión, se preguntan sus partidas al llegar, aunque la conexión ya estuviera abierta.
watch(
  () => me.value?.userId,
  (userId) => {
    if (userId) void loadMatches();
  },
  { immediate: true },
);
</script>

<template>
  <section class="intro">
    <h1>{{ es.app.name }}</h1>
    <p>{{ es.app.tagline }}</p>
    <p v-if="me" class="muted">
      {{ es.home.welcome(me.displayName) }}
      <NuxtLink to="/salas">{{ es.home.goToRooms }}</NuxtLink>
    </p>
    <p v-else-if="session.status === 'anonymous'" class="muted">{{ es.home.guest }}</p>
  </section>

  <section v-if="yourTurn.length > 0" aria-labelledby="your-turn-title" data-testid="your-turn">
    <h2 id="your-turn-title">{{ es.home.yourTurnTitle }}</h2>
    <OngoingMatches :items="yourTurn" />
    <p>
      <NuxtLink to="/partidas">{{ es.home.allMatches }}</NuxtLink>
    </p>
  </section>

  <section aria-labelledby="games-title">
    <h2 id="games-title">{{ es.home.title }}</h2>

    <p v-if="catalog.status === 'loading'" class="muted" role="status">{{ es.home.loading }}</p>

    <div v-else-if="catalog.status === 'failed'" class="notice error" role="alert">
      <p>{{ failureText(catalog.failure) }}</p>
      <button type="button" class="button quiet" @click="load">{{ es.home.retry }}</button>
    </div>

    <p v-else-if="catalog.games.length === 0" class="empty">{{ es.home.empty }}</p>

    <ul v-else class="games">
      <li v-for="game in catalog.games" :key="game.gameSlug" class="game">
        <h3>{{ game.name }}</h3>
        <p v-if="game.description">{{ game.description }}</p>
        <p class="muted">{{ formatPlayers(game) }}</p>
        <dl class="modes">
          <template v-for="mode in MATCH_MODES" :key="mode">
            <div v-if="game.timeControls[mode].length > 0">
              <dt>{{ es.home.modes[mode] }}</dt>
              <dd>
                {{
                  game.timeControls[mode]
                    .map((control) => formatDuration(control.totalMs))
                    .join(', ')
                }}
                {{ es.home.timePerPlayer }}
              </dd>
            </div>
          </template>
        </dl>
      </li>
    </ul>
  </section>
</template>
