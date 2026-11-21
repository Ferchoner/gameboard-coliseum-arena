/**
 * Mareas: las jugadas (ADR-023, MA6 a MA9). Cada función recibe un borrador
 * ya copiado y lo modifica; devuelve el motivo si la jugada no vale, antes de
 * tocar nada.
 */
import type { Seat } from '../../contract.js';
import { SEASONS } from './catalog.js';
import {
  addPoints,
  BASICS,
  birdCard,
  birdSpaceKind,
  boardBird,
  boatsOnIslands,
  dieKind,
  dieOwner,
  dieView,
  emptyIslandSpaces,
  endTurn,
  facesFor,
  finishRound,
  flamingoAffordable,
  gain,
  INGREDIENTS,
  islandCard,
  isPlaced,
  liftDie,
  locate,
  orderCard,
  orderCost,
  placedDice,
  promisePending,
  releaseBird,
  reroll,
  aboardCount,
  cheapestPayment,
  drawOrder,
  seatOf,
  settlePending,
  spaceFigure,
  type TidesSlot,
  type TidesState,
} from './rules.js';
import type {
  TidesAction,
  TidesBasic,
  TidesEvent,
  TidesFace,
  TidesIngredient,
  TidesPortSpace,
  TidesRejectionReason,
  TidesSeason,
  TidesTarget,
} from './types.js';

export type Outcome =
  { ok: true; action: TidesAction } | { ok: false; reason: TidesRejectionReason };

const reject = (reason: TidesRejectionReason): Outcome => ({ ok: false, reason });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isInt = (value: unknown): value is number => Number.isInteger(value);
const isBasic = (value: unknown): value is TidesBasic => BASICS.includes(value as TidesBasic);
const isIngredient = (value: unknown): value is TidesIngredient =>
  INGREDIENTS.includes(value as TidesIngredient);
const isSeason = (value: unknown): value is TidesSeason => SEASONS.includes(value as TidesSeason);

function parseSpot(value: unknown): { island: number; space: number } | null {
  if (!isRecord(value) || !isInt(value.island) || !isInt(value.space)) return null;
  return { island: value.island, space: value.space };
}

function slotAt(state: TidesState, island: number): TidesSlot | undefined {
  return state.row[island];
}

/** Una casilla de isla vacía y sin bajío. */
function isOpen(state: TidesState, at: { island: number; space: number }): boolean {
  const slot = slotAt(state, at.island);
  const stack = slot?.stacks[at.space];
  return stack !== undefined && stack.length === 0 && slot?.shoals[at.space] === false;
}

// --- Colocar ------------------------------------------------------------------

function parseTarget(value: unknown): TidesTarget | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'ISLAND' && isInt(value.island) && isInt(value.space)) {
    return { kind: 'ISLAND', island: value.island, space: value.space };
  }
  if (value.kind === 'PORT' && typeof value.space === 'string') {
    if (!['ANY_1', 'ANY_2', 'CALM', 'STORM', 'BREEZE'].includes(value.space)) return null;
    return { kind: 'PORT', space: value.space as TidesPortSpace };
  }
  if (value.kind === 'BIRD' && typeof value.bird === 'string') {
    return { kind: 'BIRD', bird: value.bird };
  }
  return null;
}

/** Recoger en una casilla de isla, con los poderes que tocan (calma, Pelícano). */
function gatherIsland(
  draft: TidesState,
  seat: Seat,
  reward: TidesBasic,
  face: TidesFace,
  events: TidesEvent[],
): void {
  let amount = 1;
  if (face === 'CALM') amount += 2 + aboardCount(draft, seat, 'PELICAN');
  gain(draft, seat, reward, amount, events);
}

