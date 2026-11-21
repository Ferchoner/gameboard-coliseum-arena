<script setup lang="ts">
import type {
  TidesAction,
  TidesBasic,
  TidesDieView,
  TidesIngredient,
  TidesIngredients,
  TidesOrderCard,
  TidesPortSpace,
  TidesTarget,
  TidesView,
} from '@gameboard/game-engine/tides';
import { computed, ref, watch } from 'vue';
import type { BoardProps } from '../game-ui';
import BirdCard from './TidesBirdCard.vue';
import OrderCard from './TidesOrderCard.vue';
import { tidesStrings as texts } from './texts';

/**
 * El tablero de Mareas (ADR-023, MA17). Solo dibuja lo que el servidor envía
 * y emite lo que la persona elige: si una jugada vale lo decide el servidor
 * (ADR-014, K7). Cada dado lleva su figura además del color de su asiento.
 */
const props = defineProps<BoardProps<TidesView>>();

const emit = defineEmits<{ play: [action: TidesAction] }>();

const BASICS: readonly TidesBasic[] = ['FISH', 'SALT', 'ALGAE'];
const INGREDIENTS: readonly TidesIngredient[] = ['FISH', 'SALT', 'ALGAE', 'PEARL'];

function nameOf(seat: number): string {
  if (seat === props.yourSeat) return texts.you;
  return props.players.find((one) => one.seat === seat)?.displayName ?? texts.seats[seat] ?? '?';
}

const dieLabel = (die: TidesDieView) =>
  texts.die(texts.faces[die.face], texts.kinds[die.kind], nameOf(die.owner));
const islandName = (id: string) => texts.islands[id] ?? id;
const orderName = (id: string) => texts.orders[id] ?? id;

const mine = computed(() => props.view.seats[props.yourSeat]);
const myTurn = computed(
  () => props.canPlay && props.view.phase === 'TURNS' && props.view.turn?.seat === props.yourSeat,
);
const pending = computed(() => (myTurn.value ? props.view.pending : null));
const free = computed(() => myTurn.value && pending.value === null);
const canPlace = computed(() => free.value && (props.view.turn?.placementsLeft ?? 0) > 0);

// --- Lo elegido en pantalla ---------------------------------------------------

interface Using {
  order: string;
  use: TidesOrderCard['use'];
  picks: string[];
}

const selectedDie = ref<string | null>(null);
const forceAt = ref<{ island: number; space: number } | null>(null);
const using = ref<Using | null>(null);
const movePick = ref<string | null>(null);
const exchange = ref<{ give: TidesIngredient | ''; take: TidesBasic | '' }[]>([]);
const flamingo = ref(0);

/** La pestaña abierta en el móvil; en pantallas anchas se ve todo (MA17). */
const TABS = ['ORDERS', 'RIVALS'] as const;
const tab = ref<(typeof TABS)[number]>('ORDERS');

function reset(): void {
  selectedDie.value = null;
  forceAt.value = null;
  using.value = null;
  movePick.value = null;
  const upTo = props.view.pending?.kind === 'EXCHANGE' ? props.view.pending.upTo : 0;
  exchange.value = Array.from({ length: upTo }, () => ({ give: '', take: '' }));
  flamingo.value = 0;
}
watch(() => props.view, reset, { immediate: true });

function play(action: TidesAction): void {
  emit('play', action);
  reset();
}

const poolDie = (id: string) => mine.value?.pool.find((die) => die.id === id) ?? null;
const chosenDie = computed(() => (selectedDie.value ? poolDie(selectedDie.value) : null));

function selectDie(id: string): void {
  if (using.value?.use === 'TURN_DIE' || using.value?.use === 'REROLL') {
    const picks = using.value.picks;
    using.value = {
      ...using.value,
      picks: picks.includes(id)
        ? picks.filter((one) => one !== id)
        : using.value.use === 'TURN_DIE'
          ? [id]
          : [...picks, id],
    };
    return;
  }
  if (!canPlace.value) return;
  using.value = null;
  forceAt.value = null;
  selectedDie.value = selectedDie.value === id ? null : id;
}

function place(target: TidesTarget, force?: TidesIngredient): void {
  if (!canPlace.value || !selectedDie.value) return;
  play(
    force
      ? { type: 'PLACE', die: selectedDie.value, target, force }
      : { type: 'PLACE', die: selectedDie.value, target },
  );
}

// --- Islas ---------------------------------------------------------------------

const rowView = computed(() =>
  props.view.row.map((island, index) => ({
    ...island,
    index,
    name: islandName(island.id),
    seasonsText: island.seasons.map((season) => texts.seasons[season]).join(' y '),
    landClass: island.seasons.map((season) => `land-${season.toLowerCase()}`).join(' '),
    twoSeasons: island.seasons.length > 1,
    leaderText: island.leader === null ? texts.noLeader : texts.leader(nameOf(island.leader)),
  })),
);

