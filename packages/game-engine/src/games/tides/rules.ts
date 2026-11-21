/**
 * Mareas: el estado y las reglas (ADR-023, MA5 a MA15; anexo del catálogo).
 *
 * Las funciones de este archivo trabajan sobre un borrador: el motor copia el
 * estado que recibe, aplica la jugada al borrador y devuelve el borrador. Así
 * el estado recibido nunca se modifica y las reglas se leen como en la mesa.
 */
import type { Seat } from '../../contract.js';
import { type RandomState, randomInt, shuffle } from '../../random.js';
import { BIRD_SPACES, BIRDS, ISLANDS, ORDERS, SEASONS } from './catalog.js';
import type {
  TidesBasic,
  TidesBirdCard,
  TidesBirdKind,
  TidesBoatFace,
  TidesEvent,
  TidesFace,
  TidesIngredient,
  TidesIslandCard,
  TidesOrderCard,
  TidesPending,
  TidesPhase,
  TidesPortSide,
  TidesPortSpace,
  TidesScoreView,
  TidesSeason,
  TidesTarget,
  TidesWeatherFace,
} from './types.js';

// --- Constantes ---------------------------------------------------------------

export const BOATS_PER_SEAT = 4;
export const WEATHER_PER_SEAT = 2;
export const MAX_ABOARD = 3;
export const MARKET_SIZE = 4;
export const BOAT_FACES: readonly TidesBoatFace[] = ['NET', 'ANCHOR', 'SAIL'];
export const WEATHER_FACES: readonly TidesWeatherFace[] = ['CALM', 'STORM', 'BREEZE'];
export const BASICS: readonly TidesBasic[] = ['FISH', 'SALT', 'ALGAE'];
export const INGREDIENTS: readonly TidesIngredient[] = ['FISH', 'SALT', 'ALGAE', 'PEARL'];
export const PORT_SPACES: readonly TidesPortSpace[] = ['ANY_1', 'ANY_2', 'CALM', 'STORM', 'BREEZE'];

/** Cuántas islas hay en la fila según los jugadores: 3, 4 o 5. */
export const rowSize = (playerCount: number) => playerCount + 1;

// --- Estado -------------------------------------------------------------------

/** Un ave a bordo y el dado de su casilla propia, si la tiene. */
export interface TidesAboard {
  readonly bird: string;
  die: string | null;
}

export interface TidesNest {
  readonly bird: string;
  readonly island: string;
}

export interface TidesSeatState {
  /** Los dados que quedan por colocar esta ronda. */
  pool: string[];
  /** Los dados apartados hasta la ronda siguiente. */
  aside: string[];
  ingredients: Record<TidesIngredient, number>;
  aboard: TidesAboard[];
  free: string[];
  nests: TidesNest[];
  hand: string[];
  used: string[];
  promised: string[];
  claimed: string[];
  tokens: number;
  retired: boolean;
}

export interface TidesSlot {
  readonly id: string;
  /** `stacks[casilla]`: los dados, de abajo arriba. */
  stacks: string[][];
  shoals: boolean[];
}

export interface TidesTurn {
  readonly seat: Seat;
  placementsLeft: number;
  placed: number;
  fulfilled: boolean;
  used: boolean;
}

/**
 * El estado del juego. Es un valor JSON plano, y es interno: la plataforma lo
 * guarda sin interpretarlo y los clientes solo reciben su vista.
 *
 * Los dados se llaman `<asiento>B<n>` (barcas) y `<asiento>W<n>` (clima).
 */
export interface TidesState {
  playerCount: number;
  random: RandomState;
  round: number;
  phase: TidesPhase;
  firstSeat: Seat;
  portSide: TidesPortSide;
  /** Los dados en cada casilla del puerto. */
  port: Record<TidesPortSpace, string[]>;
  /** Las casillas de clima del puerto ya usadas esta ronda. */
  portUsed: TidesPortSpace[];
  islandDeck: string[];
  row: TidesSlot[];
  orderDeck: string[];
  market: (string | null)[];
  /** `birdPiles[estación]`: la carta de arriba es la primera. */
  birdPiles: Record<TidesSeason, string[]>;
  faces: Record<string, TidesFace>;
  seats: TidesSeatState[];
  turn: TidesTurn | null;
  /** Las decisiones pendientes del asiento que tiene el turno, en orden (MA7). */
  pending: TidesPending[];
  /** En el fin de ronda, los asientos que aún tienen que elegir (MA8). */
  roundChoices: Seat[];
  /** Al terminar, la puntuación de cada asiento. */
  scores: TidesScoreView[] | null;
  winners: Seat[];
}

