<script setup lang="ts">
import type {
  DominoesAction,
  DominoesEnd,
  DominoesTile,
  DominoesView,
} from '@gameboard/game-engine/dominoes';
import { computed, ref, watch } from 'vue';
import type { BoardProps } from '../game-ui';
import DominoTile from './DominoTile.vue';
import { dominoesStrings as texts } from './texts';

/**
 * El tablero del Dominó (ADR-020, DO16). Solo dibuja lo que el servidor
 * envía y emite la ficha elegida: qué fichas se pueden jugar lo dice la
 * vista, y si una jugada vale lo decide el servidor (ADR-014, K7).
 */
const props = defineProps<BoardProps<DominoesView>>();

const emit = defineEmits<{ play: [action: DominoesAction] }>();

const keyOf = (tile: DominoesTile) => `${tile[0]}-${tile[1]}`;

function nameOf(seat: number): string {
  if (seat === props.yourSeat) return texts.you;
  return props.players.find((one) => one.seat === seat)?.displayName ?? texts.seats[seat] ?? '?';
}

const teamOf = (seat: number) => props.view.teams?.findIndex((team) => team.includes(seat)) ?? -1;

/** Los demás asientos, en el orden en que juegan después de quien mira. */
const others = computed(() =>
  Array.from(
    { length: props.view.playerCount - 1 },
    (_, step) => (props.yourSeat + step + 1) % props.view.playerCount,
  ).map((seat) => ({
    seat,
    name: nameOf(seat),
    tiles: props.view.tileCounts[seat] ?? 0,
    score: props.view.scores[seat] ?? 0,
    partner: props.view.teams !== null && teamOf(seat) === teamOf(props.yourSeat),
    retired: props.view.retiredSeats.includes(seat),
    turn: props.view.turn === seat,
  })),
);

const teamScores = computed(() =>
  props.view.teams?.map((team, index) => ({
    name: texts.teams[index] ?? '',
    score: props.view.scores[team[0] ?? 0] ?? 0,
    yours: team.includes(props.yourSeat),
  })),
);

const playable = computed(
  () => new Map(props.view.playable.map((one) => [keyOf(one.tile), one.ends])),
);

/** La ficha que cabe en los dos extremos y espera a que se elija uno. */
const choosing = ref<DominoesTile | null>(null);
watch(
  () => props.view,
  () => {
    choosing.value = null;
  },
);

function pick(tile: DominoesTile): void {
  const ends = playable.value.get(keyOf(tile));
  if (!props.canPlay || !ends || ends.length === 0) return;
  if (ends.length > 1) {
    choosing.value = tile;
    return;
  }
  playAt(tile, props.view.line.length === 0 ? null : (ends[0] ?? null));
}

function playAt(tile: DominoesTile, end: DominoesEnd | null): void {
  choosing.value = null;
  // Solo en el turno propio: este juego no tiene jugadas fuera de turno (ADR-022, CA19).
  if (!props.canPlay) return;
  emit('play', end ? { type: 'PLAY', tile, end } : { type: 'PLAY', tile });
}

/** Lo que el motor hizo solo en el último cambio: robar y pasar (DO7). */
const happened = computed(() =>
  props.events.flatMap((event) => {
    const seat = typeof event.seat === 'number' ? event.seat : -1;
    if (event.type === 'TILES_DRAWN' && typeof event.count === 'number') {
      return [texts.events.drew(nameOf(seat), event.count, seat === props.yourSeat)];
    }
    if (event.type === 'PASSED')
      return [texts.events.passed(nameOf(seat), seat === props.yourSeat)];
    return [];
  }),
);

const lastHand = computed(() => {
  const summary = props.view.lastHand;
  if (!summary) return null;
  const result =
    summary.ending === 'BLOCKED_TIE' || summary.winner === null
      ? texts.lastHand.BLOCKED_TIE
      : texts.lastHand[summary.ending](
          nameOf(summary.winner),
          texts.points(summary.points),
          summary.winner === props.yourSeat,
        );
  return {
    title: texts.lastHand.title(summary.number),
    result,
    hands: summary.hands.map((tiles, seat) => ({ seat, name: nameOf(seat), tiles })),
  };
});
</script>

