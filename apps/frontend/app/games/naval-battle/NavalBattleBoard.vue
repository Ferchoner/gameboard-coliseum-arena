<script setup lang="ts">
import type {
  NavalBattleAction,
  NavalBattleCell,
  NavalBattleGridView,
  NavalBattleOrientation,
  NavalBattlePlacement,
  NavalBattleShipId,
  NavalBattleShotResult,
  NavalBattleView,
} from '@gameboard/game-engine/naval-battle';
import { computed, ref } from 'vue';
import type { BoardProps } from '../game-ui';
import { navalBattleStrings as texts } from './texts';

/**
 * El tablero de Batalla naval (ADR-019, X13 y X14). Solo dibuja lo que el
 * servidor envía y emite la acción elegida: no decide si una flota o un
 * disparo valen, porque el motor no se ejecuta en el navegador (ADR-014,
 * decisión K7). La colocación que se prepara aquí es un borrador local
 * hasta pulsar "Listo".
 */
const props = defineProps<BoardProps<NavalBattleView>>();

const emit = defineEmits<{ play: [action: NavalBattleAction] }>();

const size = computed(() => props.view.size);
const indexes = computed(() => Array.from({ length: size.value }, (_, index) => index));
const rivalSeat = computed(() => (props.yourSeat === 0 ? 1 : 0));
const ownGrid = computed(() => props.view.grids[props.yourSeat] ?? null);
const rivalGrid = computed(() => props.view.grids[rivalSeat.value] ?? null);

const placing = computed(
  () => props.view.phase === 'PLACEMENT' && ownGrid.value !== null && !ownGrid.value.placed,
);

const cellName = (cell: NavalBattleCell) =>
  texts.cellName(texts.rows[cell.row] ?? '?', cell.col + 1);
const sameCell = (a: NavalBattleCell, b: NavalBattleCell) => a.row === b.row && a.col === b.col;
const sizeOf = (ship: NavalBattleShipId) =>
  props.view.fleet.find((one) => one.ship === ship)?.size ?? 0;

function cellsOf(placement: NavalBattlePlacement): NavalBattleCell[] {
  return Array.from({ length: sizeOf(placement.ship) }, (_, step) =>
    placement.orientation === 'H'
      ? { row: placement.row, col: placement.col + step }
      : { row: placement.row + step, col: placement.col },
  );
}

// --- Borrador de la colocación ----------------------------------------------

const draft = ref<NavalBattlePlacement[]>([]);
const selected = ref<NavalBattleShipId | null>(props.view.fleet[0]?.ship ?? null);
const orientation = ref<NavalBattleOrientation>('H');

const draftComplete = computed(() => draft.value.length === props.view.fleet.length);

/** El barco del borrador que ocupa esa casilla, si hay alguno. */
function draftShipAt(cell: NavalBattleCell): NavalBattleShipId | null {
  return draft.value.find((one) => cellsOf(one).some((c) => sameCell(c, cell)))?.ship ?? null;
}

function selectShip(ship: NavalBattleShipId): void {
  selected.value = ship;
}

function rotate(): void {
  orientation.value = orientation.value === 'H' ? 'V' : 'H';
}

/**
 * Pone el barco elegido con su casilla de inicio en `cell`. Solo comprueba
 * que quepa en la cuadrícula, para poder dibujarlo; si toca a otro, lo dirá
 * el servidor al pulsar "Listo".
 */
function placeAt(cell: NavalBattleCell): void {
  const ship = selected.value;
  if (!ship) return;
  const placement: NavalBattlePlacement = { ship, ...cell, orientation: orientation.value };
  if (!cellsOf(placement).every((c) => c.row < size.value && c.col < size.value)) return;
  draft.value = [...draft.value.filter((one) => one.ship !== ship), placement];
  // Pasa al siguiente barco sin colocar.
  selected.value =
    props.view.fleet.find((one) => !draft.value.some((placed) => placed.ship === one.ship))?.ship ??
    null;
}

function clearDraft(): void {
  draft.value = [];
  selected.value = props.view.fleet[0]?.ship ?? null;
}