// --- Catálogo -----------------------------------------------------------------

const ISLAND_BY_ID = new Map(ISLANDS.map((card) => [card.id, card]));
const BIRD_BY_ID = new Map(BIRDS.map((card) => [card.id, card]));
const ORDER_BY_ID = new Map(ORDERS.map((card) => [card.id, card]));

export const islandCard = (id: string) => ISLAND_BY_ID.get(id) as TidesIslandCard;
export const birdCard = (id: string) => BIRD_BY_ID.get(id) as TidesBirdCard;
export const orderCard = (id: string) => ORDER_BY_ID.get(id) as TidesOrderCard;
export const isIslandId = (id: unknown) => typeof id === 'string' && ISLAND_BY_ID.has(id);
export const isBirdId = (id: unknown) => typeof id === 'string' && BIRD_BY_ID.has(id);
export const isOrderId = (id: unknown) => typeof id === 'string' && ORDER_BY_ID.has(id);

export const orderCost = (card: TidesOrderCard) =>
  card.cost.FISH + card.cost.SALT + card.cost.ALGAE;

// --- Dados --------------------------------------------------------------------

export const dieOwner = (id: string): Seat => Number.parseInt(id, 10);
export const dieKind = (id: string): 'BOAT' | 'WEATHER' => (id.includes('B') ? 'BOAT' : 'WEATHER');

export function diceOf(seat: Seat): string[] {
  return [
    ...Array.from({ length: BOATS_PER_SEAT }, (_, index) => `${seat}B${index}`),
    ...Array.from({ length: WEATHER_PER_SEAT }, (_, index) => `${seat}W${index}`),
  ];
}

export function isDieOf(playerCount: number, id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const match = /^(\d)([BW])(\d)$/.exec(id);
  if (!match) return false;
  const seat = Number(match[1]);
  const index = Number(match[3]);
  return seat < playerCount && index < (match[2] === 'B' ? BOATS_PER_SEAT : WEATHER_PER_SEAT);
}

export function facesFor(id: string): readonly TidesFace[] {
  return dieKind(id) === 'BOAT' ? BOAT_FACES : WEATHER_FACES;
}

/** Tira un dado: seis caras, dos de cada figura. */
function roll(draft: TidesState, id: string): void {
  const faces = facesFor(id);
  const rolled = randomInt(draft.random, faces.length * 2);
  draft.random = rolled.state;
  draft.faces[id] = faces[Math.floor(rolled.value / 2)] as TidesFace;
}

/** Dónde está un dado. */
export type TidesLocation =
  | { readonly where: 'POOL' }
  | { readonly where: 'ASIDE' }
  | {
      readonly where: 'ISLAND';
      readonly island: number;
      readonly space: number;
      readonly level: number;
    }
  | { readonly where: 'PORT'; readonly space: TidesPortSpace }
  | { readonly where: 'BIRD'; readonly bird: string };

export function locate(state: TidesState, id: string): TidesLocation | null {
  const seat = state.seats[dieOwner(id)];
  if (seat?.pool.includes(id)) return { where: 'POOL' };
  if (seat?.aside.includes(id)) return { where: 'ASIDE' };
  for (const [island, slot] of state.row.entries()) {
    for (const [space, stack] of slot.stacks.entries()) {
      const level = stack.indexOf(id);
      if (level >= 0) return { where: 'ISLAND', island, space, level };
    }
  }
  for (const space of PORT_SPACES) {
    if (state.port[space].includes(id)) return { where: 'PORT', space };
  }
  for (const one of state.seats) {
    const aboard = one.aboard.find((entry) => entry.die === id);
    if (aboard) return { where: 'BIRD', bird: aboard.bird };
  }
  return null;
}

