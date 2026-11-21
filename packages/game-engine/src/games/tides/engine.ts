import type { EngineResponse, GameEngine, GameStatus, Seat } from '../../contract.js';
import { isRandomState, type RandomState, seedRandom, shuffle } from '../../random.js';
import {
  afterAction,
  endTurnAction,
  fulfil,
  isRecord,
  nest,
  type Outcome,
  place,
  resolve,
  roundChoices,
  useOrder,
} from './actions.js';
import { BIRDS, ISLANDS, ORDERS, SEASONS } from './catalog.js';
import {
  advanceTurn,
  BASICS,
  birdCard,
  BOAT_FACES,
  diceOf,
  dieKind,
  dieOwner,
  dieView,
  drawOrder,
  emptyIngredients,
  facesFor,
  finishByRetirement,
  finishRound,
  inPlay,
  INGREDIENTS,
  islandCard,
  isBirdId,
  isDieOf,
  isIslandId,
  isOrderId,
  leaderOf,
  liftDie,
  MARKET_SIZE,
  orderCard,
  PORT_SPACES,
  scoreOf,
  seatOf,
  seatsOf,
  startRound,
  type TidesSeatState,
  type TidesState,
  WEATHER_FACES,
} from './rules.js';
import type {
  TidesAction,
  TidesBasic,
  TidesEvent,
  TidesFace,
  TidesIngredient,
  TidesPending,
  TidesPortSpace,
  TidesScoreView,
  TidesSeason,
  TidesSettings,
  TidesView,
} from './types.js';

export type { TidesState } from './rules.js';

export const TIDES_SLUG = 'tides';
export const TIDES_VERSION = '1.0.0';

const MINUTE_MS = 60_000;

// --- Restaurar ------------------------------------------------------------------

const isSeatOf = (playerCount: number) => (value: unknown) =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < playerCount;

const isStringList = (value: unknown, check: (one: unknown) => boolean): value is string[] =>
  Array.isArray(value) && value.every(check);

const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;

function parseIngredients(value: unknown): Record<TidesIngredient, number> | null {
  if (!isRecord(value) || Object.keys(value).length !== INGREDIENTS.length) return null;
  const parsed = emptyIngredients();
  for (const ingredient of INGREDIENTS) {
    if (!isCount(value[ingredient])) return null;
    parsed[ingredient] = value[ingredient] as number;
  }
  return parsed;
}

function parseSeat(value: unknown, playerCount: number): TidesSeatState | null {
  if (!isRecord(value)) return null;
  const isDie = (one: unknown) => isDieOf(playerCount, one);
  const { pool, aside, aboard, free, nests, hand, used, promised, claimed, tokens, retired } =
    value;
  const ingredients = parseIngredients(value.ingredients);
  if (!ingredients || !isCount(tokens) || typeof retired !== 'boolean') return null;
  if (!isStringList(pool, isDie) || !isStringList(aside, isDie)) return null;
  if (!isStringList(free, isBirdId) || !isStringList(claimed, isIslandId)) return null;
  if (!isStringList(hand, isOrderId) || !isStringList(used, isOrderId)) return null;
  if (!isStringList(promised, isOrderId) || !Array.isArray(aboard) || !Array.isArray(nests)) {
    return null;
  }
  const parsedAboard: { bird: string; die: string | null }[] = [];
  for (const entry of aboard as unknown[]) {
    if (!isRecord(entry) || !isBirdId(entry.bird)) return null;
    if (entry.die !== null && !isDie(entry.die)) return null;
    parsedAboard.push({ bird: entry.bird as string, die: entry.die as string | null });
  }
  const parsedNests: { bird: string; island: string }[] = [];
  for (const entry of nests as unknown[]) {
    if (!isRecord(entry) || !isBirdId(entry.bird) || !isIslandId(entry.island)) return null;
    if (!(claimed as string[]).includes(entry.island as string)) return null;
    parsedNests.push({ bird: entry.bird as string, island: entry.island as string });
  }
  return {
    pool: [...pool],
    aside: [...aside],
    ingredients,
    aboard: parsedAboard,
    free: [...free],
    nests: parsedNests,
    hand: [...hand],
    used: [...used],
    promised: [...promised],
    claimed: [...claimed],
    tokens: tokens as number,
    retired,
  };
}

