<script setup lang="ts">
import type { TidesBirdKind, TidesDieView, TidesSeason } from '@gameboard/game-engine/tides';
import { computed } from 'vue';
import { tidesStrings as texts } from './texts';

/**
 * Un ave dibujada como carta, del color de su estación (ADR-023, MA17). Sirve
 * para la cima de un montón de aves de paso (`count`) y para las que van a
 * bordo. Con `as="button"` toda la carta se puede tocar. Las aves con casilla
 * propia la dibujan como las casillas de las islas: qué dado admite y qué da.
 */
const props = withDefaults(
  defineProps<{
    kind: TidesBirdKind | null;
    season: TidesSeason;
    /** Las que quedan en el montón, si es un montón. */
    count?: number | null;
    ready?: boolean;
    as?: 'article' | 'button';
    /** El dado puesto en su casilla, si la tiene y está ocupada. */
    die?: TidesDieView | null;
  }>(),
  { count: null, ready: false, as: 'article', die: null },
);

const space = computed(() => (props.kind ? texts.birdSpaces[props.kind] : undefined));
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
      <template v-if="space">
        <span class="td-card-text">{{ texts.cards.spaceIntro }}</span>
        <span class="td-space td-bird-slot" :class="{ taken: die }">
          <span class="td-space-need">
            <span class="td-figure" aria-hidden="true">{{ texts.cards.spaceSymbols[space] }}</span>
            {{ texts.cards.space[space] }}
          </span>
          <span class="td-space-reward">→ {{ texts.birdSpaceRewards[kind] }}</span>
          <span v-if="die" class="td-stack">
            <span
              class="td-die"
              :class="[
                `seat-${die.owner}`,
                die.kind === 'BOAT' ? 'boat' : 'weather',
                `face-${die.face.toLowerCase()}`,
              ]"
              aria-hidden="true"
              >{{ texts.symbols[die.face] }}</span
            >
          </span>
        </span>
      </template>
      <span v-else class="td-card-text">{{ texts.birdPowers[kind] }}</span>
    </template>
    <span v-else class="td-card-text">{{ texts.cards.emptyPile }}</span>
    <span v-if="count !== null" class="td-card-note">{{ texts.cards.pile(count) }}</span>
    <slot />
  </component>
</template>