/** Quita un dado del sitio del tablero en que esté (isla, puerto o ave). */
export function liftDie(draft: TidesState, id: string): void {
  for (const slot of draft.row) {
    for (const [space, stack] of slot.stacks.entries()) {
      if (stack.includes(id)) slot.stacks[space] = stack.filter((one) => one !== id);
    }
  }
  for (const space of PORT_SPACES)
    draft.port[space] = draft.port[space].filter((one) => one !== id);
  for (const seat of draft.seats) {
    for (const entry of seat.aboard) if (entry.die === id) entry.die = null;
  }
}

export const isPlaced = (state: TidesState, id: string) => {
  const where = locate(state, id)?.where;
  return where === 'ISLAND' || where === 'PORT' || where === 'BIRD';
};

/** Las barcas colocadas en islas, con su posición. */
export function boatsOnIslands(
  state: TidesState,
): { die: string; island: number; space: number }[] {
  const boats: { die: string; island: number; space: number }[] = [];
  for (const [island, slot] of state.row.entries()) {
    for (const [space, stack] of slot.stacks.entries()) {
      for (const die of stack) if (dieKind(die) === 'BOAT') boats.push({ die, island, space });
    }
  }
  return boats;
}

/** Las casillas de isla vacías y sin bajío. */
export function emptyIslandSpaces(state: TidesState): { island: number; space: number }[] {
  const spaces: { island: number; space: number }[] = [];
  for (const [island, slot] of state.row.entries()) {
    for (const [space, stack] of slot.stacks.entries()) {
      if (stack.length === 0 && !slot.shoals[space]) spaces.push({ island, space });
    }
  }
  return spaces;
}

export function placedDice(state: TidesState): string[] {
  const dice: string[] = [];
  for (const slot of state.row) for (const stack of slot.stacks) dice.push(...stack);
  for (const space of PORT_SPACES) dice.push(...state.port[space]);
  for (const seat of state.seats) {
    for (const entry of seat.aboard) if (entry.die) dice.push(entry.die);
  }
  return dice;
}

// --- Asientos -----------------------------------------------------------------

export const seatsOf = (playerCount: number): Seat[] =>
  Array.from({ length: playerCount }, (_, seat) => seat);

export const inPlay = (state: TidesState): Seat[] =>
  seatsOf(state.playerCount).filter((seat) => !state.seats[seat]?.retired);

export function seatOf(state: TidesState, seat: Seat): TidesSeatState {
  return state.seats[seat] as TidesSeatState;
}

/** Cuántas aves de un tipo tiene a bordo un asiento. */
export function aboardCount(state: TidesState, seat: Seat, kind: TidesBirdKind): number {
  return seatOf(state, seat).aboard.filter((entry) => birdCard(entry.bird).kind === kind).length;
}

export function gain(
  draft: TidesState,
  seat: Seat,
  ingredient: TidesIngredient,
  amount: number,
  events: TidesEvent[],
): void {
  if (amount <= 0) return;
  seatOf(draft, seat).ingredients[ingredient] += amount;
  events.push({ type: 'GATHERED', seat, ingredient, amount });
}

export function addPoints(
  draft: TidesState,
  seat: Seat,
  points: number,
  events: TidesEvent[],
): void {
  if (points <= 0) return;
  seatOf(draft, seat).tokens += points;
  events.push({ type: 'POINTS_GAINED', seat, points });
}

// --- Control de las islas (sección 1.7) ---------------------------------------

/**
 * Quién domina una isla: el asiento con más barcas arriba de las pilas que
 * cada uno de los demás y que los dados de clima arriba de las pilas. Un
 * empate en cualquiera de las dos cosas la deja sin dueño.
 */
export function leaderOf(slot: TidesSlot): Seat | null {
  const boats = new Map<Seat, number>();
  let weather = 0;
  for (const stack of slot.stacks) {
    const top = stack.at(-1);
    if (top === undefined) continue;
    if (dieKind(top) === 'WEATHER') weather += 1;
    else boats.set(dieOwner(top), (boats.get(dieOwner(top)) ?? 0) + 1);
  }
  let best: Seat | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [seat, count] of boats) {
    if (count > bestCount) {
      best = seat;
      bestCount = count;
      tied = false;
    } else if (count === bestCount) {
      tied = true;
    }
  }
  if (best === null || tied || bestCount <= weather) return null;
  return best;
}