function placeOnIsland(
  draft: TidesState,
  seat: Seat,
  die: string,
  target: { island: number; space: number },
  force: TidesIngredient | undefined,
  events: TidesEvent[],
): TidesRejectionReason | { forced: boolean } {
  const slot = slotAt(draft, target.island);
  const card = slot ? islandCard(slot.id).spaces[target.space] : undefined;
  const stack = slot?.stacks[target.space];
  if (!slot || !card || !stack) return 'BAD_TARGET';
  if (slot.shoals[target.space]) return 'SPACE_SHOALED';
  const face = draft.faces[die] as TidesFace;
  const one = seatOf(draft, seat);
  let forced = false;

  if (dieKind(die) === 'BOAT') {
    if (stack.length > 0) return 'SPACE_OCCUPIED';
    if (face !== card.figure) {
      if (force === undefined) return 'FACE_MISMATCH';
      const allowed = card.reward === 'BIRD' ? ['PEARL'] : [card.reward, 'PEARL'];
      if (!allowed.includes(force)) return 'CANNOT_FORCE';
      if (one.ingredients[force] < 1) return 'CANNOT_AFFORD';
      one.ingredients[force] -= 1;
      forced = true;
    } else if (force !== undefined) {
      return 'CANNOT_FORCE';
    }
  } else {
    if (force !== undefined) return 'CANNOT_FORCE';
    const top = stack.at(-1);
    if (top !== undefined) {
      const breezeOnOwn = face === 'BREEZE' && dieKind(top) === 'BOAT' && dieOwner(top) === seat;
      if (face !== 'STORM' && !breezeOnOwn) return 'SPACE_OCCUPIED';
      if (breezeOnOwn) {
        // Brisa: la barca propia vuelve a la reserva (un turno más).
        stack.pop();
        one.pool.push(top);
        events.push({ type: 'DIE_RETURNED', die: top });
      }
    }
  }

  one.pool = one.pool.filter((one) => one !== die);
  stack.push(die);
  events.push({
    type: 'DIE_PLACED',
    seat,
    die: dieView(draft, die),
    target: { kind: 'ISLAND', ...target },
    forced,
  });
  if (!forced) {
    if (card.reward === 'BIRD') draft.pending.push({ kind: 'BOARD_BIRD' });
    else gatherIsland(draft, seat, card.reward, face, events);
  }
  // Albatros: un bajío opcional en otra casilla vacía de esa isla, por cada uno.
  if (dieKind(die) === 'WEATHER') {
    const albatross = aboardCount(draft, seat, 'ALBATROSS');
    if (albatross > 0)
      draft.pending.push({ kind: 'SHOAL', remaining: albatross, island: target.island });
  }
  return { forced };
}

function placeInPort(
  draft: TidesState,
  seat: Seat,
  die: string,
  space: TidesPortSpace,
  events: TidesEvent[],
): TidesRejectionReason | null {
  const face = draft.faces[die] as TidesFace;
  if (space !== 'ANY_1' && space !== 'ANY_2') {
    if (dieKind(die) !== 'WEATHER' || face !== space) return 'FACE_MISMATCH';
    if (draft.portUsed.includes(space)) return 'PORT_SPACE_USED';
    draft.portUsed.push(space);
  }
  const one = seatOf(draft, seat);
  one.pool = one.pool.filter((other) => other !== die);
  draft.port[space].push(die);
  events.push({
    type: 'DIE_PLACED',
    seat,
    die: dieView(draft, die),
    target: { kind: 'PORT', space },
    forced: false,
  });

  // Los efectos del puerto (anexo, sección 3). El clima no tiene poderes aquí.
  const high = draft.portSide === 'HIGH';
  switch (space) {
    case 'ANY_1':
      draft.pending.push({ kind: 'CHOOSE_INGREDIENTS', mode: high ? 'ONE' : 'TWO_SAME' });
      break;
    case 'ANY_2':
      draft.pending.push(high ? { kind: 'BOARD_BIRD' } : { kind: 'EXCHANGE', upTo: 2 });
      break;
    case 'CALM':
      if (high) {
        gain(draft, seat, 'FISH', 1, events);
        gain(draft, seat, 'ALGAE', 1, events);
      } else {
        draft.pending.push({ kind: 'BOARD_BIRD' }, { kind: 'CHOOSE_INGREDIENTS', mode: 'ONE' });
      }
      break;
    case 'STORM':
      if (high) {
        // Aparta todos los dados de clima de las islas hasta la ronda siguiente (D1).
        for (const slot of draft.row) {
          for (const [index, stack] of slot.stacks.entries()) {
            const weather = stack.filter((one) => dieKind(one) === 'WEATHER');
            slot.stacks[index] = stack.filter((one) => dieKind(one) !== 'WEATHER');
            for (const one of weather) {
              seatOf(draft, dieOwner(one)).aside.push(one);
              events.push({ type: 'DIE_SET_ASIDE', die: one });
            }
          }
        }
      } else {
        draft.pending.push({ kind: 'SHOAL', remaining: 2, island: null });
      }
      break;
    case 'BREEZE':
      if (high) {
        gain(draft, seat, 'SALT', 1, events);
        draft.pending.push(promisePending(draft, 1, false, events));
      } else {
        draft.pending.push(promisePending(draft, 2, false, events));
      }
      break;
  }
  // Charrán: una sal más al colocar en el puerto.
  gain(draft, seat, 'SALT', aboardCount(draft, seat, 'TERN'), events);
  return null;
}