function onSpace(island: number, space: number): void {
  const spot = props.view.row[island]?.spaces[space];
  if (!spot) return;
  const top = spot.stack.at(-1) ?? null;
  const head = pending.value;
  if (head?.kind === 'SHOAL') {
    play({ type: 'RESOLVE', island, space });
    return;
  }
  if (head?.kind === 'MOVE_BOAT') {
    if (movePick.value === null) {
      if (top?.kind === 'BOAT') movePick.value = top.id;
    } else {
      play({ type: 'RESOLVE', die: movePick.value, to: { island, space } });
    }
    return;
  }
  if (using.value) {
    useOnDie(top, { island, space });
    return;
  }
  const die = chosenDie.value;
  if (!die || !canPlace.value) return;
  if (die.kind === 'BOAT' && die.face !== spot.figure) {
    forceAt.value = { island, space };
    return;
  }
  place({ kind: 'ISLAND', island, space });
}

const forceOptions = computed(() => {
  const at = forceAt.value;
  const spot = at ? props.view.row[at.island]?.spaces[at.space] : undefined;
  if (!at || !spot) return [];
  const options: TidesIngredient[] = spot.reward === 'BIRD' ? ['PEARL'] : [spot.reward, 'PEARL'];
  return options.map((ingredient) => ({
    ingredient,
    label: texts.actions.force(texts.ingredients[ingredient].toLowerCase()),
    disabled: (mine.value?.ingredients[ingredient] ?? 0) < 1,
  }));
});

function force(ingredient: TidesIngredient): void {
  const at = forceAt.value;
  if (!at) return;
  place({ kind: 'ISLAND', ...at }, ingredient);
}

const spaceLabel = (
  islandId: string,
  index: number,
  spot: TidesView['row'][number]['spaces'][number],
) =>
  texts.space(
    islandName(islandId),
    index + 1,
    texts.faces[spot.figure],
    texts.rewards[spot.reward],
    spot.stack.length > 0 ? dieLabel(spot.stack.at(-1) as TidesDieView) : null,
  );

// --- Puerto --------------------------------------------------------------------

// --- Dónde puede ir lo elegido ----------------------------------------------------
// Solo es una ayuda a la vista: lo que vale lo decide el servidor (K7).

type Hint = 'ok' | 'force' | null;

/** Si una casilla de isla está vacía y sin bajío. */
const isOpenSpot = (spot: TidesView['row'][number]['spaces'][number]) =>
  !spot.shoal && spot.stack.length === 0;

function spaceHint(island: number, space: number): Hint {
  const spot = props.view.row[island]?.spaces[space];
  if (!spot) return null;
  const head = pending.value;
  if (head?.kind === 'SHOAL') {
    return isOpenSpot(spot) && (head.island === null || head.island === island) ? 'ok' : null;
  }
  if (head?.kind === 'MOVE_BOAT') {
    if (movePick.value === null) return spot.stack.at(-1)?.kind === 'BOAT' ? 'ok' : null;
    const boat = props.view.row
      .flatMap((one) => one.spaces.flatMap((other) => other.stack))
      .find((die) => die.id === movePick.value);
    return isOpenSpot(spot) && boat?.face === spot.figure ? 'ok' : null;
  }
  const die = chosenDie.value;
  if (!die || !canPlace.value || spot.shoal) return null;
  const top = spot.stack.at(-1);
  if (die.kind === 'BOAT') {
    if (top) return null;
    return die.face === spot.figure ? 'ok' : 'force';
  }
  if (!top || die.face === 'STORM') return 'ok';
  return die.face === 'BREEZE' && top.kind === 'BOAT' && top.owner === props.yourSeat ? 'ok' : null;
}

function portHint(space: TidesPortSpace, used: boolean): Hint {
  const die = chosenDie.value;
  if (!die || !canPlace.value) return null;
  if (space === 'ANY_1' || space === 'ANY_2') return 'ok';
  return die.kind === 'WEATHER' && die.face === space && !used ? 'ok' : null;
}

function birdHint(kind: string, occupied: boolean): Hint {
  const die = chosenDie.value;
  if (!die || !canPlace.value || occupied) return null;
  return texts.birdSpaces[kind] === die.kind ? 'ok' : null;
}

const hintClass = (hint: Hint) => (hint ? `hint-${hint}` : '');

/** Si hay algo elegido que se pone en una casilla: el resto se atenúa. */
const choosing = computed(
  () =>
    chosenDie.value !== null ||
    pending.value?.kind === 'SHOAL' ||
    pending.value?.kind === 'MOVE_BOAT',
);

/** Los pasos del turno propio, para saber por dónde se va. */
const steps = computed(() => {
  const turn = props.view.turn;
  if (!myTurn.value || !turn) return [];
  const placed = turn.placementsLeft === 0;
  return [
    { key: 'place', text: texts.steps.place, done: placed, current: !placed },
    {
      key: 'orders',
      text: texts.steps.orders,
      done: turn.fulfilled && turn.used,
      current: placed && pending.value === null,
    },
    { key: 'end', text: texts.steps.end, done: false, current: false },
  ];
});

