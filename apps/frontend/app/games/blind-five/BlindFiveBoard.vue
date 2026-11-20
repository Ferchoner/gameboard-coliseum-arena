<script setup lang="ts">
import type {
  BlindFiveAction,
  BlindFiveClue,
  BlindFiveSuit,
  BlindFiveTile as CatalogTile,
  BlindFiveView,
} from '@gameboard/game-engine/blind-five';
import { computed, ref, watch } from 'vue';
import type { BoardProps } from '../game-ui';
import BlindFiveTile from './BlindFiveTile.vue';
import {
  loadNotes,
  notesKey,
  type Notes,
  saveNotes,
  seenNumbers,
  toggled,
  validDeclaration,
} from './notes';
import { blindFiveStrings as texts } from './texts';

/**
 * El tablero de Cinco a ciegas (ADR-022, CA16 y CA17). Solo dibuja lo que
 * el servidor envía y emite lo que la persona elige: si una jugada vale lo
 * decide el servidor (ADR-014, K7). Revelar y pedir pista solo en el turno
 * propio (`canPlay`); cantar, en cualquier momento (`canSend`; CA9 y CA19).
 */
const props = defineProps<BoardProps<BlindFiveView>>();

const emit = defineEmits<{ play: [action: BlindFiveAction] }>();

const SUITS: readonly BlindFiveSuit[] = ['S1', 'S2', 'S3', 'S4', 'S5'];

function nameOf(seat: number): string {
  if (seat === props.yourSeat) return texts.you;
  return props.players.find((one) => one.seat === seat)?.displayName ?? texts.seats[seat] ?? '?';
}

const tileOf = (number: number): CatalogTile =>
  props.view.catalog[number - 1] ?? { number, suit: 'S1', dots: 1 };

const mine = computed(() => props.view.seats[props.yourSeat]);
const youAreOut = computed(() => (mine.value?.out ?? null) !== null);
const yourTurn = computed(() => props.canPlay && props.view.turn === props.yourSeat);
const supplyTotal = computed(() =>
  SUITS.reduce((total, suit) => total + (props.view.supplyBySuit[suit] ?? 0), 0),
);

/** Cómo se dibuja un atril con sus pistas: las de ordenar en sus 6 huecos y las de comparar bajo cada ficha. */
function layoutOf(clues: readonly BlindFiveClue[]) {
  const slots: CatalogTile[][] = Array.from({ length: 6 }, () => []);
  const compares: { tile: CatalogTile; same: boolean }[][] = Array.from({ length: 5 }, () => []);
  for (const clue of clues) {
    if (clue.clue === 'SORT') slots[clue.slot]?.push(tileOf(clue.tile));
    else compares[clue.position]?.push({ tile: tileOf(clue.tile), same: clue.sameDots });
  }
  return { slots, compares };
}

/** Los demás asientos, en el orden en que juegan después de quien mira. */
const rivals = computed(() =>
  Array.from(
    { length: props.view.playerCount - 1 },
    (_, step) => (props.yourSeat + step + 1) % props.view.playerCount,
  ).map((seat) => {
    const view = props.view.seats[seat];
    return {
      seat,
      name: nameOf(seat),
      stand: view?.stand ?? [],
      out: view?.out ?? null,
      turn: props.view.turn === seat,
      ...layoutOf(view?.clues ?? []),
    };
  }),
);

const own = computed(() => ({
  stand: mine.value?.stand ?? [],
  ...layoutOf(mine.value?.clues ?? []),
}));

const statusText = computed(() => {
  const { turn, step } = props.view;
  if (turn === null || step === null) return null;
  if (youAreOut.value) return texts.youOut;
  if (turn === props.yourSeat) return texts.step[step];
  return texts.waiting;
});

// --- Revelar y pedir pista ---------------------------------------------------

/** La ficha boca arriba elegida para la pista. */
const chosen = ref<number | null>(null);
watch(
  () => props.view,
  () => {
    if (chosen.value !== null && !props.view.faceUp.some((one) => one.number === chosen.value)) {
      chosen.value = null;
    }
  },
);