function placeOnBird(
  draft: TidesState,
  seat: Seat,
  die: string,
  bird: string,
  events: TidesEvent[],
): TidesRejectionReason | null {
  const one = seatOf(draft, seat);
  const entry = one.aboard.find((aboard) => aboard.bird === bird);
  if (!entry) return 'NOT_YOUR_BIRD';
  const kind = birdSpaceKind(bird);
  if (kind === undefined) return 'BAD_TARGET';
  if (entry.die !== null) return 'SPACE_OCCUPIED';
  if (dieKind(die) !== kind) return 'FACE_MISMATCH';
  one.pool = one.pool.filter((other) => other !== die);
  entry.die = die;
  events.push({
    type: 'DIE_PLACED',
    seat,
    die: dieView(draft, die),
    target: { kind: 'BIRD', bird },
    forced: false,
  });
  switch (birdCard(bird).kind) {
    case 'SKUA':
      draft.pending.push({ kind: 'MOVE_BOAT', sameFace: true });
      break;
    case 'CORMORANT':
      gain(draft, seat, 'PEARL', 1, events);
      break;
    case 'HERON':
      draft.pending.push({ kind: 'CHOOSE_INGREDIENTS', mode: 'TWO_DISTINCT' });
      break;
    case 'PETREL':
      draft.pending.push(promisePending(draft, 1, false, events));
      break;
    default:
      break;
  }
  return null;
}

export function place(
  draft: TidesState,
  seat: Seat,
  input: Record<string, unknown>,
  events: TidesEvent[],
): Outcome {
  const { die, force } = input;
  const target = parseTarget(input.target);
  if (typeof die !== 'string' || !target) return reject('MALFORMED_ACTION');
  if (force !== undefined && !isIngredient(force)) return reject('MALFORMED_ACTION');
  const turn = draft.turn;
  if (!turn) return reject('WRONG_PHASE');
  if (draft.pending.length > 0) return reject('PENDING_DECISION');
  const one = seatOf(draft, seat);
  if (turn.placementsLeft < 1) return reject('ALREADY_PLACED');
  if (!one.pool.includes(die)) return reject('DIE_NOT_IN_POOL');
  if (target.kind !== 'ISLAND' && force !== undefined) return reject('CANNOT_FORCE');
  const face = draft.faces[die] as TidesFace;

  let forced = false;
  if (target.kind === 'ISLAND') {
    const placed = placeOnIsland(draft, seat, die, target, force, events);
    if (typeof placed === 'string') return reject(placed);
    forced = placed.forced;
  } else if (target.kind === 'PORT') {
    const problem = placeInPort(draft, seat, die, target.space, events);
    if (problem) return reject(problem);
  } else {
    const problem = placeOnBird(draft, seat, die, target.bird, events);
    if (problem) return reject(problem);
  }
  // Frailecillo: un pescado más al colocar una barca con la cara de red.
  if (dieKind(die) === 'BOAT' && face === 'NET') {
    gain(draft, seat, 'FISH', aboardCount(draft, seat, 'PUFFIN'), events);
  }
  turn.placementsLeft -= 1;
  turn.placed += 1;
  const action: TidesAction =
    force !== undefined && forced
      ? { type: 'PLACE', die, target, force }
      : { type: 'PLACE', die, target };
  return { ok: true, action };
}

// --- Cumplir ------------------------------------------------------------------