function parsePending(value: unknown): TidesPending | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case 'BOARD_BIRD':
    case 'RELEASE_BIRD':
      return { kind: value.kind };
    case 'CHOOSE_INGREDIENTS':
      return value.mode === 'ONE' || value.mode === 'TWO_SAME' || value.mode === 'TWO_DISTINCT'
        ? { kind: 'CHOOSE_INGREDIENTS', mode: value.mode }
        : null;
    case 'EXCHANGE':
      return isCount(value.upTo) ? { kind: 'EXCHANGE', upTo: value.upTo as number } : null;
    case 'SHOAL':
      if (!isCount(value.remaining) || (value.island !== null && !isCount(value.island)))
        return null;
      return {
        kind: 'SHOAL',
        remaining: value.remaining as number,
        island: value.island as number | null,
      };
    case 'MOVE_BOAT':
      return typeof value.sameFace === 'boolean'
        ? { kind: 'MOVE_BOAT', sameFace: value.sameFace }
        : null;
    case 'PROMISE':
      if (!isCount(value.remaining) || typeof value.optional !== 'boolean') return null;
      if (value.revealed !== null && !isOrderId(value.revealed)) return null;
      return {
        kind: 'PROMISE',
        remaining: value.remaining as number,
        revealed: value.revealed as string | null,
        optional: value.optional,
      };
    default:
      return null;
  }
}

function parseScore(value: unknown): TidesScoreView | null {
  if (!isRecord(value)) return null;
  const keys = ['islands', 'orders', 'birds', 'tokens', 'leftovers', 'total'] as const;
  if (!keys.every((key) => Number.isInteger(value[key]))) return null;
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as unknown as TidesScoreView;
}

const noRepeats = (list: readonly string[]) => new Set(list).size === list.length;

