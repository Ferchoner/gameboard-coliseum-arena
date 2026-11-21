<script setup lang="ts">
import type { TidesBasic, TidesOrderCard } from '@gameboard/game-engine/tides';
import { computed } from 'vue';
import { tidesStrings as texts } from './texts';

/**
 * Un encargo dibujado como carta (ADR-023, MA17): nombre, puntos, coste en
 * ingredientes y su efecto al usarlo. Lo que se puede hacer con ella (cumplir,
 * usar, apalabrar) va en el hueco de abajo, y `ready` la resalta.
 */
const props = withDefaults(
  defineProps<{
    card: TidesOrderCard;
    ready?: boolean;
    /** Una vez cumplido, el coste ya no importa. */
    showCost?: boolean;
    /** Una línea bajo el coste: lo que falta para pagarlo, o que ya se puede. */
    note?: string | null;
  }>(),
  { ready: false, showCost: true, note: null },
);

const BASICS: readonly TidesBasic[] = ['FISH', 'SALT', 'ALGAE'];
const cost = computed(() =>
  BASICS.filter((basic) => props.card.cost[basic] > 0).map((basic) => ({
    basic,
    count: props.card.cost[basic],
  })),
);
const costWords = computed(() =>
  cost.value
    .map(({ basic, count }) => `${count} ${texts.ingredients[basic].toLowerCase()}`)
    .join(', '),
);
</script>

<template>
  <article class="td-card td-order-card" :class="{ ready }" :data-order="card.id">
    <span class="td-card-top">
      <span class="td-card-kind">{{ texts.cards.order }}</span>
      <span class="td-card-points">{{ texts.points(card.points) }}</span>
    </span>
    <span class="td-card-name">{{ texts.orders[card.id] ?? card.id }}</span>
    <span v-if="showCost" class="td-cost" :aria-label="`${texts.cost}: ${costWords}`">
      <span
        v-for="one in cost"
        :key="one.basic"
        class="td-ing"
        :class="`ing-${one.basic.toLowerCase()}`"
        aria-hidden="true"
      >
        {{ one.count }} {{ texts.ingredients[one.basic].toLowerCase() }}
      </span>
    </span>
    <span v-if="note" class="td-card-note">{{ note }}</span>
    <span class="td-card-text">
      <span class="td-card-label">{{ texts.cards.effect }}</span>
      {{ texts.uses[card.use] }}
    </span>
    <span v-if="$slots.default" class="td-card-actions"><slot /></span>
  </article>
</template>