export function fulfil(
  draft: TidesState,
  seat: Seat,
  input: Record<string, unknown>,
  events: TidesEvent[],
): Outcome {
  const { order, payment } = input;
  if (typeof order !== 'string' || !isRecord(payment)) return reject('MALFORMED_ACTION');
  const paid: Record<TidesIngredient, number> = { FISH: 0, SALT: 0, ALGAE: 0, PEARL: 0 };
  for (const ingredient of INGREDIENTS) {
    const amount = payment[ingredient] ?? 0;
    if (!isInt(amount) || amount < 0) return reject('BAD_PAYMENT');
    paid[ingredient] = amount;
  }
  const turn = draft.turn;
  if (!turn) return reject('WRONG_PHASE');
  if (draft.pending.length > 0) return reject('PENDING_DECISION');
  if (turn.fulfilled) return reject('ALREADY_FULFILLED');
  const one = seatOf(draft, seat);
  const slot = draft.market.indexOf(order);
  const promised = one.promised.includes(order);
  if (slot < 0 && !promised) return reject('ORDER_NOT_AVAILABLE');
  const card = orderCard(order);
  // El pago cubre el coste justo: lo básico, hasta su coste; las perlas, el resto.
  const basics = BASICS.reduce((sum, basic) => sum + paid[basic], 0);
  if (BASICS.some((basic) => paid[basic] > card.cost[basic])) return reject('BAD_PAYMENT');
  if (basics + paid.PEARL !== orderCost(card)) return reject('BAD_PAYMENT');
  if (INGREDIENTS.some((ingredient) => one.ingredients[ingredient] < paid[ingredient])) {
    return reject('CANNOT_AFFORD');
  }
  for (const ingredient of INGREDIENTS) one.ingredients[ingredient] -= paid[ingredient];
  one.hand.push(order);
  if (promised) {
    // Un apalabrado no deja hueco en el mercado (B4).
    one.promised = one.promised.filter((other) => other !== order);
  } else {
    draft.market[slot] = drawOrder(draft, events);
  }
  events.push({ type: 'ORDER_FULFILLED', seat, order });
  // Gaviota: 2 puntos al cumplir un encargo de 4 o más ingredientes.
  if (orderCost(card) >= 4) addPoints(draft, seat, 2 * aboardCount(draft, seat, 'GULL'), events);
  turn.fulfilled = true;
  return { ok: true, action: { type: 'FULFIL', order, payment: paid } };
}

// --- Usar ---------------------------------------------------------------------

/** Mueve una barca de una isla a otra casilla vacía (Págalo y remolcar). No recoge. */
function moveBoat(
  draft: TidesState,
  die: unknown,
  to: { island: number; space: number } | null,
  sameFace: boolean,
  events: TidesEvent[],
): TidesRejectionReason | null {
  if (typeof die !== 'string' || !to) return 'MALFORMED_ACTION';
  const from = locate(draft, die);
  if (dieKind(die) !== 'BOAT' || from?.where !== 'ISLAND') return 'BAD_TARGET';
  if (!isOpen(draft, to)) return 'BAD_TARGET';
  if (sameFace && spaceFigure(draft, to) !== draft.faces[die]) return 'FACE_MISMATCH';
  liftDie(draft, die);
  (draft.row[to.island] as TidesSlot).stacks[to.space]?.push(die);
  events.push({ type: 'DIE_MOVED', die, to: { kind: 'ISLAND', ...to } });
  return null;
}

