<script setup lang="ts">
import { computed } from 'vue';
import { dominoesStrings as texts } from './texts';

/**
 * Una ficha dibujada con CSS propio (ADR-020, DO17): dos mitades con sus
 * puntos en una cuadrícula de 3 × 3. Los dobles se dibujan atravesados.
 */
const props = defineProps<{
  readonly tile: readonly [number, number];
  /** De pie: una mitad encima de la otra. */
  readonly vertical?: boolean;
  readonly small?: boolean;
}>();

/** Las casillas de la cuadrícula de 3 × 3 que llevan punto, por valor. */
const PIPS: Readonly<Record<number, readonly number[]>> = {
  0: [],
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

const halves = computed(() => props.tile.map((value) => new Set(PIPS[value] ?? [])));
const label = computed(() => texts.tile(props.tile[0], props.tile[1]));
</script>

<template>
  <span
    class="domino"
    :class="{ vertical, small }"
    role="img"
    :aria-label="label"
    :data-domino="`${tile[0]}-${tile[1]}`"
  >
    <span v-for="(half, side) in halves" :key="side" class="domino-half" aria-hidden="true">
      <span v-for="spot in 9" :key="spot" :class="{ pip: half.has(spot - 1) }" />
    </span>
  </span>
</template>