const portView = computed(() =>
  props.view.port.map((one) => ({
    ...one,
    name: texts.port.spaces[one.space],
    effect: texts.port.effects[props.view.portSide][one.space],
    used: one.space !== 'ANY_1' && one.space !== 'ANY_2' && one.dice.length > 0,
  })),
);

function onPort(space: TidesPortSpace): void {
  if (using.value) {
    const top = props.view.port.find((one) => one.space === space)?.dice.at(-1) ?? null;
    useOnDie(top, null);
    return;
  }
  if (chosenDie.value) place({ kind: 'PORT', space });
}

function onBird(bird: string, die: TidesDieView | null): void {
  if (using.value) {
    useOnDie(die, null);
    return;
  }
  if (chosenDie.value) place({ kind: 'BIRD', bird });
}

// --- Encargos ------------------------------------------------------------------

/** El pago más barato: lo básico primero y perlas para el resto. */
function cheapest(ingredients: TidesIngredients, card: TidesOrderCard) {
  const payment: Record<TidesIngredient, number> = { FISH: 0, SALT: 0, ALGAE: 0, PEARL: 0 };
  for (const basic of BASICS) {
    payment[basic] = Math.min(ingredients[basic], card.cost[basic]);
    payment.PEARL += card.cost[basic] - payment[basic];
  }
  return payment.PEARL <= ingredients.PEARL ? payment : null;
}

const canFulfil = computed(() => free.value && props.view.turn?.fulfilled === false);

/** Bajo cada encargo: si te alcanza para pagarlo o qué te falta. */
function payNote(card: TidesOrderCard): string | null {
  const own = mine.value;
  if (!own || own.retired) return null;
  const short = BASICS.map((basic) => ({
    basic,
    count: Math.max(0, card.cost[basic] - own.ingredients[basic]),
  })).filter((one) => one.count > 0);
  const total = short.reduce((sum, one) => sum + one.count, 0);
  if (total <= own.ingredients.PEARL) return texts.cards.canPay;
  const list = short
    .map((one) => `${one.count} ${texts.ingredients[one.basic].toLowerCase()}`)
    .join(', ');
  return texts.cards.missing(list, own.ingredients.PEARL > 0);
}
const canUse = computed(() => free.value && props.view.turn?.used === false);

function fulfil(card: TidesOrderCard): void {
  const payment = mine.value ? cheapest(mine.value.ingredients, card) : null;
  if (!canFulfil.value || !payment) return;
  play({ type: 'FULFIL', order: card.id, payment });
}

function startUse(card: TidesOrderCard): void {
  if (!canUse.value) return;
  selectedDie.value = null;
  forceAt.value = null;
  if (card.use === 'DOUBLE_SHIFT') {
    play({ type: 'USE', order: card.id });
    return;
  }
  using.value = { order: card.id, use: card.use, picks: [] };
}

/** Un dado tocado mientras se usa un encargo que actúa sobre dados colocados. */
function useOnDie(top: TidesDieView | null, at: { island: number; space: number } | null): void {
  const current = using.value;
  if (!current) return;
  const { order, use, picks } = current;
  if (use === 'TOW') {
    if (picks.length === 0) {
      if (top?.kind === 'BOAT' && at) using.value = { ...current, picks: [top.id] };
    } else if (at && !top) {
      play({ type: 'USE', order, die: picks[0] as string, to: at });
    }
  } else if (use === 'CROSS') {
    if (top?.kind !== 'BOAT' || !at || picks.includes(top.id)) return;
    const next = [...picks, top.id];
    if (next.length === 2) play({ type: 'USE', order, dice: next });
    else using.value = { ...current, picks: next };
  } else if (use === 'MOOR') {
    if (top) play({ type: 'USE', order, die: top.id });
  } else if (use === 'RETURN_BOAT') {
    if (top?.kind === 'BOAT' && top.owner === props.yourSeat) {
      play({ type: 'USE', order, die: top.id });
    }
  }
}

const turnFaces = computed(() => {
  const id = using.value?.use === 'TURN_DIE' ? using.value.picks[0] : undefined;
  const die = id ? poolDie(id) : null;
  if (!die) return [];
  return (
    die.kind === 'BOAT'
      ? (['NET', 'ANCHOR', 'SAIL'] as const)
      : (['CALM', 'STORM', 'BREEZE'] as const)
  ).map((face) => ({ face, label: `${texts.symbols[face]} ${texts.faces[face]}` }));
});

function turnTo(face: TidesDieView['face']): void {
  const current = using.value;
  const die = current?.picks[0];
  if (!current || !die) return;
  play({ type: 'USE', order: current.order, die, face });
}