export function useOrder(
  draft: TidesState,
  seat: Seat,
  input: Record<string, unknown>,
  events: TidesEvent[],
): Outcome {
  const { order } = input;
  if (typeof order !== 'string') return reject('MALFORMED_ACTION');
  const turn = draft.turn;
  if (!turn) return reject('WRONG_PHASE');
  if (draft.pending.length > 0) return reject('PENDING_DECISION');
  if (turn.used) return reject('ALREADY_USED');
  const one = seatOf(draft, seat);
  if (!one.hand.includes(order)) return reject('ORDER_NOT_AVAILABLE');
  const card = orderCard(order);
  let action: TidesAction;

  switch (card.use) {
    case 'TURN_DIE': {
      const { die, face } = input;
      if (typeof die !== 'string' || typeof face !== 'string') return reject('MALFORMED_ACTION');
      if (!one.pool.includes(die)) return reject('DIE_NOT_IN_POOL');
      if (!facesFor(die).includes(face as TidesFace)) return reject('BAD_CHOICE');
      draft.faces[die] = face as TidesFace;
      action = { type: 'USE', order, die, face: face as TidesFace };
      break;
    }
    case 'REROLL': {
      const { dice } = input;
      if (!Array.isArray(dice) || dice.length === 0) return reject('MALFORMED_ACTION');
      const list = dice as unknown[];
      if (new Set(list).size !== list.length) return reject('BAD_CHOICE');
      if (!list.every((die) => typeof die === 'string' && one.pool.includes(die))) {
        return reject('DIE_NOT_IN_POOL');
      }
      reroll(draft, list as string[]);
      events.push({
        type: 'DICE_ROLLED',
        seat,
        dice: (list as string[]).map((die) => dieView(draft, die)),
      });
      action = { type: 'USE', order, dice: [...(list as string[])] };
      break;
    }
    case 'DOUBLE_SHIFT': {
      if (one.pool.length <= turn.placementsLeft) return reject('DIE_NOT_IN_POOL');
      turn.placementsLeft += 1;
      action = { type: 'USE', order };
      break;
    }
    case 'TOW': {
      const to = parseSpot(input.to);
      const problem = moveBoat(draft, input.die, to, false, events);
      if (problem) return reject(problem);
      action = {
        type: 'USE',
        order,
        die: input.die as string,
        to: to as { island: number; space: number },
      };
      break;
    }
    case 'CROSS': {
      const { dice } = input;
      if (!Array.isArray(dice) || dice.length !== 2) return reject('MALFORMED_ACTION');
      const [a, b] = dice as unknown[];
      if (typeof a !== 'string' || typeof b !== 'string' || a === b)
        return reject('MALFORMED_ACTION');
      const where = [locate(draft, a), locate(draft, b)];
      if (
        where.some((one) => one?.where !== 'ISLAND') ||
        dieKind(a) !== 'BOAT' ||
        dieKind(b) !== 'BOAT'
      ) {
        return reject('BAD_TARGET');
      }
      if (draft.faces[a] !== draft.faces[b]) return reject('FACE_MISMATCH');
      const [la, lb] = where as [
        { where: 'ISLAND'; island: number; space: number; level: number },
        { where: 'ISLAND'; island: number; space: number; level: number },
      ];
      const stackA = (draft.row[la.island] as TidesSlot).stacks[la.space] as string[];
      const stackB = (draft.row[lb.island] as TidesSlot).stacks[lb.space] as string[];
      stackA[la.level] = b;
      stackB[lb.level] = a;
      events.push({
        type: 'DIE_MOVED',
        die: a,
        to: { kind: 'ISLAND', island: lb.island, space: lb.space },
      });
      events.push({
        type: 'DIE_MOVED',
        die: b,
        to: { kind: 'ISLAND', island: la.island, space: la.space },
      });
      action = { type: 'USE', order, dice: [a, b] };
      break;
    }
    case 'MOOR': {
      const { die } = input;
      if (typeof die !== 'string') return reject('MALFORMED_ACTION');
      if (!isPlaced(draft, die)) return reject('BAD_TARGET');
      liftDie(draft, die);
      seatOf(draft, dieOwner(die)).aside.push(die);
      events.push({ type: 'DIE_SET_ASIDE', die });
      action = { type: 'USE', order, die };
      break;
    }
    case 'RETURN_BOAT': {
      const { die } = input;
      if (typeof die !== 'string') return reject('MALFORMED_ACTION');
      if (dieKind(die) !== 'BOAT' || dieOwner(die) !== seat || !isPlaced(draft, die)) {
        return reject('BAD_TARGET');
      }
      liftDie(draft, die);
      one.pool.push(die);
      events.push({ type: 'DIE_RETURNED', die });
      action = { type: 'USE', order, die };
      break;
    }
  }
  one.hand = one.hand.filter((other) => other !== order);
  one.used.push(order);
  events.push({ type: 'ORDER_USED', seat, order });
  turn.used = true;
  return { ok: true, action };
}

// --- Anidar -------------------------------------------------------------------

export function nest(
  draft: TidesState,
  seat: Seat,
  input: Record<string, unknown>,
  events: TidesEvent[],
): Outcome {
  const { bird, island } = input;
  if (typeof bird !== 'string' || typeof island !== 'string') return reject('MALFORMED_ACTION');
  if (!draft.turn) return reject('WRONG_PHASE');
  if (draft.pending.length > 0) return reject('PENDING_DECISION');
  const one = seatOf(draft, seat);
  if (!one.free.includes(bird) || !one.claimed.includes(island)) return reject('NEST_NOT_ALLOWED');
  if (one.nests.some((nested) => nested.island === island)) return reject('NEST_NOT_ALLOWED');
  if (!islandCard(island).seasons.includes(birdCard(bird).season))
    return reject('NEST_NOT_ALLOWED');
  one.free = one.free.filter((other) => other !== bird);
  one.nests.push({ bird, island });
  events.push({ type: 'BIRD_NESTED', seat, bird, island });
  return { ok: true, action: { type: 'NEST', bird, island } };
}

