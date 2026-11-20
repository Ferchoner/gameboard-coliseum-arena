<script setup lang="ts">
import type { BlindFiveDots, BlindFiveSuit } from '@gameboard/game-engine/blind-five';
import { computed } from 'vue';
import { blindFiveStrings as texts } from './texts';

/**
 * Una ficha de Cinco a ciegas, dibujada con SVG y CSS propios (ADR-022,
 * CA3 y CA17). Cada palo tiene su color y su figura, sobre fondo liso, para
 * que se distinga sin depender del color. De espaldas solo se ve el palo.
 */
const props = defineProps<{
  suit: BlindFiveSuit;
  number?: number | null;
  dots?: BlindFiveDots | null;
  /** El texto para el lector de pantalla, si el de la ficha no basta. */
  label?: string | undefined;
  small?: boolean;
  /** Solo la figura del palo, sin número, para rótulos y botones. */
  symbol?: boolean;
}>();

const hidden = computed(
  () => !props.symbol && (props.number === null || props.number === undefined),
);
const suitName = computed(() => texts.suits[props.suit]);
const ariaLabel = computed(
  () =>
    props.label ??
    (hidden.value
      ? suitName.value
      : props.symbol
        ? suitName.value
        : texts.tile(props.number as number, suitName.value, texts.dots(props.dots ?? 1))),
);
</script>

<template>
  <span
    class="b5-tile"
    :class="[`b5-${suit}`, { hidden, small, symbol }]"
    role="img"
    :aria-label="ariaLabel"
    :data-number="hidden ? undefined : number"
    :data-suit="suit"
  >
    <svg class="b5-shape" viewBox="0 0 20 20" aria-hidden="true">
      <circle v-if="suit === 'S1'" cx="10" cy="10" r="8" />
      <polygon v-else-if="suit === 'S2'" points="10,2 18.5,17.5 1.5,17.5" />
      <rect v-else-if="suit === 'S3'" x="2.5" y="2.5" width="15" height="15" />
      <polygon v-else-if="suit === 'S4'" points="10,1.5 18.5,10 10,18.5 1.5,10" />
      <polygon
        v-else
        points="10,1.5 12.5,7.3 18.8,7.6 13.9,11.6 15.5,17.8 10,14.3 4.5,17.8 6.1,11.6 1.2,7.6 7.5,7.3"
      />
    </svg>
    <template v-if="!symbol">
      <span v-if="!hidden" class="b5-number" aria-hidden="true">{{ number }}</span>
      <span v-else class="b5-number" aria-hidden="true">?</span>
    </template>
    <span v-if="!hidden && dots" class="b5-dots" aria-hidden="true">
      <span v-for="one in dots" :key="one" class="b5-dot" />
    </span>
  </span>
</template>