/** Comprueba que un snapshot guardado es un estado de este motor. */
function parseState(snapshot: unknown): TidesState | null {
  if (!isRecord(snapshot)) return null;
  const { playerCount, random, round, phase, firstSeat, portSide, port, portUsed } = snapshot;
  const { islandDeck, row, orderDeck, market, birdPiles, faces, seats, turn, pending } = snapshot;
  const { roundChoices: choices, scores, winners } = snapshot;
  if (!Number.isInteger(playerCount)) return null;
  const count = playerCount as number;
  if (count < 2 || count > 4 || !isRandomState(random)) return null;
  const isSeat = isSeatOf(count);
  const isDie = (one: unknown) => isDieOf(count, one);
  if (!Number.isInteger(round) || (round as number) < 1 || !isSeat(firstSeat)) return null;
  if (phase !== 'TURNS' && phase !== 'ROUND_END' && phase !== 'FINISHED') return null;
  if (portSide !== 'HIGH' && portSide !== 'LOW') return null;

  if (!isRecord(port)) return null;
  const parsedPort = {} as Record<TidesPortSpace, string[]>;
  for (const space of PORT_SPACES) {
    const dice = port[space];
    if (!isStringList(dice, isDie)) return null;
    if (space !== 'ANY_1' && space !== 'ANY_2' && dice.length > 1) return null;
    parsedPort[space] = [...dice];
  }
  if (!isStringList(portUsed, (one) => PORT_SPACES.includes(one as TidesPortSpace))) return null;
  if (!isStringList(islandDeck, isIslandId) || !isStringList(orderDeck, isOrderId)) return null;

  if (!Array.isArray(row)) return null;
  const parsedRow: TidesState['row'] = [];
  for (const slot of row as unknown[]) {
    if (!isRecord(slot) || !isIslandId(slot.id)) return null;
    const size = islandCard(slot.id as string).spaces.length;
    const { stacks, shoals } = slot;
    if (!Array.isArray(stacks) || stacks.length !== size) return null;
    if (!(stacks as unknown[]).every((stack) => isStringList(stack, isDie))) return null;
    if (!Array.isArray(shoals) || shoals.length !== size) return null;
    if (!(shoals as unknown[]).every((one) => typeof one === 'boolean')) return null;
    parsedRow.push({
      id: slot.id as string,
      stacks: (stacks as string[][]).map((stack) => [...stack]),
      shoals: [...(shoals as boolean[])],
    });
  }

  if (!Array.isArray(market) || market.length !== MARKET_SIZE) return null;
  if (!(market as unknown[]).every((one) => one === null || isOrderId(one))) return null;

  if (!isRecord(birdPiles)) return null;
  const parsedPiles = {} as Record<TidesSeason, string[]>;
  for (const season of SEASONS) {
    const pile = birdPiles[season];
    if (!isStringList(pile, isBirdId)) return null;
    if (pile.some((bird) => birdCard(bird).season !== season)) return null;
    parsedPiles[season] = [...pile];
  }

  // Todos los dados de la partida, con una cara de su tipo.
  if (!isRecord(faces)) return null;
  const allDice = seatsOf(count).flatMap(diceOf);
  if (Object.keys(faces).length !== allDice.length) return null;
  const parsedFaces: Record<string, TidesFace> = {};
  for (const die of allDice) {
    const face = faces[die];
    if (!facesFor(die).includes(face as TidesFace)) return null;
    parsedFaces[die] = face as TidesFace;
  }

  if (!Array.isArray(seats) || seats.length !== count) return null;
  const parsedSeats = (seats as unknown[]).map((one) => parseSeat(one, count));
  if (parsedSeats.some((one) => one === null)) return null;
  const seatStates = parsedSeats as TidesSeatState[];

  let parsedTurn: TidesState['turn'] = null;
  if (turn !== null) {
    if (!isRecord(turn) || !isSeat(turn.seat)) return null;
    if (!isCount(turn.placementsLeft) || !isCount(turn.placed)) return null;
    if (typeof turn.fulfilled !== 'boolean' || typeof turn.used !== 'boolean') return null;
    parsedTurn = {
      seat: turn.seat as Seat,
      placementsLeft: turn.placementsLeft as number,
      placed: turn.placed as number,
      fulfilled: turn.fulfilled,
      used: turn.used,
    };
  }
  if (!Array.isArray(pending)) return null;
  const parsedPending = (pending as unknown[]).map(parsePending);
  if (parsedPending.some((one) => one === null)) return null;
  if (!isStringList(choices as unknown, isSeat as (one: unknown) => boolean)) return null;
  let parsedScores: TidesScoreView[] | null = null;
  if (scores !== null) {
    if (!Array.isArray(scores) || scores.length !== count) return null;
    const list = (scores as unknown[]).map(parseScore);
    if (list.some((one) => one === null)) return null;
    parsedScores = list as TidesScoreView[];
  }
  if (!Array.isArray(winners) || !(winners as unknown[]).every(isSeat)) return null;

  // La fase y el turno encajan.
  if (phase === 'TURNS') {
    if (!parsedTurn || seatStates[parsedTurn.seat]?.retired) return null;
  } else if (parsedTurn || parsedPending.length > 0) {
    return null;
  }
  if (phase === 'ROUND_END' && (choices as unknown[]).length === 0) return null;
  if (phase === 'FINISHED' && !parsedScores) return null;

  // Cada dado está en un solo sitio.
  const placed = [
    ...seatStates.flatMap((one) => [...one.pool, ...one.aside]),
    ...parsedRow.flatMap((slot) => slot.stacks.flat()),
    ...PORT_SPACES.flatMap((space) => parsedPort[space]),
    ...seatStates.flatMap((one) => one.aboard.flatMap((entry) => (entry.die ? [entry.die] : []))),
  ];
  if (placed.length !== allDice.length || !noRepeats(placed)) return null;
  if (seatStates.some((one, seat) => one.pool.some((die) => dieOwner(die) !== seat))) return null;
  // Cada carta aparece como mucho una vez.
  const islands = [
    ...(islandDeck as string[]),
    ...parsedRow.map((slot) => slot.id),
    ...seatStates.flatMap((one) => one.claimed),
  ];
  const birds = [
    ...SEASONS.flatMap((season) => parsedPiles[season]),
    ...seatStates.flatMap((one) => [
      ...one.aboard.map((entry) => entry.bird),
      ...one.free,
      ...one.nests.map((nest) => nest.bird),
    ]),
  ];
  const orders = [
    ...(orderDeck as string[]),
    ...(market as (string | null)[]).flatMap((one) => (one ? [one] : [])),
    ...seatStates.flatMap((one) => [...one.hand, ...one.used, ...one.promised]),
    ...(parsedPending as TidesPending[]).flatMap((one) =>
      one.kind === 'PROMISE' && one.revealed ? [one.revealed] : [],
    ),
  ];
  if (!noRepeats(islands) || !noRepeats(birds) || !noRepeats(orders)) return null;

  return {
    playerCount: count,
    random: [...random] as unknown as RandomState,
    round: round as number,
    phase,
    firstSeat: firstSeat as Seat,
    portSide,
    port: parsedPort,
    portUsed: [...(portUsed as TidesPortSpace[])],
    islandDeck: [...(islandDeck as string[])],
    row: parsedRow,
    orderDeck: [...(orderDeck as string[])],
    market: [...(market as (string | null)[])],
    birdPiles: parsedPiles,
    faces: parsedFaces,
    seats: seatStates,
    turn: parsedTurn,
    pending: parsedPending as TidesPending[],
    roundChoices: [...(choices as Seat[])],
    scores: parsedScores,
    winners: [...(winners as Seat[])],
  };
}