// --- Resolver -----------------------------------------------------------------

export function resolve(
  draft: TidesState,
  seat: Seat,
  input: Record<string, unknown>,
  events: TidesEvent[],
): Outcome {
  const head = draft.pending[0];
  if (!head) return reject('NO_PENDING_DECISION');
  const one = seatOf(draft, seat);
  let action: TidesAction;
  const rest = () => {
    draft.pending.shift();
  };

  switch (head.kind) {
    case 'BOARD_BIRD': {
      const { season } = input;
      if (!isSeason(season)) return reject('MALFORMED_ACTION');
      if (draft.birdPiles[season].length === 0) return reject('BAD_CHOICE');
      rest();
      boardBird(draft, seat, season, events);
      action = { type: 'RESOLVE', season };
      break;
    }
    case 'RELEASE_BIRD': {
      const { bird } = input;
      if (typeof bird !== 'string') return reject('MALFORMED_ACTION');
      if (!one.aboard.some((entry) => entry.bird === bird)) return reject('BAD_CHOICE');
      rest();
      releaseBird(draft, seat, bird, events, true);
      action = { type: 'RESOLVE', bird };
      break;
    }
    case 'CHOOSE_INGREDIENTS': {
      const { ingredients } = input;
      if (!Array.isArray(ingredients) || !ingredients.every(isBasic))
        return reject('MALFORMED_ACTION');
      const list = ingredients as TidesBasic[];
      const valid =
        head.mode === 'ONE'
          ? list.length === 1
          : head.mode === 'TWO_SAME'
            ? list.length === 2 && list[0] === list[1]
            : list.length === 2 && list[0] !== list[1];
      if (!valid) return reject('BAD_CHOICE');
      rest();
      for (const ingredient of list) gain(draft, seat, ingredient, 1, events);
      action = { type: 'RESOLVE', ingredients: [...list] };
      break;
    }
    case 'EXCHANGE': {
      const { give, take } = input;
      if (!Array.isArray(give) || !Array.isArray(take)) return reject('MALFORMED_ACTION');
      if (!give.every(isIngredient) || !take.every(isBasic)) return reject('MALFORMED_ACTION');
      if (give.length !== take.length || give.length > head.upTo) return reject('BAD_CHOICE');
      const needed: Record<TidesIngredient, number> = { FISH: 0, SALT: 0, ALGAE: 0, PEARL: 0 };
      for (const ingredient of give as TidesIngredient[]) needed[ingredient] += 1;
      if (INGREDIENTS.some((ingredient) => one.ingredients[ingredient] < needed[ingredient])) {
        return reject('CANNOT_AFFORD');
      }
      rest();
      for (const ingredient of give as TidesIngredient[]) one.ingredients[ingredient] -= 1;
      for (const ingredient of take as TidesBasic[]) gain(draft, seat, ingredient, 1, events);
      action = {
        type: 'RESOLVE',
        give: [...(give as TidesIngredient[])],
        take: [...(take as TidesBasic[])],
      };
      break;
    }
    case 'SHOAL': {
      if (input.skip === true) {
        rest();
        action = { type: 'RESOLVE', skip: true };
        break;
      }
      const at = parseSpot(input);
      if (!at) return reject('MALFORMED_ACTION');
      if (head.island !== null && at.island !== head.island) return reject('BAD_TARGET');
      if (!isOpen(draft, at)) return reject('BAD_TARGET');
      (draft.row[at.island] as TidesSlot).shoals[at.space] = true;
      events.push({ type: 'SHOAL_PLACED', island: at.island, space: at.space });
      draft.pending[0] = { ...head, remaining: head.remaining - 1 };
      if (head.remaining <= 1) rest();
      action = { type: 'RESOLVE', island: at.island, space: at.space };
      break;
    }
    case 'MOVE_BOAT': {
      const to = parseSpot(input.to);
      const problem = moveBoat(draft, input.die, to, head.sameFace, events);
      if (problem) return reject(problem);
      rest();
      action = {
        type: 'RESOLVE',
        die: input.die as string,
        to: to as { island: number; space: number },
      };
      break;
    }
    case 'PROMISE': {
      if (input.skip === true) {
        if (!head.optional) return reject('BAD_CHOICE');
        rest();
        if (head.revealed !== null) draft.orderDeck.unshift(head.revealed);
        action = { type: 'RESOLVE', skip: true };
        break;
      }
      const { order } = input;
      if (typeof order !== 'string') return reject('MALFORMED_ACTION');
      const slot = draft.market.indexOf(order);
      if (order !== head.revealed && slot < 0) return reject('BAD_CHOICE');
      rest();
      one.promised.push(order);
      // Si se queda una del mercado, la revelada ocupa su hueco.
      if (order !== head.revealed) draft.market[slot] = head.revealed;
      events.push({ type: 'ORDER_PROMISED', seat, order });
      if (head.remaining > 1)
        draft.pending.unshift(promisePending(draft, head.remaining - 1, true, events));
      action = { type: 'RESOLVE', order };
      break;
    }
  }
  return { ok: true, action };
}