const canReveal = computed(() => yourTurn.value && props.view.step === 'REVEAL');
const canClue = computed(() => yourTurn.value && props.view.step === 'CLUE');

function reveal(suit: BlindFiveSuit): void {
  if (!canReveal.value) return;
  emit('play', { type: 'REVEAL', suit });
}

function choose(number: number): void {
  if (!canClue.value) return;
  chosen.value = chosen.value === number ? null : number;
}

function askSort(): void {
  if (!canClue.value || chosen.value === null) return;
  emit('play', { type: 'CLUE', tile: chosen.value, clue: 'SORT' });
  chosen.value = null;
}

function askCompare(position: number): void {
  if (!canClue.value || chosen.value === null) return;
  emit('play', { type: 'CLUE', tile: chosen.value, clue: 'COMPARE', position });
  chosen.value = null;
}

// --- Hoja de deducción (CA16) -------------------------------------------------

const key = computed(() => notesKey(props.view.revealed, props.yourSeat));
const notes = ref<Notes>({});
watch(
  key,
  (value) => {
    notes.value = loadNotes(value);
  },
  { immediate: true },
);

const seen = computed(() =>
  seenNumbers(
    props.view.seats.map((seat) => seat.stand),
    props.view.revealed,
  ),
);

/** Las 60 fichas por palo, en columnas, con lo que se ve y lo que marcó el jugador. */
const sheet = computed(() =>
  SUITS.map((suit) => ({
    suit,
    name: texts.suits[suit],
    tiles: props.view.catalog
      .filter((tile) => tile.suit === suit)
      .map((tile) => ({
        ...tile,
        seen: seen.value.has(tile.number),
        mark: notes.value[tile.number] ?? null,
      })),
  })),
);

function mark(number: number): void {
  if (seen.value.has(number)) return;
  notes.value = toggled(notes.value, number);
  saveNotes(key.value, notes.value);
}

function clearNotes(): void {
  notes.value = {};
  saveNotes(key.value, notes.value);
}

// --- Cantar (CA9 y CA10) ---------------------------------------------------------

const declaring = ref(false);
const guess = ref<(number | null)[]>([null, null, null, null, null]);
const canDeclare = computed(() => props.canSend && !youAreOut.value && props.view.turn !== null);

function openDeclare(): void {
  // Empieza con los números marcados como posibles, si son cinco.
  const possible = Object.entries(notes.value)
    .filter(([, value]) => value === 'POSSIBLE')
    .map(([number]) => Number(number))
    .sort((a, b) => a - b);
  guess.value = possible.length === 5 ? possible : [null, null, null, null, null];
  declaring.value = true;
}

const guessNumbers = computed(() => guess.value.map((one) => (one === null ? NaN : Number(one))));
const guessValid = computed(() => validDeclaration(guessNumbers.value));

function declare(): void {
  if (!canDeclare.value || !guessValid.value) return;
  emit('play', { type: 'DECLARE', numbers: guessNumbers.value });
  declaring.value = false;
}

const declarations = computed(() =>
  props.view.declarations.map((one) => ({
    ...one,
    text: texts.declared(nameOf(one.seat), one.numbers.join(', '), one.correct),
  })),
);
</script>