function reroll(all: boolean): void {
  const current = using.value;
  if (!current || !mine.value) return;
  const dice = all ? mine.value.pool.map((die) => die.id) : current.picks;
  if (dice.length === 0) return;
  play({ type: 'USE', order: current.order, dice });
}

// --- Aves y anidar -------------------------------------------------------------

const nestOptions = computed(() => {
  const seat = mine.value;
  if (!seat || !free.value) return [];
  const nested = new Set(seat.nests.map((nest) => nest.island));
  return seat.free.map((bird) => ({
    bird,
    islands: seat.claimed.filter(
      (island) => island.seasons.includes(bird.season) && !nested.has(island.id),
    ),
  }));
});

// --- Decisiones pendientes -----------------------------------------------------

const exchangeValid = computed(() =>
  exchange.value.every((one) => (one.give === '') === (one.take === '')),
);

function resolveExchange(): void {
  const rows = exchange.value.filter((one) => one.give !== '' && one.take !== '');
  play({
    type: 'RESOLVE',
    give: rows.map((one) => one.give as TidesIngredient),
    take: rows.map((one) => one.take as TidesBasic),
  });
}

const PAIRS: readonly (readonly [TidesBasic, TidesBasic])[] = [
  ['FISH', 'SALT'],
  ['FISH', 'ALGAE'],
  ['SALT', 'ALGAE'],
];

const ingredientChoices = computed(() => {
  const head = pending.value;
  if (head?.kind !== 'CHOOSE_INGREDIENTS') return [];
  if (head.mode === 'TWO_DISTINCT') {
    return PAIRS.map((pair) => ({
      key: pair.join('-'),
      label: pair.map((one) => texts.ingredients[one]).join(' y '),
      ingredients: [...pair],
    }));
  }
  return BASICS.map((basic) => ({
    key: basic,
    label: texts.ingredients[basic],
    ingredients: head.mode === 'TWO_SAME' ? [basic, basic] : [basic],
  }));
});

const waitingText = computed(() => {
  const { phase, turn, pending: head } = props.view;
  if (phase === 'FINISHED') return texts.status.finished;
  if (phase === 'ROUND_END') {
    return props.view.roundChoices.includes(props.yourSeat) ? null : texts.roundEnd.waiting;
  }
  if (!turn) return null;
  if (turn.seat !== props.yourSeat) {
    // Quién juega ya lo dice la página de la partida.
    return head ? texts.pending.waiting(nameOf(turn.seat)) : null;
  }
  if (head) return null;
  if (chosenDie.value) return texts.status.pickTarget(dieLabel(chosenDie.value));
  if (using.value) {
    return using.value.use === 'DOUBLE_SHIFT' ? null : texts.use[using.value.use];
  }
  if (turn.placementsLeft > 0) {
    return turn.placed === 0 ? texts.status.yourTurn : texts.status.placeMore(turn.placementsLeft);
  }
  return texts.status.afterPlace;
});

const canEndTurn = computed(() => free.value && (props.view.turn?.placed ?? 0) > 0);

// --- Fin de ronda --------------------------------------------------------------

const flamingoMost = computed(() => {
  const seat = mine.value;
  if (!seat) return 0;
  const count = seat.aboard.filter((bird) => bird.kind === 'FLAMINGO').length;
  return Math.min(count, seat.ingredients.FISH, seat.ingredients.SALT, seat.ingredients.ALGAE);
});
const choosingRoundEnd = computed(
  () =>
    props.canPlay &&
    props.view.phase === 'ROUND_END' &&
    props.view.roundChoices.includes(props.yourSeat),
);

// --- Asientos ------------------------------------------------------------------

const seatsView = computed(() =>
  Array.from(
    { length: props.view.playerCount },
    (_, step) => (props.yourSeat + step) % props.view.playerCount,
  ).map((seat) => ({
    seat,
    name: nameOf(seat),
    own: seat === props.yourSeat,
    turn: props.view.turn?.seat === seat,
    winner: props.view.winners.includes(seat),
    ...(props.view.seats[seat] as TidesView['seats'][number]),
  })),
);
</script>