// --- Terminar turno y fin de ronda -------------------------------------------

/** Si el asiento con el turno ya puede terminarlo: colocó y no le quedan colocaciones obligadas. */
export function canEndTurn(state: TidesState): boolean {
  const turn = state.turn;
  if (!turn || state.pending.length > 0 || turn.placed < 1) return false;
  return turn.placementsLeft === 0 || seatOf(state, turn.seat).pool.length === 0;
}

export function endTurnAction(draft: TidesState, events: TidesEvent[]): Outcome {
  if (!draft.turn) return reject('WRONG_PHASE');
  if (draft.pending.length > 0) return reject('PENDING_DECISION');
  if (!canEndTurn(draft)) return reject('MUST_PLACE_FIRST');
  endTurn(draft, events);
  return { ok: true, action: { type: 'END_TURN' } };
}

export function roundChoices(
  draft: TidesState,
  seat: Seat,
  input: Record<string, unknown>,
  events: TidesEvent[],
): Outcome {
  const { flamingo } = input;
  if (!isInt(flamingo) || flamingo < 0) return reject('MALFORMED_ACTION');
  if (draft.phase !== 'ROUND_END') return reject('WRONG_PHASE');
  if (flamingo > flamingoAffordable(draft, seat)) return reject('CANNOT_AFFORD');
  const one = seatOf(draft, seat);
  for (const basic of BASICS) one.ingredients[basic] -= flamingo;
  addPoints(draft, seat, 4 * flamingo, events);
  draft.roundChoices = draft.roundChoices.filter((other) => other !== seat);
  if (draft.roundChoices.length === 0) finishRound(draft, events);
  return { ok: true, action: { type: 'ROUND_CHOICES', flamingo } };
}

// --- Fin automático del turno (MA6) -------------------------------------------

/** Si un encargo de la mano tiene algún uso posible ahora. */
export function hasUse(state: TidesState, seat: Seat, order: string): boolean {
  const turn = state.turn;
  const one = seatOf(state, seat);
  switch (orderCard(order).use) {
    case 'TURN_DIE':
    case 'REROLL':
      return one.pool.length > 0;
    case 'DOUBLE_SHIFT':
      return turn !== null && one.pool.length > turn.placementsLeft;
    case 'TOW':
      return boatsOnIslands(state).length > 0 && emptyIslandSpaces(state).length > 0;
    case 'CROSS': {
      const faces = boatsOnIslands(state).map(({ die }) => state.faces[die]);
      return faces.some((face, index) => faces.indexOf(face) !== index);
    }
    case 'MOOR':
      return placedDice(state).length > 0;
    case 'RETURN_BOAT':
      return placedDice(state).some((die) => dieKind(die) === 'BOAT' && dieOwner(die) === seat);
  }
}

export function canFulfilAny(state: TidesState, seat: Seat): boolean {
  const one = seatOf(state, seat);
  return [...state.market, ...one.promised].some(
    (order) => order !== null && cheapestPayment(one.ingredients, orderCard(order)) !== null,
  );
}

/**
 * Tras cada jugada: descarta las decisiones sin respuesta y, si el asiento ya
 * no puede hacer nada más en su turno, lo termina por él.
 */
export function afterAction(draft: TidesState, events: TidesEvent[]): void {
  settlePending(draft);
  const turn = draft.turn;
  if (!turn || draft.phase !== 'TURNS' || !canEndTurn(draft)) return;
  const nothingLeft =
    (turn.fulfilled || !canFulfilAny(draft, turn.seat)) &&
    (turn.used || !seatOf(draft, turn.seat).hand.some((order) => hasUse(draft, turn.seat, order)));
  if (nothingLeft) endTurn(draft, events);
}

export { isRecord };