// --- Estado -------------------------------------------------------------------

const clone = (state: TidesState): TidesState => JSON.parse(JSON.stringify(state)) as TidesState;

function statusOf(state: TidesState): GameStatus {
  if (state.phase === 'FINISHED') {
    return {
      finished: true,
      results: seatsOf(state.playerCount).map((seat) => ({
        seat,
        outcome: state.winners.includes(seat) ? 'WIN' : 'LOSS',
        score: state.scores?.[seat]?.total ?? 0,
      })),
    };
  }
  if (state.phase === 'ROUND_END') return { finished: false, activeSeats: [...state.roundChoices] };
  return { finished: false, activeSeats: [state.turn?.seat ?? 0] };
}

// --- Vista ----------------------------------------------------------------------

function viewOf(state: TidesState, viewer: Seat | null): TidesView {
  const bird = (id: string, die: string | null) => ({
    ...birdCard(id),
    die: die ? dieView(state, die) : null,
  });
  const head = state.pending[0] ?? null;
  const ownDecision = viewer !== null && viewer === state.turn?.seat;
  return {
    playerCount: state.playerCount,
    round: state.round,
    phase: state.phase,
    firstSeat: state.firstSeat,
    portSide: state.portSide,
    port: PORT_SPACES.map((space) => ({
      space,
      dice: state.port[space].map((die) => dieView(state, die)),
    })),
    row: state.row.map((slot) => {
      const card = islandCard(slot.id);
      return {
        id: slot.id,
        seasons: [...card.seasons],
        points: card.points,
        spaces: card.spaces.map((space, index) => ({
          ...space,
          stack: (slot.stacks[index] ?? []).map((die) => dieView(state, die)),
          shoal: slot.shoals[index] === true,
        })),
        leader: leaderOf(slot),
      };
    }),
    islandsLeft: state.islandDeck.length,
    market: state.market.map((id) => (id ? structuredOrder(id) : null)),
    ordersLeft: state.orderDeck.length,
    birdPiles: SEASONS.map((season) => {
      const top = state.birdPiles[season][0];
      return {
        season,
        top: top ? { ...birdCard(top) } : null,
        count: state.birdPiles[season].length,
      };
    }),
    seats: state.seats.map((one) => ({
      pool: one.pool.map((die) => dieView(state, die)),
      setAside: one.aside.map((die) => dieView(state, die)),
      ingredients: { ...one.ingredients },
      aboard: one.aboard.map((entry) => bird(entry.bird, entry.die)),
      free: one.free.map((id) => bird(id, null)),
      nests: one.nests.map((nest) => ({ ...nest })),
      hand: one.hand.map(structuredOrder),
      used: one.used.map(structuredOrder),
      promised: one.promised.map(structuredOrder),
      claimed: one.claimed.map((id) => {
        const card = islandCard(id);
        return {
          ...card,
          seasons: [...card.seasons],
          spaces: card.spaces.map((space) => ({ ...space })),
        };
      }),
      tokens: one.tokens,
      retired: one.retired,
      score: scoreOf(one),
    })),
    turn: state.turn ? { ...state.turn } : null,
    // La carta revelada al apalabrar solo la ve quien decide.
    pending:
      head === null
        ? null
        : head.kind === 'PROMISE' && !ownDecision
          ? { ...head, revealed: null }
          : { ...head },
    revealed:
      head?.kind === 'PROMISE' && head.revealed !== null && ownDecision
        ? structuredOrder(head.revealed)
        : null,
    roundChoices: [...state.roundChoices],
    winners: [...state.winners],
  };
}

