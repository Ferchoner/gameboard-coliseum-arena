<script setup lang="ts">
import type { MatchSummaryView } from '@gameboard/contracts';
import { useCatalog } from '../composables/useCatalog';
import PlayerNames from './PlayerNames.vue';
import { es } from '../i18n/es';
import { formatDateTime } from '../utils/format';

/** Una lista de partidas en curso, con a quién le toca y hasta cuándo (ADR-016, decisión N3). */
defineProps<{ readonly items: readonly MatchSummaryView[] }>();

const { gameName } = useCatalog();

/** Hasta cuándo puede jugar quien tiene el turno, en la hora de quien lo lee. */
const deadline = (match: MatchSummaryView) =>
  match.turnDeadlineAt ? formatDateTime(match.turnDeadlineAt) : null;
</script>

<template>
  <ul class="rooms">
    <li
      v-for="match in items"
      :key="match.matchId"
      class="room"
      :data-match-id="match.matchId"
      :data-your-turn="match.yourTurn"
    >
      <div>
        <h3>{{ gameName(match.gameSlug) }}</h3>
        <p>{{ es.matches.against }} <PlayerNames :players="match.opponents" /></p>
        <p class="muted">
          {{ es.home.modes[match.mode] }} ·
          {{ es.matches.startedAt(formatDateTime(match.startedAt)) }}
        </p>
        <p v-if="deadline(match)" class="deadline">
          {{
            match.yourTurn
              ? es.matches.yourDeadline(deadline(match) as string)
              : es.matches.theirDeadline(deadline(match) as string)
          }}
        </p>
      </div>
      <div class="room-actions">
        <span class="badge" :class="{ on: match.yourTurn }">
          {{ match.yourTurn ? es.matches.yourTurn : es.matches.theirTurn }}
        </span>
        <NuxtLink class="button" :to="`/partidas/${match.matchId}`">
          {{ es.matches.play }}
        </NuxtLink>
      </div>
    </li>
  </ul>
</template>