/**
 * Propone una colocación al azar que respeta la regla de no tocarse. El
 * azar del navegador no decide nada: el servidor valida la flota como
 * cualquier otra (ADR-019, X13).
 */
function randomize(): void {
  const away = (a: NavalBattleCell, b: NavalBattleCell) =>
    Math.abs(a.row - b.row) > 1 || Math.abs(a.col - b.col) > 1;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const fleet: NavalBattlePlacement[] = [];
    for (const { ship, size: length } of props.view.fleet) {
      for (let tries = 0; tries < 200; tries += 1) {
        const horizontal = Math.random() < 0.5;
        const candidate: NavalBattlePlacement = {
          ship,
          orientation: horizontal ? 'H' : 'V',
          row: Math.floor(Math.random() * (size.value - (horizontal ? 0 : length - 1))),
          col: Math.floor(Math.random() * (size.value - (horizontal ? length - 1 : 0))),
        };
        const cells = cellsOf(candidate);
        if (fleet.every((other) => cellsOf(other).every((c) => cells.every((d) => away(c, d))))) {
          fleet.push(candidate);
          break;
        }
      }
    }
    if (fleet.length === props.view.fleet.length) {
      draft.value = fleet;
      selected.value = null;
      return;
    }
  }
}

function submitFleet(): void {
  emit('play', { type: 'PLACE_FLEET', ships: draft.value });
}

// --- Cuadrículas ------------------------------------------------------------

interface CellState {
  readonly cell: NavalBattleCell;
  readonly name: string;
  /** El barco que se ve en la casilla: el propio, el del borrador o uno hundido. */
  readonly ship: boolean;
  readonly sunk: boolean;
  readonly shot: NavalBattleShotResult | null;
  readonly last: boolean;
}

function gridCells(
  grid: NavalBattleGridView | null,
  owner: number,
  withDraft: boolean,
): CellState[][] {
  const ships = (grid?.ships ?? []).flatMap((ship) => ship.cells);
  const sunk = (grid?.sunk ?? []).flatMap((ship) => ship.cells);
  const last = props.view.lastShot;
  return indexes.value.map((row) =>
    indexes.value.map((col) => {
      const cell = { row, col };
      const shot = grid?.shots.find((one) => sameCell(one, cell))?.result ?? null;
      return {
        cell,
        name: cellName(cell),
        ship:
          ships.some((c) => sameCell(c, cell)) ||
          sunk.some((c) => sameCell(c, cell)) ||
          (withDraft && draftShipAt(cell) !== null),
        sunk: sunk.some((c) => sameCell(c, cell)),
        shot,
        last: !!last && last.seat !== owner && sameCell(last, cell),
      };
    }),
  );
}

const ownCells = computed(() => gridCells(ownGrid.value, props.yourSeat, placing.value));
const rivalCells = computed(() => gridCells(rivalGrid.value, rivalSeat.value, false));

const rivalAfloat = computed(() => props.view.fleet.length - (rivalGrid.value?.sunk.length ?? 0));

function cellLabel(state: CellState): string {
  return state.shot ? `${state.name}, ${texts.shot[state.shot]}` : state.name;
}

function fire(state: CellState): void {
  emit('play', { type: 'FIRE', ...state.cell });
}
</script>