<template>
  <div class="domino-board" :class="{ locked: !canPlay }">
    <p class="muted domino-meta">
      {{ texts.handNumber(view.handNumber, view.target) }} ·
      <span data-boneyard>{{ texts.boneyard(view.boneyardCount) }}</span>
    </p>

    <ul v-if="teamScores" class="domino-teams" :aria-label="texts.scoreboard">
      <li v-for="team in teamScores" :key="team.name" :class="{ yours: team.yours }">
        {{ team.name }}: <strong>{{ texts.points(team.score) }}</strong>
      </li>
    </ul>

    <ul class="domino-players">
      <li
        v-for="other in others"
        :key="other.seat"
        class="domino-player"
        :class="{ turn: other.turn, retired: other.retired }"
        :data-seat="other.seat"
      >
        <span class="domino-player-name">
          {{ other.name }}
          <span v-if="other.partner" class="badge">{{ texts.partner }}</span>
          <span v-if="other.retired" class="badge">{{ texts.retired }}</span>
          <span v-if="other.turn" class="badge on">{{ texts.turn }}</span>
        </span>
        <span class="muted" data-tiles>{{ texts.tiles(other.tiles) }}</span>
        <span v-if="!view.teams" data-score>{{ texts.points(other.score) }}</span>
      </li>
    </ul>

    <section class="domino-table" aria-labelledby="domino-line-title">
      <h3 id="domino-line-title" class="visually-hidden">{{ texts.line }}</h3>
      <p v-if="view.line.length === 0" class="muted">{{ texts.emptyLine }}</p>
      <div v-else class="domino-line" data-line>
        <DominoTile
          v-for="(tile, index) in view.line"
          :key="`${index}-${tile[0]}-${tile[1]}`"
          :tile="tile"
          :vertical="tile[0] === tile[1]"
        />
      </div>
    </section>

    <p v-for="text in happened" :key="text" class="muted domino-event" role="status">{{ text }}</p>

    <section v-if="view.hand" class="domino-hand" aria-labelledby="domino-hand-title">
      <h3 id="domino-hand-title">
        {{ texts.yourHand }}
        <span v-if="!view.teams" class="muted domino-own-score" data-own-score>
          · {{ texts.points(view.scores[yourSeat] ?? 0) }}
        </span>
      </h3>
      <div class="domino-hand-tiles">
        <button
          v-for="tile in view.hand"
          :key="keyOf(tile)"
          type="button"
          class="domino-button"
          :class="{ chosen: choosing && keyOf(choosing) === keyOf(tile) }"
          :disabled="!canPlay || !playable.has(keyOf(tile))"
          :aria-label="texts.tile(tile[0], tile[1])"
          :data-tile="keyOf(tile)"
          @click="pick(tile)"
        >
          <DominoTile :tile="tile" vertical />
        </button>
      </div>
      <div
        v-if="choosing"
        class="domino-choice"
        role="group"
        :aria-label="texts.chooseEnd(texts.tile(choosing[0], choosing[1]))"
      >
        <p>{{ texts.chooseEnd(texts.tile(choosing[0], choosing[1])) }}</p>
        <button
          v-for="end in ['LEFT', 'RIGHT'] as const"
          :key="end"
          type="button"
          class="button"
          :data-end="end"
          @click="playAt(choosing, end)"
        >
          {{ texts.ends[end] }}
        </button>
        <button type="button" class="button quiet" @click="choosing = null">
          {{ texts.cancel }}
        </button>
      </div>
    </section>

    <section
      v-if="lastHand"
      class="domino-summary panel"
      aria-labelledby="domino-summary-title"
      data-last-hand
    >
      <h3 id="domino-summary-title">{{ lastHand.title }}</h3>
      <p>{{ lastHand.result }}</p>
      <p class="muted">{{ texts.lastHand.left }}</p>
      <ul>
        <li v-for="one in lastHand.hands" :key="one.seat">
          {{ one.name }}:
          <template v-if="one.tiles.length === 0">{{ texts.lastHand.none }}</template>
          <DominoTile v-for="tile in one.tiles" :key="keyOf(tile)" :tile="tile" small />
        </li>
      </ul>
    </section>
  </div>
</template>
