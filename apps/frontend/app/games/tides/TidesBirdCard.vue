<script setup lang="ts">
import type { TidesBirdKind, TidesSeason } from '@gameboard/game-engine/tides';
import { tidesStrings as texts } from './texts';

/**
 * Un ave dibujada como carta, del color de su estación (ADR-023, MA17). Sirve
 * para la cima de un montón de aves de paso (`count`) y para las que van a
 * bordo. Con `as="button"` toda la carta se puede tocar.
 */
withDefaults(
  defineProps<{
    kind: TidesBirdKind | null;
    season: TidesSeason;
    /** Las que quedan en el montón, si es un montón. */
    count?: number | null;
    ready?: boolean;
    as?: 'article' | 'button';
  }>(),
  { count: null, ready: false, as: 'article' },
);
</script>

<template>
  <component
    :is="as"
    :type="as === 'button' ? 'button' : undefined"
    class="td-card td-bird-card"
    :class="[`land-${season.toLowerCase()}`, { ready, stack: (count ?? 0) > 1 }]"
  >
    <span class="td-card-top">
      <span class="td-card-kind">{{ texts.cards.bird }} · {{ texts.seasons[season] }}</span>
    </span>
    <template v-if="kind">
      <span class="td-card-name">{{ texts.birds[kind] }}</span>
      <span class="td-card-text">{{ texts.birdPowers[kind] }}</span>
    </template>
    <span v-else class="td-card-text">{{ texts.cards.emptyPile }}</span>
    <span v-if="count !== null" class="td-card-note">{{ texts.cards.pile(count) }}</span>
    <slot />
  </component>
</template>