<template>
  <div class="naval-board" :class="{ locked: !canPlay }">
    <!-- Colocación: el borrador de la flota propia. -->
    <section v-if="placing" class="naval-placement" aria-labelledby="naval-placement-title">
      <h3 id="naval-placement-title">{{ texts.placement.title }}</h3>
      <p class="muted">{{ texts.placement.help }}</p>
      <div class="naval-ships" role="group" :aria-label="texts.placement.title">
        <button
          v-for="one in view.fleet"
          :key="one.ship"
          type="button"
          class="button"
          :class="{ quiet: selected !== one.ship }"
          :aria-pressed="selected === one.ship"
          :data-ship="one.ship"
          @click="selectShip(one.ship)"
        >
          {{ texts.ships[one.ship] }} · {{ texts.placement.shipSize(one.size) }}
          <span v-if="draft.some((placed) => placed.ship === one.ship)" aria-hidden="true"> ✓</span>
        </button>
      </div>
      <div class="naval-tools">
        <button type="button" class="button quiet" data-action="rotate" @click="rotate">
          {{ texts.placement.rotate(orientation === 'H') }}
        </button>
        <button type="button" class="button quiet" data-action="random" @click="randomize">
          {{ texts.placement.random }}
        </button>
        <button type="button" class="button quiet" data-action="clear" @click="clearDraft">
          {{ texts.placement.clear }}
        </button>
      </div>
      <div class="naval-grid" :class="`seat-${yourSeat}`" :style="{ '--naval-size': view.size }">
        <span aria-hidden="true" />
        <span v-for="col in indexes" :key="`h${col}`" class="naval-label" aria-hidden="true">
          {{ col + 1 }}
        </span>
        <template v-for="(line, row) in ownCells" :key="row">
          <span class="naval-label" aria-hidden="true">{{ texts.rows[row] }}</span>
          <button
            v-for="state in line"
            :key="state.name"
            type="button"
            class="naval-cell"
            :class="{ ship: state.ship }"
            :disabled="!canPlay || !selected"
            :aria-label="texts.placement.placeAt(selected ? texts.ships[selected] : '', state.name)"
            :data-cell="state.name"
            @click="placeAt(state.cell)"
          />
        </template>
      </div>
      <p v-if="rivalGrid?.placed" class="muted">{{ texts.placement.rivalPlaced }}</p>
      <button
        type="button"
        class="button"
        data-action="ready"
        :disabled="!canPlay || !draftComplete"
        @click="submitFleet"
      >
        {{ texts.placement.ready }}
      </button>
    </section>

    <template v-else>
      <p v-if="view.phase === 'PLACEMENT'" class="notice" role="status">
        {{ texts.placement.waiting }}
      </p>

      <!-- La flota rival: donde se dispara. -->
      <section
        v-if="view.phase === 'FIRING'"
        class="naval-side rival"
        aria-labelledby="naval-rival-title"
      >
        <h3 id="naval-rival-title">
          {{ texts.rivalGrid }}
          <span class="muted naval-afloat">{{ texts.firing.remaining(rivalAfloat) }}</span>
        </h3>
        <div
          class="naval-grid"
          :class="`seat-${rivalSeat}`"
          :style="{ '--naval-size': view.size }"
          data-grid="rival"
        >
          <span aria-hidden="true" />
          <span v-for="col in indexes" :key="`h${col}`" class="naval-label" aria-hidden="true">
            {{ col + 1 }}
          </span>
          <template v-for="(line, row) in rivalCells" :key="row">
            <span class="naval-label" aria-hidden="true">{{ texts.rows[row] }}</span>
            <button
              v-for="state in line"
              :key="state.name"
              type="button"
              class="naval-cell"
              :class="[
                state.shot ? `shot-${state.shot.toLowerCase()}` : null,
                { ship: state.ship, last: state.last },
              ]"
              :disabled="!canPlay || state.shot !== null"
              :aria-label="state.shot ? cellLabel(state) : texts.firing.fireAt(state.name)"
              :data-cell="state.name"
              @click="fire(state)"
            />
          </template>
        </div>
      </section>

      <!-- La flota propia, con los disparos recibidos. -->
      <section class="naval-side own" aria-labelledby="naval-own-title">
        <h3 id="naval-own-title">{{ texts.ownGrid }}</h3>
        <div
          class="naval-grid"
          :class="`seat-${yourSeat}`"
          :style="{ '--naval-size': view.size }"
          data-grid="own"
        >
          <span aria-hidden="true" />
          <span v-for="col in indexes" :key="`h${col}`" class="naval-label" aria-hidden="true">
            {{ col + 1 }}
          </span>
          <template v-for="(line, row) in ownCells" :key="row">
            <span class="naval-label" aria-hidden="true">{{ texts.rows[row] }}</span>
            <span
              v-for="state in line"
              :key="state.name"
              class="naval-cell"
              :class="[
                state.shot ? `shot-${state.shot.toLowerCase()}` : null,
                { ship: state.ship, last: state.last },
              ]"
              :aria-label="cellLabel(state)"
              role="img"
              :data-cell="state.name"
            />
          </template>
        </div>
      </section>
    </template>
  </div>
</template>
