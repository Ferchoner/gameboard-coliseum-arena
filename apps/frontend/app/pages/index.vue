<script setup lang="ts">
import { MATCH_MODES, type Game, type ItemList } from '@gameboard/contracts';
import { onMounted, ref } from 'vue';
import { useApi } from '../composables/useApi';
import { useSession } from '../composables/useSession';
import { es } from '../i18n/es';
import type { Failure } from '../utils/api';
import { failureText } from '../utils/errors';
import { formatDuration, formatPlayers } from '../utils/format';

type Catalog =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly games: readonly Game[] }
  | { readonly status: 'failed'; readonly failure: Failure };

const api = useApi();
const { session, me } = useSession();
const catalog = ref<Catalog>({ status: 'loading' });

async function load(): Promise<void> {
  catalog.value = { status: 'loading' };
  const result = await api.get<ItemList<Game>>('/games');
  catalog.value = result.ok
    ? { status: 'ready', games: result.data.items }
    : { status: 'failed', failure: result.failure };
}

// El catálogo puede cambiar sin que se vuelva a construir el sitio: se pide en el navegador.
onMounted(load);
</script>

<template>
  <section class="intro">
    <h1>{{ es.app.name }}</h1>
    <p>{{ es.app.tagline }}</p>
    <p v-if="me" class="muted">{{ es.home.welcome(me.displayName) }}</p>
    <p v-else-if="session.status === 'anonymous'" class="muted">{{ es.home.guest }}</p>
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