<template>
  <div class="td-board" :class="{ locked: !canPlay, choosing }">
    <header class="td-head">
      <p class="td-round">
        {{ texts.round(view.round, texts.port[view.portSide]) }}
        <span class="muted">· {{ texts.islandsLeft(view.islandsLeft) }}</span>
      </p>
      <p v-if="waitingText" class="td-status" data-status>{{ waitingText }}</p>
      <ol v-if="steps.length > 0" class="td-steps" :aria-label="texts.steps.label">
        <li
          v-for="(step, index) in steps"
          :key="step.key"
          :class="{ done: step.done, current: step.current }"
          :data-step="step.key"
        >
          <span class="td-step-number" aria-hidden="true">{{ step.done ? '✓' : index + 1 }}</span>
          {{ step.text }}
        </li>
      </ol>
      <details class="td-guide" data-guide>
        <summary>{{ texts.guide.title }}</summary>
        <ol>
          <li v-for="(line, index) in texts.guide.lines" :key="index">{{ line }}</li>
        </ol>
      </details>
    </header>

    <!-- Lo que hay que decidir ahora -->
    <section v-if="pending" class="td-pending panel" data-pending>
      <template v-if="pending.kind === 'BOARD_BIRD'">
        <p>{{ texts.pending.BOARD_BIRD }}</p>
        <div class="td-card-row">
          <template v-for="pile in view.birdPiles" :key="pile.season">
            <BirdCard
              v-if="pile.count > 0"
              as="button"
              ready
              :kind="pile.top?.kind ?? null"
              :season="pile.season"
              :count="pile.count"
              :data-season="pile.season"
              @click="play({ type: 'RESOLVE', season: pile.season })"
            />
          </template>
        </div>
      </template>
      <template v-else-if="pending.kind === 'RELEASE_BIRD'">
        <p>{{ texts.pending.RELEASE_BIRD }}</p>
        <div class="td-card-row">
          <BirdCard
            v-for="bird in mine?.aboard ?? []"
            :key="bird.id"
            as="button"
            ready
            :kind="bird.kind"
            :season="bird.season"
            :aria-label="`${texts.actions.release} ${texts.birds[bird.kind]}`"
            :data-release="bird.id"
            @click="play({ type: 'RESOLVE', bird: bird.id })"
          />
        </div>
      </template>
      <template v-else-if="pending.kind === 'CHOOSE_INGREDIENTS'">
        <p>{{ texts.pending.CHOOSE_INGREDIENTS[pending.mode] }}</p>
        <div class="td-choices">
          <button
            v-for="choice in ingredientChoices"
            :key="choice.key"
            type="button"
            class="button"
            :data-ingredients="choice.key"
            @click="play({ type: 'RESOLVE', ingredients: choice.ingredients })"
          >
            {{ choice.label }}
          </button>
        </div>
      </template>
      <template v-else-if="pending.kind === 'EXCHANGE'">
        <p>{{ texts.pending.EXCHANGE(pending.upTo) }}</p>
        <form class="td-exchange" @submit.prevent="resolveExchange">
          <div v-for="(row, index) in exchange" :key="index" class="td-exchange-row">
            <label>
              {{ texts.pending.give }}
              <select v-model="row.give" :data-give="index">
                <option value="">{{ texts.none }}</option>
                <option v-for="one in INGREDIENTS" :key="one" :value="one">
                  {{ texts.ingredients[one] }}
                </option>
              </select>
            </label>
            <label>
              {{ texts.pending.take }}
              <select v-model="row.take" :data-take="index">
                <option value="">{{ texts.none }}</option>
                <option v-for="one in BASICS" :key="one" :value="one">
                  {{ texts.ingredients[one] }}
                </option>
              </select>
            </label>
          </div>
          <button type="submit" class="button" :disabled="!exchangeValid" data-exchange>
            {{ texts.actions.confirm }}
          </button>
        </form>
      </template>
      <template v-else-if="pending.kind === 'SHOAL'">
        <p>{{ texts.pending.SHOAL(pending.remaining) }}</p>
        <button
          type="button"
          class="button quiet"
          data-skip
          @click="play({ type: 'RESOLVE', skip: true })"
        >
          {{ texts.actions.skip }}
        </button>
      </template>
      <template v-else-if="pending.kind === 'MOVE_BOAT'">
        <p>{{ texts.pending.MOVE_BOAT }}</p>
      </template>
      <template v-else-if="pending.kind === 'PROMISE'">
        <p>{{ texts.pending.PROMISE }}</p>
        <div class="td-card-row">
          <OrderCard
            v-for="card in [view.revealed, ...view.market].filter((one) => one !== null)"
            :key="card.id"
            :card="card"
            ready
            :note="card.id === view.revealed?.id ? texts.pending.revealed : null"
          >
            <button
              type="button"
              class="button"
              :data-promise="card.id"
              @click="play({ type: 'RESOLVE', order: card.id })"
            >
              {{ texts.actions.promise }}
            </button>
          </OrderCard>
        </div>
        <div class="td-choices">
          <button
            v-if="pending.optional"
            type="button"
            class="button quiet"
            data-skip
            @click="play({ type: 'RESOLVE', skip: true })"
          >
            {{ texts.actions.skip }}
          </button>
        </div>
      </template>
    </section>

    <section v-if="choosingRoundEnd" class="td-pending panel" data-round-end>
      <h3>{{ texts.roundEnd.title }}</h3>
      <p>{{ texts.roundEnd.question(flamingoMost) }}</p>
      <div class="td-choices">
        <button
          v-for="count in flamingoMost + 1"
          :key="count"
          type="button"
          class="button"
          :class="{ quiet: count === 1 }"
          :data-flamingo="count - 1"
          @click="play({ type: 'ROUND_CHOICES', flamingo: count - 1 })"
        >
          {{ texts.roundEnd.times(count - 1) }}
        </button>
      </div>
    </section>

    <!-- En el móvil, los encargos y los jugadores van en pestañas (MA17) -->
    <div class="td-tabs" role="tablist" :aria-label="texts.tabs.label">
      <button
        v-for="one in TABS"
        :key="one"
        type="button"
        role="tab"
        class="td-tab"
        :aria-selected="tab === one"
        :data-tab="one"
        @click="tab = one"
      >
        {{ texts.tabs[one] }}
      </button>
    </div>

    <!-- Arriba: encargos y aves -->
    <div class="td-band" data-band>
      <!-- Mercado y aves de paso -->
      <section
        class="td-market panel"
        :class="{ 'td-tab-hidden': tab !== 'ORDERS' }"
        aria-labelledby="td-market-title"
      >
        <h3 id="td-market-title">
          {{ texts.market }} <span class="muted">· {{ texts.ordersLeft(view.ordersLeft) }}</span>
        </h3>
        <p class="muted td-help">{{ texts.marketHelp }}</p>
        <ul class="td-orders">
          <li v-for="(card, index) in view.market" :key="card?.id ?? `empty-${index}`">
            <OrderCard
              v-if="card"
              :card="card"
              :ready="canFulfil && !!mine && !!cheapest(mine.ingredients, card)"
              :note="payNote(card)"
            >
              <button
                v-if="canFulfil && mine && cheapest(mine.ingredients, card)"
                type="button"
                class="button"
                :data-fulfil="card.id"
                @click="fulfil(card)"
              >
                {{ texts.actions.fulfil }}
              </button>
            </OrderCard>
            <span v-else class="td-card td-card-empty muted">{{ texts.emptySlot }}</span>
          </li>
        </ul>
        <h4>{{ texts.birdPiles }}</h4>
        <p class="muted td-help">{{ texts.birdsHelp }}</p>
        <ul class="td-piles">
          <li v-for="pile in view.birdPiles" :key="pile.season">
            <BirdCard :kind="pile.top?.kind ?? null" :season="pile.season" :count="pile.count" />
          </li>
        </ul>
      </section>
    </div>

    <!-- Tus dados, justo encima del mar: se elige uno y después la casilla -->
    <section v-if="mine && !mine.retired" class="td-own panel" :class="`seat-${yourSeat}`">
      <h3>{{ texts.yourPool }}</h3>
      <div class="td-pool" role="group" :aria-label="texts.yourPool">
        <button
          v-for="die in mine.pool"
          :key="die.id"
          type="button"
          class="td-die big"
          :class="[
            `seat-${die.owner}`,
            die.kind === 'BOAT' ? 'boat' : 'weather',
            `face-${die.face.toLowerCase()}`,
            { selected: selectedDie === die.id || using?.picks.includes(die.id) },
          ]"
          :aria-pressed="selectedDie === die.id"
          :aria-label="dieLabel(die)"
          :disabled="!myTurn || pending !== null"
          :data-die="die.id"
          @click="selectDie(die.id)"
        >
          {{ texts.symbols[die.face] }}
        </button>
      </div>

      <div v-if="turnFaces.length > 0" class="td-choices" data-turn-faces>
        <button
          v-for="one in turnFaces"
          :key="one.face"
          type="button"
          class="button"
          :data-face="one.face"
          @click="turnTo(one.face)"
        >
          {{ one.label }}
        </button>
      </div>
      <div v-if="using?.use === 'REROLL'" class="td-choices" data-reroll>
        <button
          type="button"
          class="button"
          :disabled="using.picks.length === 0"
          @click="reroll(false)"
        >
          {{ texts.actions.confirm }}
        </button>
        <button type="button" class="button quiet" @click="reroll(true)">
          {{ texts.actions.rollAll }}
        </button>
      </div>

      <div class="td-own-actions">
        <button
          v-if="canEndTurn"
          type="button"
          class="button"
          data-end-turn
          @click="play({ type: 'END_TURN' })"
        >
          {{ texts.actions.endTurn }}
        </button>
        <button
          v-if="selectedDie || using || forceAt"
          type="button"
          class="button quiet"
          @click="reset"
        >
          {{ texts.actions.cancel }}
        </button>
      </div>

      <div
        v-if="mine.aboard.length > 0 || mine.promised.length > 0 || mine.hand.length > 0"
        class="td-own-cards"
      >
        <h4>{{ texts.cards.yours }}</h4>
        <p class="muted td-help">{{ texts.cards.yoursHelp }}</p>
        <div class="td-card-row">
          <template v-for="bird in mine.aboard" :key="bird.id">
            <BirdCard
              v-if="texts.birdSpaces[bird.kind]"
              as="button"
              :kind="bird.kind"
              :season="bird.season"
              :class="hintClass(birdHint(bird.kind, bird.die !== null))"
              :data-bird="bird.id"
              @click="onBird(bird.id, bird.die)"
            >
              <span class="td-bird-space">
                <span class="muted">{{
                  texts.cards.space[texts.birdSpaces[bird.kind] as 'BOAT' | 'WEATHER']
                }}</span>
                <span
                  v-if="bird.die"
                  class="td-die"
                  :class="[
                    `seat-${bird.die.owner}`,
                    bird.die.kind === 'BOAT' ? 'boat' : 'weather',
                    `face-${bird.die.face.toLowerCase()}`,
                  ]"
                  >{{ texts.symbols[bird.die.face] }}</span
                >
              </span>
            </BirdCard>
            <BirdCard v-else :kind="bird.kind" :season="bird.season" :data-bird="bird.id" />
          </template>
          <OrderCard
            v-for="card in mine.promised"
            :key="card.id"
            :card="card"
            :ready="canFulfil && !!cheapest(mine.ingredients, card)"
            :note="`${texts.cards.promised}. ${payNote(card)}`"
          >
            <button
              v-if="canFulfil && cheapest(mine.ingredients, card)"
              type="button"
              class="button"
              :data-fulfil="card.id"
              @click="fulfil(card)"
            >
              {{ texts.actions.fulfil }}
            </button>
          </OrderCard>
          <OrderCard
            v-for="card in mine.hand"
            :key="card.id"
            :card="card"
            :show-cost="false"
            :ready="canUse"
            :note="texts.cards.inHand"
          >
            <button
              v-if="canUse"
              type="button"
              class="button"
              :data-use="card.id"
              @click="startUse(card)"
            >
              {{ texts.actions.use }}
            </button>
          </OrderCard>
        </div>
      </div>

      <div v-if="nestOptions.some((one) => one.islands.length > 0)" class="td-nest">
        <template v-for="option in nestOptions" :key="option.bird.id">
          <p v-if="option.islands.length > 0">
            {{ texts.birds[option.bird.kind] }}:
            <button
              v-for="island in option.islands"
              :key="island.id"
              type="button"
              class="button quiet"
              :data-nest="`${option.bird.id}-${island.id}`"
              @click="play({ type: 'NEST', bird: option.bird.id, island: island.id })"
            >
              {{ texts.actions.nest }} {{ islandName(island.id) }}
            </button>
          </p>
        </template>
      </div>
    </section>

    <!-- El mar: las islas de la ronda y el puerto -->
    <section class="td-row td-sea" aria-labelledby="td-row-title">
      <h3 id="td-row-title">{{ texts.rowTitle }}</h3>
      <ul class="td-islands">
        <li
          v-for="island in rowView"
          :key="island.id"
          class="td-island"
          :class="[
            island.landClass,
            { 'two-seasons': island.twoSeasons, led: island.leader !== null },
            island.leader === null ? '' : `seat-${island.leader}`,
          ]"
          :data-island="island.index"
        >
          <h4>
            {{ island.name }}
            <span class="badge">{{ texts.islandPoints(island.points) }}</span>
          </h4>
          <p class="muted td-island-meta">
            {{ island.seasonsText }} · <span data-leader>{{ island.leaderText }}</span>
          </p>
          <div class="td-spaces">
            <button
              v-for="(spot, index) in island.spaces"
              :key="index"
              type="button"
              class="td-space"
              :class="[
                {
                  shoal: spot.shoal,
                  picked: spot.stack.some(
                    (die) => die.id === movePick || using?.picks.includes(die.id),
                  ),
                },
                hintClass(spaceHint(island.index, index)),
              ]"
              :aria-label="spaceLabel(island.id, index, spot)"
              :data-space="`${island.index}-${index}`"
              @click="onSpace(island.index, index)"
            >
              <span class="td-space-need" aria-hidden="true">
                <span class="td-figure">{{ texts.symbols[spot.figure] }}</span>
                {{ texts.faces[spot.figure] }}
              </span>
              <span class="td-space-reward" aria-hidden="true">
                → {{ texts.rewards[spot.reward] }}
              </span>
              <span v-if="spot.shoal" class="td-shoal">{{ texts.shoal }}</span>
              <span class="td-stack" aria-hidden="true">
                <span
                  v-for="die in spot.stack"
                  :key="die.id"
                  class="td-die"
                  :class="[
                    `seat-${die.owner}`,
                    die.kind === 'BOAT' ? 'boat' : 'weather',
                    `face-${die.face.toLowerCase()}`,
                  ]"
                >
                  {{ texts.symbols[die.face] }}
                </span>
              </span>
            </button>
          </div>
        </li>
      </ul>

      <!-- El puerto, en la orilla -->
      <section class="td-port" aria-labelledby="td-port-title">
        <h3 id="td-port-title">{{ texts.port.title }} · {{ texts.port[view.portSide] }}</h3>
        <div class="td-port-spaces">
          <button
            v-for="spot in portView"
            :key="spot.space"
            type="button"
            class="td-port-space"
            :class="[{ used: spot.used }, hintClass(portHint(spot.space, spot.used))]"
            :data-port="spot.space"
            @click="onPort(spot.space)"
          >
            <strong>{{ spot.name }}</strong>
            <span class="muted">{{ spot.effect }}</span>
            <span v-if="spot.used" class="visually-hidden">{{ texts.port.used }}</span>
            <span class="td-stack">
              <span
                v-for="die in spot.dice"
                :key="die.id"
                class="td-die"
                :class="[
                  `seat-${die.owner}`,
                  die.kind === 'BOAT' ? 'boat' : 'weather',
                  `face-${die.face.toLowerCase()}`,
                ]"
                :aria-label="dieLabel(die)"
                role="img"
              >
                {{ texts.symbols[die.face] }}
              </span>
            </span>
          </button>
        </div>
      </section>
    </section>

    <div v-if="forceAt" class="td-force panel" data-force>
      <p>{{ texts.actions.forceTitle }}</p>
      <button
        v-for="option in forceOptions"
        :key="option.ingredient"
        type="button"
        class="button"
        :disabled="option.disabled"
        :data-force-with="option.ingredient"
        @click="force(option.ingredient)"
      >
        {{ option.label }}
      </button>
      <button type="button" class="button quiet" @click="forceAt = null">
        {{ texts.actions.cancel }}
      </button>
    </div>

    <!-- Abajo: los jugadores -->
    <div class="td-band" data-band>
      <!-- Los asientos -->
      <ul class="td-seats" :class="{ 'td-tab-hidden': tab !== 'RIVALS' }">
        <li
          v-for="seat in seatsView"
          :key="seat.seat"
          class="td-seat panel"
          :class="[`seat-${seat.seat}`, { turn: seat.turn, retired: seat.retired }]"
          :data-seat="seat.seat"
        >
          <h3>
            {{ seat.name }}
            <span class="badge">{{ texts.score(seat.score.total) }}</span>
            <span v-if="seat.turn" class="badge on">{{ texts.turn }}</span>
            <span v-if="seat.retired" class="badge">{{ texts.retired }}</span>
            <span v-if="seat.winner" class="badge on">★</span>
          </h3>
          <p class="muted">{{ texts.scoreDetail(seat.score) }}</p>
          <p class="td-ingredients" :aria-label="texts.ingredientsTitle">
            <span v-for="one in INGREDIENTS" :key="one" :data-ingredient="`${seat.seat}-${one}`">
              {{ texts.ingredients[one] }} {{ seat.ingredients[one] }}
            </span>
          </p>
          <p v-if="!seat.own && seat.pool.length > 0" class="td-stack">
            <span class="muted">{{ texts.pool }}:</span>
            <span
              v-for="die in seat.pool"
              :key="die.id"
              class="td-die"
              :class="[
                `seat-${die.owner}`,
                die.kind === 'BOAT' ? 'boat' : 'weather',
                `face-${die.face.toLowerCase()}`,
              ]"
              :aria-label="dieLabel(die)"
              role="img"
            >
              {{ texts.symbols[die.face] }}
            </span>
          </p>
          <div
            v-if="!seat.own && seat.aboard.length + seat.promised.length + seat.hand.length > 0"
            class="td-card-row small"
          >
            <BirdCard
              v-for="bird in seat.aboard"
              :key="bird.id"
              :kind="bird.kind"
              :season="bird.season"
              :data-bird="bird.id"
            >
              <span v-if="bird.die" class="td-bird-space">
                <span
                  class="td-die"
                  :class="[
                    `seat-${bird.die.owner}`,
                    bird.die.kind === 'BOAT' ? 'boat' : 'weather',
                    `face-${bird.die.face.toLowerCase()}`,
                  ]"
                  >{{ texts.symbols[bird.die.face] }}</span
                >
              </span>
            </BirdCard>
            <OrderCard
              v-for="card in seat.promised"
              :key="card.id"
              :card="card"
              :note="texts.cards.promised"
            />
            <OrderCard
              v-for="card in seat.hand"
              :key="card.id"
              :card="card"
              :show-cost="false"
              :note="texts.cards.inHand"
            />
          </div>
          <p v-if="seat.free.length > 0 || seat.nests.length > 0" class="muted">
            {{ texts.free }}:
            {{ seat.free.map((bird) => texts.birds[bird.kind]).join(', ') || texts.none }} ·
            {{ texts.nests }}: {{ seat.nests.length }}
          </p>
          <p v-if="seat.used.length > 0" class="muted">
            {{ texts.used }}: {{ seat.used.map((card) => orderName(card.id)).join(', ') }}
          </p>
          <p v-if="seat.claimed.length > 0" class="muted">
            {{ texts.claimed }}:
            {{ seat.claimed.map((island) => islandName(island.id)).join(', ') }}
          </p>
        </li>
      </ul>
    </div>

    <p class="muted td-credit">{{ texts.credit }}</p>
  </div>
</template>