// --- Encargos -----------------------------------------------------------------

/**
 * Saca la carta de arriba del mazo de encargos. Si se acaba, los usados
 * vuelven al mazo y su dueño se anota sus puntos (MA15).
 */
export function drawOrder(draft: TidesState, events: TidesEvent[]): string | null {
  if (draft.orderDeck.length === 0) {
    const returned: string[] = [];
    for (const [seat, one] of draft.seats.entries()) {
      for (const id of one.used) {
        addPoints(draft, seat, orderCard(id).points, events);
        returned.push(id);
      }
      one.used = [];
    }
    if (returned.length > 0) {
      const shuffled = shuffle(returned, draft.random);
      draft.random = shuffled.state;
      draft.orderDeck = shuffled.items;
      events.push({ type: 'ORDERS_RESHUFFLED' });
    }
  }
  return draft.orderDeck.shift() ?? null;
}

/** Cuánto paga un asiento por un encargo usando primero lo básico y después perlas. */
export function cheapestPayment(
  ingredients: Readonly<Record<TidesIngredient, number>>,
  card: TidesOrderCard,
): Record<TidesIngredient, number> | null {
  const payment: Record<TidesIngredient, number> = { FISH: 0, SALT: 0, ALGAE: 0, PEARL: 0 };
  for (const basic of BASICS) {
    payment[basic] = Math.min(ingredients[basic], card.cost[basic]);
    payment.PEARL += card.cost[basic] - payment[basic];
  }
  return payment.PEARL <= ingredients.PEARL ? payment : null;
}

// --- Decisiones pendientes ----------------------------------------------------

/** Si la decisión tiene alguna respuesta posible. Las que no, se descartan solas. */
export function pendingPossible(state: TidesState, seat: Seat, pending: TidesPending): boolean {
  switch (pending.kind) {
    case 'BOARD_BIRD':
      return SEASONS.some((season) => state.birdPiles[season].length > 0);
    case 'RELEASE_BIRD':
      return seatOf(state, seat).aboard.length > MAX_ABOARD;
    case 'CHOOSE_INGREDIENTS':
    case 'EXCHANGE':
      return true;
    case 'SHOAL':
      return emptyIslandSpaces(state).some(
        (one) => pending.island === null || one.island === pending.island,
      );
    case 'MOVE_BOAT':
      return boatsOnIslands(state).some(({ die, island, space }) =>
        emptyIslandSpaces(state).some(
          (target) =>
            (target.island !== island || target.space !== space) &&
            (!pending.sameFace || spaceFigure(state, target) === state.faces[die]),
        ),
      );
    case 'PROMISE':
      return pending.revealed !== null || state.market.some((one) => one !== null);
  }
}

export function spaceFigure(
  state: TidesState,
  at: { island: number; space: number },
): TidesBoatFace {
  const slot = state.row[at.island] as TidesSlot;
  return (islandCard(slot.id).spaces[at.space] as { figure: TidesBoatFace }).figure;
}

/** Descarta las decisiones que no tienen respuesta posible. */
export function settlePending(draft: TidesState): void {
  const seat = draft.turn?.seat;
  if (seat === undefined) {
    draft.pending = [];
    return;
  }
  while (draft.pending.length > 0) {
    const head = draft.pending[0] as TidesPending;
    if (pendingPossible(draft, seat, head)) return;
    if (head.kind === 'PROMISE' && head.revealed !== null) draft.orderDeck.unshift(head.revealed);
    draft.pending.shift();
  }
}

/** Una decisión de apalabrar: revela la carta de arriba del mazo. */
export function promisePending(
  draft: TidesState,
  remaining: number,
  optional: boolean,
  events: TidesEvent[],
): TidesPending {
  return { kind: 'PROMISE', remaining, revealed: drawOrder(draft, events), optional };
}