function structuredOrder(id: string) {
  const card = orderCard(id);
  return { ...card, cost: { ...card.cost } };
}

// --- Motor ----------------------------------------------------------------------

type Handler = (
  draft: TidesState,
  seat: Seat,
  input: Record<string, unknown>,
  events: TidesEvent[],
) => Outcome;

const TURN_ACTIONS: Readonly<Record<string, Handler>> = {
  PLACE: place,
  FULFIL: fulfil,
  USE: useOrder,
  NEST: nest,
  RESOLVE: resolve,
  END_TURN: (draft, _seat, _input, events) => endTurnAction(draft, events),
};

/**
 * Motor de Mareas, versión 1.0.0 (ADR-023, MA2 a MA16).
 *
 * De 2 a 4 jugadores. Cada ronda, cada jugador tira sus cuatro barcas y sus
 * dos dados de clima y los coloca de uno en uno en las islas, el puerto o
 * sus aves. Al final de la ronda, quien domina una isla se la queda. Con lo
 * recogido se cumplen encargos, que puntúan y se usan una vez.
 */
export const tidesEngine: GameEngine<
  TidesSettings,
  TidesState,
  TidesAction,
  TidesEvent,
  TidesView
> = {
  gameSlug: TIDES_SLUG,
  gameVersion: TIDES_VERSION,

  metadata: {
    minPlayers: 2,
    maxPlayers: 4,
    timeControls: {
      // Unas 25 a 35 jugadas por jugador. Por turnos no, en la versión 1 (MA12).
      REALTIME: [15, 20, 30].map((minutes) => ({
        type: 'TOTAL_PER_PLAYER',
        totalMs: minutes * MINUTE_MS,
      })),
      TURN_BASED: [],
    },
  },

  parseSettings(input): EngineResponse<TidesSettings> {
    if (isRecord(input) && Object.keys(input).length === 0) return { ok: true, value: {} };
    return { ok: false, code: 'INVALID_SETTINGS' };
  },

  createInitialState({ playerCount, seed }) {
    let random = seedRandom(seed);
    const islands = shuffle(
      ISLANDS.filter((card) => card.minPlayers <= playerCount).map((card) => card.id),
      random,
    );
    random = islands.state;
    const orders = shuffle(
      ORDERS.map((card) => card.id),
      random,
    );
    random = orders.state;
    const piles = {} as Record<TidesSeason, string[]>;
    for (const season of SEASONS) {
      const pile = shuffle(
        BIRDS.filter((card) => card.season === season).map((card) => card.id),
        random,
      );
      random = pile.state;
      piles[season] = pile.items;
    }
    const faces: Record<string, TidesFace> = {};
    for (const die of seatsOf(playerCount).flatMap(diceOf)) {
      faces[die] =
        dieKind(die) === 'BOAT' ? (BOAT_FACES[0] as TidesFace) : (WEATHER_FACES[0] as TidesFace);
    }
    const draft: TidesState = {
      playerCount,
      random,
      round: 1,
      phase: 'TURNS',
      firstSeat: 0,
      portSide: 'HIGH',
      port: { ANY_1: [], ANY_2: [], CALM: [], STORM: [], BREEZE: [] },
      portUsed: [],
      islandDeck: islands.items,
      row: [],
      orderDeck: orders.items,
      market: [],
      birdPiles: piles,
      faces,
      seats: seatsOf(playerCount).map(() => ({
        pool: [],
        aside: [],
        ingredients: { ...emptyIngredients(), PEARL: 1 },
        aboard: [],
        free: [],
        nests: [],
        hand: [],
        used: [],
        promised: [],
        claimed: [],
        tokens: 0,
        retired: false,
      })),
      turn: null,
      pending: [],
      roundChoices: [],
      scores: null,
      winners: [],
    };
    const events: TidesEvent[] = [];
    draft.market = Array.from({ length: MARKET_SIZE }, () => drawOrder(draft, events));
    startRound(draft, 1, 0, events);
    return draft;
  },

  restoreState(snapshot) {
    const state = parseState(snapshot);
    return state ? { ok: true, value: state } : { ok: false, code: 'INVALID_GAME_STATE' };
  },

  getStatus: statusOf,

  applyAction(state, seat, input) {
    if (state.phase === 'FINISHED') return { ok: false, code: 'GAME_ALREADY_FINISHED' };
    const status = statusOf(state);
    if (status.finished || !status.activeSeats.includes(seat)) {
      return { ok: false, code: 'NOT_YOUR_TURN' };
    }
    if (!isRecord(input) || typeof input.type !== 'string') {
      return { ok: false, code: 'INVALID_ACTION', reason: 'MALFORMED_ACTION' };
    }
    const draft = clone(state);
    const events: TidesEvent[] = [];
    let outcome: Outcome;
    if (state.phase === 'ROUND_END') {
      outcome =
        input.type === 'ROUND_CHOICES'
          ? roundChoices(draft, seat, input, events)
          : { ok: false, reason: TURN_ACTIONS[input.type] ? 'WRONG_PHASE' : 'MALFORMED_ACTION' };
    } else {
      const handler = TURN_ACTIONS[input.type];
      outcome = handler
        ? handler(draft, seat, input, events)
        : {
            ok: false,
            reason: input.type === 'ROUND_CHOICES' ? 'WRONG_PHASE' : 'MALFORMED_ACTION',
          };
      if (outcome.ok) afterAction(draft, events);
    }
    if (!outcome.ok) return { ok: false, code: 'INVALID_ACTION', reason: outcome.reason };
    return { ok: true, value: { state: draft, action: outcome.action, events } };
  },

  retireSeat(state, seat) {
    if (state.phase === 'FINISHED' || !isSeatOf(state.playerCount)(seat))
      return { state, events: [] };
    if (seatOf(state, seat).retired) return { state, events: [] };
    const draft = clone(state);
    const events: TidesEvent[] = [{ type: 'SEAT_RETIRED', seat }];
    const one = seatOf(draft, seat);
    one.retired = true;
    // Sus barcas salen del tablero; los dados de clima que puso se quedan (MA13).
    for (const slot of draft.row) {
      for (const stack of slot.stacks) {
        for (const die of [...stack]) {
          if (dieKind(die) === 'BOAT' && dieOwner(die) === seat) liftDie(draft, die);
        }
      }
    }
    for (const entry of one.aboard) entry.die = null;
    const onBoard = new Set([
      ...draft.row.flatMap((slot) => slot.stacks.flat()),
      ...PORT_SPACES.flatMap((space) => draft.port[space]),
      ...draft.seats.flatMap((other) =>
        other.aboard.flatMap((entry) => (entry.die ? [entry.die] : [])),
      ),
    ]);
    one.aside = diceOf(seat).filter((die) => !onBoard.has(die));
    one.pool = [];

    if (inPlay(draft).length <= 1) {
      finishByRetirement(draft);
    } else if (draft.phase === 'TURNS' && draft.turn?.seat === seat) {
      draft.pending = [];
      advanceTurn(draft, seat, events);
      afterAction(draft, events);
    } else if (draft.phase === 'ROUND_END') {
      draft.roundChoices = draft.roundChoices.filter((other) => other !== seat);
      if (draft.roundChoices.length === 0) finishRound(draft, events);
    }
    return { state: draft, events };
  },

  getView: viewOf,
};

export { BASICS, type TidesBasic };
