<script setup lang="ts">
import type {
  FourInARowAction,
  FourInARowCell,
  FourInARowView,
} from '@gameboard/game-engine/four-in-a-row';
import { computed } from 'vue';
import { es } from '../i18n/es';

/**
 * El tablero de Cuatro en raya. Solo dibuja lo que el servidor envía y
 * dice qué columna se pulsa: no decide si una jugada es válida, porque el
 * motor no se ejecuta en el navegador (ADR-014, decisión K7).
 */
const props = defineProps<{
  view: FourInARowView;
  /** Si quien mira puede jugar ahora mismo. */
  canPlay: boolean;
}>();

const emit = defineEmits<{ play: [action: FourInARowAction] }>();

const texts = es.games['four-in-a-row'];

const isIn = (cells: readonly FourInARowCell[] | null, column: number, row: number) =>
  cells?.some((cell) => cell.column === column && cell.row === row) ?? false;

/** Las columnas, cada una con sus casillas de arriba abajo, que es como se dibujan. */
const columns = computed(() =>
  props.view.cells.map((cells, column) => ({
    column,
    tokens: cells.filter((seat) => seat !== null).length,
    playable: props.view.playableColumns.includes(column),
    cells: cells
      .map((seat, row) => ({
        row,
        seat,
        winning: isIn(props.view.winningLine, column, row),
        last: props.view.lastToken?.column === column && props.view.lastToken.row === row,
      }))
      .reverse(),
  })),
);

function drop(column: number): void {
  emit('play', { type: 'DROP_TOKEN', column });
}
</script>

<template>
  <div class="four-board" :class="{ locked: !canPlay }">
    <button
      v-for="one in columns"
      :key="one.column"
      type="button"
      class="four-column"
      :disabled="!canPlay || !one.playable"
      :aria-label="`${texts.dropIn(one.column + 1)} (${texts.columnState(one.tokens, view.rowCount)})`"
      :data-column="one.column"
      @click="drop(one.column)"
    >
      <span
        v-for="cell in one.cells"
        :key="cell.row"
        class="four-cell"
        :class="{
          'seat-0': cell.seat === 0,
          'seat-1': cell.seat === 1,
          winning: cell.winning,
          last: cell.last,
        }"
        :data-row="cell.row"
        :data-seat="cell.seat ?? ''"
        aria-hidden="true"
      />
    </button>
  </div>
</template>