// --- Aves ---------------------------------------------------------------------

/** Sube a bordo la carta de arriba de un montón. Con cuatro, hay que soltar una. */
export function boardBird(
  draft: TidesState,
  seat: Seat,
  season: TidesSeason,
  events: TidesEvent[],
): boolean {
  const bird = draft.birdPiles[season].shift();
  if (bird === undefined) return false;
  const one = seatOf(draft, seat);
  one.aboard.push({ bird, die: null });
  events.push({ type: 'BIRD_BOARDED', seat, bird });
  if (one.aboard.length > MAX_ABOARD) draft.pending.unshift({ kind: 'RELEASE_BIRD' });
  return true;
}

/** Suelta un ave: pierde su poder y el dado de su casilla queda apartado. */
export function releaseBird(
  draft: TidesState,
  seat: Seat,
  bird: string,
  events: TidesEvent[],
  withPowers: boolean,
): void {
  const one = seatOf(draft, seat);
  const entry = one.aboard.find((aboard) => aboard.bird === bird);
  if (!entry) return;
  one.aboard = one.aboard.filter((aboard) => aboard.bird !== bird);
  if (entry.die) seatOf(draft, dieOwner(entry.die)).aside.push(entry.die);
  one.free.push(bird);
  events.push({ type: 'BIRD_RELEASED', seat, bird });
  // Cuervo marino: un punto por cada ave que se suelta, mientras está a bordo.
  if (withPowers) addPoints(draft, seat, aboardCount(draft, seat, 'SHAG'), events);
}

export function birdSpaceKind(bird: string): 'BOAT' | 'WEATHER' | undefined {
  return BIRD_SPACES[birdCard(bird).kind];
}

// --- Rondas -------------------------------------------------------------------

/** El siguiente asiento en juego después de `seat`, con dados por colocar. */
function nextWithDice(state: TidesState, after: Seat, includeSelf: boolean): Seat | null {
  for (let step = includeSelf ? 0 : 1; step <= state.playerCount; step += 1) {
    const seat = (after + step) % state.playerCount;
    const one = seatOf(state, seat);
    if (!one.retired && one.pool.length > 0) return seat;
  }
  return null;
}

export function startTurn(draft: TidesState, seat: Seat): void {
  draft.turn = { seat, placementsLeft: 1, placed: 0, fulfilled: false, used: false };
  draft.pending = [];
}

/** Pasa el turno al siguiente con dados o, si nadie tiene, termina la ronda. */
export function advanceTurn(draft: TidesState, from: Seat, events: TidesEvent[]): void {
  const next = nextWithDice(draft, from, false);
  if (next === null) {
    endRound(draft, events);
    return;
  }
  startTurn(draft, next);
}

export function endTurn(draft: TidesState, events: TidesEvent[]): void {
  const seat = draft.turn?.seat as Seat;
  events.push({ type: 'TURN_ENDED', seat });
  advanceTurn(draft, seat, events);
}

/** Fin de ronda (sección 1.10): reclamar, Alca, Flamenco y, después, la ronda siguiente o el final. */
export function endRound(draft: TidesState, events: TidesEvent[]): void {
  draft.turn = null;
  draft.pending = [];
  const claimedNow = new Map<Seat, number>();
  for (const slot of draft.row) {
    const leader = leaderOf(slot);
    if (leader !== null && !seatOf(draft, leader).retired) {
      seatOf(draft, leader).claimed.push(slot.id);
      claimedNow.set(leader, (claimedNow.get(leader) ?? 0) + 1);
      events.push({ type: 'ISLAND_CLAIMED', seat: leader, island: slot.id });
    } else {
      events.push({ type: 'ISLAND_DISCARDED', island: slot.id });
    }
  }
  // Las islas salen de la fila; sus dados vuelven al empezar la ronda siguiente (B6).
  const onIslands = draft.row.flatMap((slot) => slot.stacks.flat());
  for (const die of onIslands) seatOf(draft, dieOwner(die)).aside.push(die);
  draft.row = [];
  // Alca: un punto por cada isla reclamada esta ronda.
  for (const seat of inPlay(draft)) {
    addPoints(draft, seat, aboardCount(draft, seat, 'AUK') * (claimedNow.get(seat) ?? 0), events);
  }
  draft.roundChoices = inPlay(draft).filter(
    (seat) => aboardCount(draft, seat, 'FLAMINGO') > 0 && flamingoAffordable(draft, seat) > 0,
  );
  if (draft.roundChoices.length > 0) {
    draft.phase = 'ROUND_END';
    return;
  }
  finishRound(draft, events);
}

