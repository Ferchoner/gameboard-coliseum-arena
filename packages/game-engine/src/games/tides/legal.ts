/**
 * Mareas: las jugadas posibles de un asiento en un estado. Sirve a las
 * pruebas, a la comprobación común y a la simulación de equilibrio; la
 * plataforma no lo usa. Genera candidatas a partir del estado y se queda con
 * las que el motor acepta, así que nunca devuelve una jugada que no valga.
 */
import type { Seat } from '../../contract.js';
import { SEASONS } from './catalog.js';
import { tidesEngine } from './engine.js';
import {
  BASICS,
  birdSpaceKind,
  boatsOnIslands,
  cheapestPayment,
  emptyIslandSpaces,
  facesFor,
  flamingoAffordable,
  INGREDIENTS,
  islandCard,
  orderCard,
  placedDice,
  PORT_SPACES,
  seatOf,
  type TidesState,
} from './rules.js';
import type { TidesAction, TidesBasic } from './types.js';

/** Las colocaciones con sentido: cada dado distinto (tipo y cara) en cada sitio. */
function placements(state: TidesState, seat: Seat): TidesAction[] {
  const one = seatOf(state, seat);
  const seen = new Set<string>();
  const dice = one.pool.filter((die) => {
    const key = `${die.includes('B') ? 'B' : 'W'}${state.faces[die]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const actions: TidesAction[] = [];
  for (const die of dice) {
    for (const [island, slot] of state.row.entries()) {
      for (const [space, card] of islandCard(slot.id).spaces.entries()) {
        const target = { kind: 'ISLAND', island, space } as const;
        actions.push({ type: 'PLACE', die, target });
        if (die.includes('B') && state.faces[die] !== card.figure) {
          if (card.reward !== 'BIRD')
            actions.push({ type: 'PLACE', die, target, force: card.reward });
          actions.push({ type: 'PLACE', die, target, force: 'PEARL' });
        }
      }
    }
    for (const space of PORT_SPACES)
      actions.push({ type: 'PLACE', die, target: { kind: 'PORT', space } });
    for (const entry of one.aboard) {
      if (birdSpaceKind(entry.bird) !== undefined) {
        actions.push({ type: 'PLACE', die, target: { kind: 'BIRD', bird: entry.bird } });
      }
    }
  }
  return actions;
}

function uses(state: TidesState, seat: Seat): TidesAction[] {
  const one = seatOf(state, seat);
  const actions: TidesAction[] = [];
  const open = emptyIslandSpaces(state);
  const boats = boatsOnIslands(state).map(({ die }) => die);
  for (const order of one.hand) {
    switch (orderCard(order).use) {
      case 'TURN_DIE':
        for (const die of one.pool) {
          for (const face of facesFor(die)) actions.push({ type: 'USE', order, die, face });
        }
        break;
      case 'REROLL':
        if (one.pool.length > 0) actions.push({ type: 'USE', order, dice: [...one.pool] });
        for (const die of one.pool.slice(0, 2)) actions.push({ type: 'USE', order, dice: [die] });
        break;
      case 'DOUBLE_SHIFT':
        actions.push({ type: 'USE', order });
        break;
      case 'TOW':
        for (const die of boats) {
          for (const to of open.slice(0, 6)) actions.push({ type: 'USE', order, die, to });
        }
        break;
      case 'CROSS':
        for (const [index, a] of boats.entries()) {
          for (const b of boats.slice(index + 1))
            actions.push({ type: 'USE', order, dice: [a, b] });
        }
        break;
      case 'MOOR':
        for (const die of placedDice(state)) actions.push({ type: 'USE', order, die });
        break;
      case 'RETURN_BOAT':
        for (const die of placedDice(state)) actions.push({ type: 'USE', order, die });
        break;
    }
  }
  return actions;
}

const PAIRS: readonly (readonly [TidesBasic, TidesBasic])[] = [
  ['FISH', 'SALT'],
  ['FISH', 'ALGAE'],
  ['SALT', 'ALGAE'],
];

function resolutions(state: TidesState, seat: Seat): TidesAction[] {
  const head = state.pending[0];
  const one = seatOf(state, seat);
  if (!head) return [];
  switch (head.kind) {
    case 'BOARD_BIRD':
      return SEASONS.map((season) => ({ type: 'RESOLVE', season }));
    case 'RELEASE_BIRD':
      return one.aboard.map((entry) => ({ type: 'RESOLVE', bird: entry.bird }));
    case 'CHOOSE_INGREDIENTS':
      if (head.mode === 'ONE')
        return BASICS.map((basic) => ({ type: 'RESOLVE', ingredients: [basic] }));
      if (head.mode === 'TWO_SAME') {
        return BASICS.map((basic) => ({ type: 'RESOLVE', ingredients: [basic, basic] }));
      }
      return PAIRS.map((pair) => ({ type: 'RESOLVE', ingredients: [...pair] }));
    case 'EXCHANGE': {
      const owned = INGREDIENTS.filter((ingredient) => one.ingredients[ingredient] > 0);
      const actions: TidesAction[] = [{ type: 'RESOLVE', give: [], take: [] }];
      for (const give of owned) {
        for (const take of BASICS) {
          if (give !== take) actions.push({ type: 'RESOLVE', give: [give], take: [take] });
          if (head.upTo >= 2 && give !== take) {
            actions.push({ type: 'RESOLVE', give: [give, give], take: [take, take] });
          }
        }
      }
      return actions;
    }
    case 'SHOAL': {
      const open = emptyIslandSpaces(state).filter(
        (at) => head.island === null || at.island === head.island,
      );
      return [
        ...open.map((at): TidesAction => ({ type: 'RESOLVE', ...at })),
        { type: 'RESOLVE', skip: true },
      ];
    }
    case 'MOVE_BOAT': {
      const open = emptyIslandSpaces(state);
      return boatsOnIslands(state).flatMap(({ die }) =>
        open.map((to): TidesAction => ({ type: 'RESOLVE', die, to })),
      );
    }
    case 'PROMISE': {
      const choices = [head.revealed, ...state.market].flatMap((order) =>
        order ? [{ type: 'RESOLVE', order } as TidesAction] : [],
      );
      return head.optional ? [...choices, { type: 'RESOLVE', skip: true }] : choices;
    }
  }
}

function fulfilments(state: TidesState, seat: Seat): TidesAction[] {
  const one = seatOf(state, seat);
  return [...state.market, ...one.promised].flatMap((order) => {
    if (!order) return [];
    const payment = cheapestPayment(one.ingredients, orderCard(order));
    return payment ? [{ type: 'FULFIL', order, payment } as TidesAction] : [];
  });
}

/** Todas las candidatas, válidas o no, para un asiento. */
export function candidateActions(state: TidesState, seat: Seat): TidesAction[] {
  if (state.phase === 'ROUND_END') {
    const most = state.roundChoices.includes(seat) ? flamingoAffordable(state, seat) : 0;
    return Array.from({ length: most + 1 }, (_, flamingo) => ({ type: 'ROUND_CHOICES', flamingo }));
  }
  if (state.phase !== 'TURNS') return [];
  if (state.pending.length > 0) return resolutions(state, seat);
  const one = seatOf(state, seat);
  return [
    ...placements(state, seat),
    ...fulfilments(state, seat),
    ...uses(state, seat),
    ...one.free.flatMap((bird) =>
      one.claimed.map((island): TidesAction => ({ type: 'NEST', bird, island })),
    ),
    { type: 'END_TURN' },
  ];
}

/** Las jugadas que el motor acepta ahora, con la jugada normalizada que devuelve. */
export function legalActions(state: TidesState, seat: Seat): TidesAction[] {
  return candidateActions(state, seat).filter(
    (action) => tidesEngine.applyAction(state, seat, action).ok,
  );
}