<template>
  <div class="b5-board" :class="{ locked: !canSend }">
    <p v-if="statusText" class="b5-status" data-status>{{ statusText }}</p>

    <ul class="b5-rivals">
      <li
        v-for="rival in rivals"
        :key="rival.seat"
        class="b5-rival panel"
        :class="[`seat-${rival.seat}`, { turn: rival.turn, out: rival.out }]"
        :data-seat="rival.seat"
      >
        <h3 class="b5-rival-name">
          {{ rival.name }}
          <span v-if="rival.out" class="badge">{{ texts.out[rival.out] }}</span>
          <span v-if="rival.turn" class="badge on">{{ texts.turn }}</span>
        </h3>
        <div class="b5-stand" :aria-label="texts.rivalStand(rival.name)" role="group">
          <template v-for="(tile, index) in rival.stand" :key="index">
            <span class="b5-slot">
              <BlindFiveTile
                v-for="one in rival.slots[index]"
                :key="one.number"
                :suit="one.suit"
                :number="one.number"
                :dots="one.dots"
                small
              />
            </span>
            <span class="b5-stand-tile">
              <BlindFiveTile :suit="tile.suit" :number="tile.number" :dots="tile.dots" />
              <span
                v-for="one in rival.compares[index]"
                :key="one.tile.number"
                class="b5-compare"
                :class="{ same: one.same }"
              >
                {{ one.same ? '=' : '≠' }} {{ one.tile.number }}
              </span>
            </span>
          </template>
          <span class="b5-slot">
            <BlindFiveTile
              v-for="one in rival.slots[5]"
              :key="one.number"
              :suit="one.suit"
              :number="one.number"
              :dots="one.dots"
              small
            />
          </span>
        </div>
      </li>
    </ul>

    <section class="b5-table" aria-labelledby="b5-face-up-title">
      <h3 id="b5-face-up-title">
        {{ texts.faceUp }}
        <span class="muted b5-supply" data-supply>· {{ texts.supplyLeft(supplyTotal) }}</span>
      </h3>
      <div class="b5-face-up">
        <button
          v-for="tile in view.faceUp"
          :key="tile.number"
          type="button"
          class="b5-pick"
          :class="{ chosen: chosen === tile.number }"
          :disabled="!canClue"
          :aria-pressed="chosen === tile.number"
          :data-face-up="tile.number"
          @click="choose(tile.number)"
        >
          <BlindFiveTile :suit="tile.suit" :number="tile.number" :dots="tile.dots" />
        </button>
      </div>

      <div v-if="canReveal" class="b5-reveal" role="group" :aria-label="texts.reveal">
        <button
          v-for="suit in SUITS"
          :key="suit"
          type="button"
          class="button b5-reveal-button"
          :disabled="(view.supplyBySuit[suit] ?? 0) === 0"
          :aria-label="texts.revealSuit(texts.suits[suit], view.supplyBySuit[suit] ?? 0)"
          :data-reveal="suit"
          @click="reveal(suit)"
        >
          <BlindFiveTile :suit="suit" small symbol :label="texts.suits[suit]" />
          <span>{{ view.supplyBySuit[suit] ?? 0 }}</span>
        </button>
      </div>

      <div v-if="canClue && chosen !== null" class="b5-clue panel" role="group" data-clue>
        <p>
          {{
            texts.chosen(
              texts.tile(chosen, texts.suits[tileOf(chosen).suit], texts.dots(tileOf(chosen).dots)),
            )
          }}
        </p>
        <button type="button" class="button" data-sort @click="askSort">{{ texts.sort }}</button>
        <button
          v-for="position in 5"
          :key="position"
          type="button"
          class="button quiet"
          :data-compare="position - 1"
          @click="askCompare(position - 1)"
        >
          {{ texts.compareWith(position) }}
        </button>
        <button type="button" class="button quiet" @click="chosen = null">
          {{ texts.cancel }}
        </button>
      </div>
    </section>

    <section class="b5-own panel" :class="`seat-${yourSeat}`" aria-labelledby="b5-own-title">
      <h3 id="b5-own-title">{{ texts.yourStand }}</h3>
      <p class="muted">{{ texts.yourStandHint }}</p>
      <div class="b5-stand" data-own-stand>
        <template v-for="(tile, index) in own.stand" :key="index">
          <span class="b5-slot">
            <BlindFiveTile
              v-for="one in own.slots[index]"
              :key="one.number"
              :suit="one.suit"
              :number="one.number"
              :dots="one.dots"
              small
            />
          </span>
          <span class="b5-stand-tile">
            <BlindFiveTile
              :suit="tile.suit"
              :number="tile.number"
              :dots="tile.dots"
              :label="
                tile.number === null
                  ? texts.hiddenTile(index + 1, texts.suits[tile.suit])
                  : undefined
              "
            />
            <span class="b5-position muted">{{ index + 1 }}</span>
            <span
              v-for="one in own.compares[index]"
              :key="one.tile.number"
              class="b5-compare"
              :class="{ same: one.same }"
            >
              {{ one.same ? '=' : '≠' }} {{ one.tile.number }}
            </span>
          </span>
        </template>
        <span class="b5-slot">
          <BlindFiveTile
            v-for="one in own.slots[5]"
            :key="one.number"
            :suit="one.suit"
            :number="one.number"
            :dots="one.dots"
            small
          />
        </span>
      </div>

      <div v-if="canDeclare" class="b5-declare">
        <button
          v-if="!declaring"
          type="button"
          class="button"
          data-declare-open
          @click="openDeclare"
        >
          {{ texts.declare.open }}
        </button>
        <form v-else class="b5-declare-form" @submit.prevent="declare">
          <fieldset>
            <legend>{{ texts.declare.title }}</legend>
            <label v-for="position in 5" :key="position" class="b5-declare-number">
              <span class="visually-hidden">{{ texts.declare.number(position) }}</span>
              <input
                v-model.number="guess[position - 1]"
                type="number"
                inputmode="numeric"
                min="1"
                max="60"
                required
                :data-guess="position - 1"
              />
            </label>
          </fieldset>
          <p class="notice warning">{{ texts.declare.warning }}</p>
          <p v-if="!guessValid" class="muted">{{ texts.declare.invalid }}</p>
          <button type="submit" class="button danger" :disabled="!guessValid" data-declare>
            {{ texts.declare.confirm }}
          </button>
          <button type="button" class="button quiet" @click="declaring = false">
            {{ texts.declare.cancel }}
          </button>
        </form>
      </div>
    </section>

    <section v-if="declarations.length > 0" class="b5-declarations" aria-labelledby="b5-tries">
      <h3 id="b5-tries">{{ texts.declarations }}</h3>
      <ul>
        <li v-for="(one, index) in declarations" :key="index" :class="{ correct: one.correct }">
          {{ one.text }}
        </li>
      </ul>
    </section>

    <details class="b5-sheet panel" data-sheet>
      <summary>{{ texts.sheet.title }}</summary>
      <p class="muted">{{ texts.sheet.hint }}</p>
      <div class="b5-sheet-grid">
        <div v-for="column in sheet" :key="column.suit" class="b5-sheet-column">
          <span class="b5-sheet-head">
            <BlindFiveTile :suit="column.suit" small symbol :label="column.name" />
          </span>
          <button
            v-for="tile in column.tiles"
            :key="tile.number"
            type="button"
            class="b5-sheet-cell"
            :class="[
              `b5-${tile.suit}`,
              {
                seen: tile.seen,
                crossed: tile.mark === 'CROSSED',
                possible: tile.mark === 'POSSIBLE',
              },
            ]"
            :disabled="tile.seen"
            :aria-label="`${texts.tile(tile.number, column.name, texts.dots(tile.dots))}${
              tile.seen
                ? `, ${texts.sheet.seen}`
                : tile.mark === 'CROSSED'
                  ? `, ${texts.sheet.crossed}`
                  : tile.mark === 'POSSIBLE'
                    ? `, ${texts.sheet.possible}`
                    : ''
            }`"
            :data-sheet-number="tile.number"
            @click="mark(tile.number)"
          >
            {{ tile.number
            }}<span class="b5-sheet-dots" aria-hidden="true">{{ '•'.repeat(tile.dots) }}</span>
          </button>
        </div>
      </div>
      <button type="button" class="button quiet" @click="clearNotes">
        {{ texts.sheet.clear }}
      </button>
    </details>

    <p class="muted b5-credit">{{ texts.credit }}</p>
  </div>
</template>