/** Cuántas veces puede pagar el Flamenco: 1 pescado, 1 sal y 1 algas, sin perlas. */
export function flamingoAffordable(state: TidesState, seat: Seat): number {
  const { ingredients } = seatOf(state, seat);
  return Math.min(
    aboardCount(state, seat, 'FLAMINGO'),
    ingredients.FISH,
    ingredients.SALT,
    ingredients.ALGAE,
  );
}

/** Tras las elecciones: la ronda siguiente o, si el mazo no da para una fila, el final (B1). */
export function finishRound(draft: TidesState, events: TidesEvent[]): void {
  draft.roundChoices = [];
  if (draft.islandDeck.length < rowSize(draft.playerCount)) {
    finishGame(draft, events);
    return;
  }
  startRound(draft, draft.round + 1, nextFirst(draft), events);
}

function nextFirst(state: TidesState): Seat {
  for (let step = 1; step <= state.playerCount; step += 1) {
    const seat = (state.firstSeat + step) % state.playerCount;
    if (!seatOf(state, seat).retired) return seat;
  }
  return state.firstSeat;
}

/** Empieza una ronda: dados de vuelta, puerto volteado, fila nueva y tirada de todos. */
export function startRound(
  draft: TidesState,
  round: number,
  firstSeat: Seat,
  events: TidesEvent[],
): void {
  draft.round = round;
  draft.phase = 'TURNS';
  draft.firstSeat = firstSeat;
  draft.portSide = round % 2 === 1 ? 'HIGH' : 'LOW';
  for (const space of PORT_SPACES) draft.port[space] = [];
  draft.portUsed = [];
  for (const seat of draft.seats) for (const entry of seat.aboard) entry.die = null;
  draft.row = draft.islandDeck.splice(0, rowSize(draft.playerCount)).map((id) => {
    const count = islandCard(id).spaces.length;
    return {
      id,
      stacks: Array.from({ length: count }, () => []),
      shoals: Array.from({ length: count }, () => false),
    };
  });
  events.push({ type: 'ROUND_STARTED', round, firstSeat });
  for (const [seat, one] of draft.seats.entries()) {
    // Los dados de quien se retiró quedan apartados: ya no juega.
    one.aside = one.retired ? diceOf(seat) : [];
    one.pool = one.retired ? [] : diceOf(seat);
    for (const die of one.pool) roll(draft, die);
    if (!one.retired) {
      events.push({ type: 'DICE_ROLLED', seat, dice: one.pool.map((die) => dieView(draft, die)) });
    }
  }
  const first = nextWithDice(draft, firstSeat, true);
  if (first === null) {
    finishGame(draft, events);
    return;
  }
  startTurn(draft, first);
}

/** Vuelve a tirar dados de la reserva propia. */
export function reroll(draft: TidesState, dice: readonly string[]): void {
  for (const die of dice) roll(draft, die);
}

// --- Puntuación (sección 1.11) ------------------------------------------------

/**
 * El emparejamiento que deja anidar más aves en las islas reclamadas de su
 * estación (MA9). Es un emparejamiento bipartito pequeño.
 */
export function bestNests(birds: readonly string[], islands: readonly string[]): TidesNest[] {
  const matchOfIsland = new Map<string, string>();
  const fits = (bird: string, island: string) =>
    islandCard(island).seasons.includes(birdCard(bird).season);
  const tryBird = (bird: string, seen: Set<string>): boolean => {
    for (const island of islands) {
      if (!fits(bird, island) || seen.has(island)) continue;
      seen.add(island);
      const current = matchOfIsland.get(island);
      if (current === undefined || tryBird(current, seen)) {
        matchOfIsland.set(island, bird);
        return true;
      }
    }
    return false;
  };
  for (const bird of birds) tryBird(bird, new Set());
  return [...matchOfIsland].map(([island, bird]) => ({ bird, island }));
}

export function leftoverCount(one: TidesSeatState): number {
  return INGREDIENTS.reduce((sum, ingredient) => sum + one.ingredients[ingredient], 0);
}

export function scoreOf(one: TidesSeatState): TidesScoreView {
  const islands = one.claimed.reduce((sum, id) => sum + islandCard(id).points, 0);
  const orders = [...one.hand, ...one.used].reduce((sum, id) => sum + orderCard(id).points, 0);
  const birds = one.nests.length * 3 + one.free.length + one.aboard.length;
  // B3: un punto por cada grupo completo de 3 sobrantes.
  const leftovers = Math.floor(leftoverCount(one) / 3);
  return {
    islands,
    orders,
    birds,
    tokens: one.tokens,
    leftovers,
    total: islands + orders + birds + one.tokens + leftovers,
  };
}

/** Quienes ganan entre los asientos en juego: más puntos y, si empatan, más sobrantes (MA14). */
export function winnersOf(state: TidesState, scores: readonly TidesScoreView[]): Seat[] {
  const playing = inPlay(state);
  const key = (seat: Seat) => [
    (scores[seat] as TidesScoreView).total,
    leftoverCount(seatOf(state, seat)),
  ];
  let best: number[] | null = null;
  let winners: Seat[] = [];
  for (const seat of playing) {
    const mine = key(seat);
    const cmp =
      best === null
        ? 1
        : (mine[0] as number) - (best[0] as number) || (mine[1] as number) - (best[1] as number);
    if (cmp > 0) {
      best = mine;
      winners = [seat];
    } else if (cmp === 0) {
      winners.push(seat);
    }
  }
  return winners;
}

/** El final: se sueltan las aves, anidan las que puedan y se cuenta. */
export function finishGame(draft: TidesState, events: TidesEvent[]): void {
  draft.phase = 'FINISHED';
  draft.turn = null;
  draft.pending = [];
  draft.roundChoices = [];
  for (const [seat, one] of draft.seats.entries()) {
    if (!one.retired) {
      for (const entry of [...one.aboard]) releaseBird(draft, seat, entry.bird, events, false);
    }
    const nested = new Set(one.nests.map((nest) => nest.island));
    const extra = bestNests(
      one.free,
      one.claimed.filter((island) => !nested.has(island)),
    );
    for (const nest of extra) {
      one.nests.push(nest);
      one.free = one.free.filter((bird) => bird !== nest.bird);
      events.push({ type: 'BIRD_NESTED', seat, bird: nest.bird, island: nest.island });
    }
  }
  const scores = draft.seats.map(scoreOf);
  draft.scores = scores;
  draft.winners = winnersOf(draft, scores);
  events.push({ type: 'GAME_SCORED', scores, winners: [...draft.winners] });
}

/** La partida termina antes por retiradas: gana el único que queda. */
export function finishByRetirement(draft: TidesState): void {
  draft.phase = 'FINISHED';
  draft.turn = null;
  draft.pending = [];
  draft.roundChoices = [];
  draft.scores = draft.seats.map(scoreOf);
  draft.winners = inPlay(draft);
}

// --- Vistas de piezas ---------------------------------------------------------

export function dieView(state: TidesState, id: string) {
  return {
    id,
    owner: dieOwner(id),
    kind: dieKind(id),
    face: state.faces[id] as TidesFace,
  };
}

export function targetOf(location: TidesLocation): TidesTarget | null {
  if (location.where === 'ISLAND') {
    return { kind: 'ISLAND', island: location.island, space: location.space };
  }
  if (location.where === 'PORT') return { kind: 'PORT', space: location.space };
  if (location.where === 'BIRD') return { kind: 'BIRD', bird: location.bird };
  return null;
}

export const emptyIngredients = (): Record<TidesIngredient, number> => ({
  FISH: 0,
  SALT: 0,
  ALGAE: 0,
  PEARL: 0,
});
