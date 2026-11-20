import type {
  EngineResponse,
  GameEngine,
  GameStatus,
  Rejected,
  Seat,
  SeatResult,
} from '../../contract.js';
import { isRandomState, type RandomState, seedRandom, shuffle } from '../../random.js';
import type {
  DominoesAction,
  DominoesEnd,
  DominoesEvent,
  DominoesHandEnding,
  DominoesHandSummary,
  DominoesPlayable,
  DominoesRejectionReason,
  DominoesSettings,
  DominoesTile,
  DominoesView,
} from './types.js';

export const DOMINOES_SLUG = 'dominoes';
export const DOMINOES_VERSION = '1.0.0';

/** A cuántos puntos se juega (F6). */
export const TARGET_SCORE = 100;

/** Fichas que recibe cada jugador al empezar la mano (DO2). */
export const HAND_SIZE = 7;

/** Lado más alto de una ficha: el juego es de doble seis (DO2). */
const MAX_PIPS = 6;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Las 28 fichas del doble seis, con el lado menor primero. */
export const ALL_TILES: readonly DominoesTile[] = Array.from({ length: MAX_PIPS + 1 }, (_, low) =>
  Array.from({ length: MAX_PIPS + 1 - low }, (__, step): DominoesTile => [low, low + step]),
).flat();

/** Lo que dura una mano. */
export interface DominoesHandState {
  /** Número de mano, desde 1. */
  readonly number: number;
  /** Quien salió en esta mano. */
  readonly leader: Seat;
  /** A quién le toca. Siempre un asiento que puede jugar. */
  readonly turn: Seat;
  /** `hands[asiento]`: sus fichas, ordenadas, con el lado menor primero. */
  readonly hands: readonly (readonly DominoesTile[])[];
  /** El pozo, en el orden en que se roba. */
  readonly boneyard: readonly DominoesTile[];
  /** La línea, de izquierda a derecha, con cada ficha orientada. */
  readonly line: readonly DominoesTile[];
  /** En la primera mano, la ficha con la que hay que salir; `null` cuando ya no hace falta (DO5). */
  readonly opening: DominoesTile | null;
}

/**
 * Estado del juego. Es un valor JSON plano, y es interno: la plataforma lo
 * guarda sin interpretarlo y los clientes solo reciben su vista.
 */
export interface DominoesState {
  readonly playerCount: number;
  /** El estado del generador de azar, que baraja cada mano (DO15). */
  readonly random: RandomState;
  /** `scores[asiento]`: sus puntos. Con parejas, los dos tienen los mismos. */
  readonly scores: readonly number[];
  /** Los asientos retirados, en orden (DO11). */
  readonly retired: readonly Seat[];
  /** La mano en juego, o la última si la partida terminó. */
  readonly hand: DominoesHandState;
  readonly lastHand: DominoesHandSummary | null;
}

// --- Piezas -----------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidAction(reason: DominoesRejectionReason): Rejected {
  return { ok: false, code: 'INVALID_ACTION', reason };
}

const pipsOf = (tile: DominoesTile) => tile[0] + tile[1];
const sumOf = (tiles: readonly DominoesTile[]) =>
  tiles.reduce((total, tile) => total + pipsOf(tile), 0);
const isDouble = (tile: DominoesTile) => tile[0] === tile[1];
const sameTile = (a: DominoesTile, b: DominoesTile) => a[0] === b[0] && a[1] === b[1];
const tileKey = (tile: DominoesTile) => tile[0] * (MAX_PIPS + 1) + tile[1];

function canonicalTile(tile: DominoesTile): DominoesTile {
  return tile[0] <= tile[1] ? [tile[0], tile[1]] : [tile[1], tile[0]];
}

function sortTiles(tiles: readonly DominoesTile[]): DominoesTile[] {
  return [...tiles].sort((a, b) => tileKey(a) - tileKey(b));
}

function seatsOf(playerCount: number): Seat[] {
  return Array.from({ length: playerCount }, (_, seat) => seat);
}

/** Con 4, la pareja de un asiento: 0 y 2 contra 1 y 3 (DO3). */
function teamsOf(playerCount: number): Seat[][] | null {
  return playerCount === 4
    ? [
        [0, 2],
        [1, 3],
      ]
    : null;
}

/**
 * Los "lados" que anotan: las parejas con 4 jugadores, y cada asiento que
 * sigue en juego con 2 o 3.
 */
function sidesOf(state: Pick<DominoesState, 'playerCount' | 'retired'>): Seat[][] {
  return (
    teamsOf(state.playerCount) ??
    seatsOf(state.playerCount)
      .filter((seat) => !state.retired.includes(seat))
      .map((seat) => [seat])
  );
}

function sideOf(state: Pick<DominoesState, 'playerCount' | 'retired'>, seat: Seat): Seat[] {
  return sidesOf(state).find((side) => side.includes(seat)) ?? [seat];
}

/** El siguiente asiento que sigue en juego después de `seat`. */
function nextInPlay(state: Pick<DominoesState, 'playerCount' | 'retired'>, seat: Seat): Seat {
  for (let step = 1; step <= state.playerCount; step += 1) {
    const next = (seat + step) % state.playerCount;
    if (!state.retired.includes(next)) return next;
  }
  return seat;
}

function endsOf(line: readonly DominoesTile[]): { left: number; right: number } | null {
  const first = line[0];
  const last = line.at(-1);
  return first && last ? { left: first[0], right: last[1] } : null;
}

/** En qué extremos cabe una ficha. Con la línea vacía, cabe (DO6). */
function fittingEnds(tile: DominoesTile, line: readonly DominoesTile[]): DominoesEnd[] {
  const ends = endsOf(line);
  if (!ends) return ['RIGHT'];
  const fits: DominoesEnd[] = [];
  if (tile.includes(ends.left)) fits.push('LEFT');
  if (tile.includes(ends.right)) fits.push('RIGHT');
  return fits;
}

function canPlay(tiles: readonly DominoesTile[], line: readonly DominoesTile[]): boolean {
  return tiles.some((tile) => fittingEnds(tile, line).length > 0);
}

/** La ficha con la que se sale en la primera mano: el doble más alto o, sin dobles, la de más puntos (DO5). */
function openingRank(tile: DominoesTile): number {
  return isDouble(tile) ? 1000 + tile[0] : pipsOf(tile) * 10 + tile[1];
}

/** Pone la ficha en ese extremo, orientada para casar. */
function place(
  line: readonly DominoesTile[],
  tile: DominoesTile,
  end: DominoesEnd,
): DominoesTile[] {
  const ends = endsOf(line);
  if (!ends) return [tile];
  if (end === 'LEFT') {
    const other = tile[0] === ends.left ? tile[1] : tile[0];
    return [[other, ends.left], ...line];
  }
  const other = tile[0] === ends.right ? tile[1] : tile[0];
  return [...line, [ends.right, other]];
}

// --- Manos --------------------------------------------------------------------

/**
 * Baraja y reparte una mano nueva entre los asientos que siguen en juego
 * (DO2). En la primera mano sale quien tiene la ficha de salida (DO5).
 */
function dealHand(
  state: Pick<DominoesState, 'playerCount' | 'retired'>,
  random: RandomState,
  number: number,
  leader: Seat | null,
): { hand: DominoesHandState; random: RandomState } {
  const shuffled = shuffle(ALL_TILES, random);
  const hands: DominoesTile[][] = seatsOf(state.playerCount).map(() => []);
  let next = 0;
  for (const seat of seatsOf(state.playerCount)) {
    if (state.retired.includes(seat)) continue;
    hands[seat] = sortTiles(shuffled.items.slice(next, next + HAND_SIZE));
    next += HAND_SIZE;
  }
  const boneyard = shuffled.items.slice(next);

  if (leader !== null) {
    return {
      hand: { number, leader, turn: leader, hands, boneyard, line: [], opening: null },
      random: shuffled.state,
    };
  }
  let best: { seat: Seat; tile: DominoesTile } | null = null;
  for (const [seat, tiles] of hands.entries()) {
    for (const tile of tiles) {
      if (!best || openingRank(tile) > openingRank(best.tile)) best = { seat, tile };
    }
  }
  const opener = best ?? { seat: 0, tile: ALL_TILES[0] as DominoesTile };
  return {
    hand: {
      number,
      leader: opener.seat,
      turn: opener.seat,
      hands,
      boneyard,
      line: [],
      opening: opener.tile,
    },
    random: shuffled.state,
  };
}

/**
 * Busca, desde `from`, al primero que puede jugar. A quien no puede, el
 * motor le roba del pozo hasta que puede o se acaba; si sigue sin poder,
 * pasa (DO7). Si pasan todos los que siguen en juego, la mano termina en
 * tranque (DO8).
 */
function advance(
  state: DominoesState,
  hand: DominoesHandState,
  from: Seat,
  events: DominoesEvent[],
): DominoesState {
  const hands = hand.hands.map((tiles) => [...tiles]);
  const boneyard = [...hand.boneyard];
  const inPlay = seatsOf(state.playerCount).filter((seat) => !state.retired.includes(seat));
  let seat = from;
  let passes = 0;
  while (passes < inPlay.length) {
    if (inPlay.includes(seat)) {
      const own = hands[seat] ?? [];
      let drawn = 0;
      while (boneyard.length > 0 && !canPlay(own, hand.line)) {
        own.push(boneyard.shift() as DominoesTile);
        drawn += 1;
      }
      if (drawn > 0) events.push({ type: 'TILES_DRAWN', seat, count: drawn });
      if (canPlay(own, hand.line)) {
        return {
          ...state,
          hand: { ...hand, hands: hands.map(sortTiles), boneyard, turn: seat, opening: null },
        };
      }
      events.push({ type: 'PASSED', seat });
      passes += 1;
    }
    seat = (seat + 1) % state.playerCount;
  }
  return endHand(state, { ...hand, hands: hands.map(sortTiles), boneyard }, null, events);
}

/**
 * Termina la mano: por dominó si `dominoSeat` se quedó sin fichas, o en
 * tranque. Anota los puntos (DO9) y, si nadie llegó a 100, reparte la
 * siguiente (DO10).
 */
function endHand(
  state: DominoesState,
  hand: DominoesHandState,
  dominoSeat: Seat | null,
  events: DominoesEvent[],
): DominoesState {
  const remaining = (seat: Seat) => (state.retired.includes(seat) ? [] : (hand.hands[seat] ?? []));
  const sumOfSide = (side: readonly Seat[]) =>
    side.reduce((total, seat) => total + sumOf(remaining(seat)), 0);
  const sides = sidesOf(state);

  let ending: DominoesHandEnding;
  let winner: Seat | null;
  if (dominoSeat !== null) {
    ending = 'DOMINO';
    winner = dominoSeat;
  } else {
    const sums = sides.map(sumOfSide);
    const lowest = Math.min(...sums);
    const lowestSides = sides.filter((_, index) => sums[index] === lowest);
    if (lowestSides.length > 1) {
      ending = 'BLOCKED_TIE';
      winner = null;
    } else {
      ending = 'BLOCKED';
      // Con parejas, sale en la siguiente quien menos suma de la pareja;
      // a igualdad, el primero en jugar desde quien salió en esta mano.
      const side = lowestSides[0] ?? [];
      const order = (seat: Seat) => (seat - hand.leader + state.playerCount) % state.playerCount;
      winner =
        [...side].sort(
          (a, b) => sumOf(remaining(a)) - sumOf(remaining(b)) || order(a) - order(b),
        )[0] ?? null;
    }
  }

  const winningSide = winner === null ? [] : sideOf(state, winner);
  const points =
    winner === null
      ? 0
      : sides
          .filter((side) => !side.includes(winner))
          .reduce((total, side) => total + sumOfSide(side), 0);
  const scores = state.scores.map((score, seat) =>
    winningSide.includes(seat) ? score + points : score,
  );
  const summary: DominoesHandSummary = {
    number: hand.number,
    ending,
    winner,
    points,
    hands: seatsOf(state.playerCount).map((seat) => [...remaining(seat)]),
  };
  events.push({ type: 'HAND_ENDED', ...summary });

  const scored: DominoesState = { ...state, scores, hand, lastHand: summary };
  if (scores.some((score) => score >= TARGET_SCORE)) return scored;

  // Sale quien ganó la mano; tras un tranque empatado, quien salió en ella (DO5).
  const previous = winner ?? hand.leader;
  const leader = state.retired.includes(previous) ? nextInPlay(state, previous) : previous;
  const dealt = dealHand(state, state.random, hand.number + 1, leader);
  events.push({ type: 'HAND_STARTED', number: hand.number + 1, leader });
  return { ...scored, random: dealt.random, hand: dealt.hand };
}

// --- Situación ---------------------------------------------------------------

/** Los resultados si la partida terminó; `null` si sigue. */
function finalResults(state: DominoesState): SeatResult[] | null {
  const seats = seatsOf(state.playerCount);
  const result = (winners: readonly Seat[]) =>
    seats.map((seat): SeatResult => ({
      seat,
      outcome: winners.includes(seat) ? 'WIN' : 'LOSS',
      score: state.scores[seat] ?? 0,
    }));

  // Con 2 o 4, una retirada termina la partida: pierde el retirado o su pareja (DO11).
  const [firstRetired] = state.retired;
  if (firstRetired !== undefined && state.playerCount !== 3) {
    return result(seats.filter((seat) => !sideOf(state, firstRetired).includes(seat)));
  }
  const inPlay = seats.filter((seat) => !state.retired.includes(seat));
  if (inPlay.length === 1) return result(inPlay);
  const reached = seats.filter((seat) => (state.scores[seat] ?? 0) >= TARGET_SCORE);
  return reached.length > 0 ? result(reached) : null;
}

function statusOf(state: DominoesState): GameStatus {
  const results = finalResults(state);
  if (results) return { finished: true, results };
  return { finished: false, activeSeats: [state.hand.turn] };
}

// --- Validar lo que llega -------------------------------------------------------

function parseTile(value: unknown): DominoesTile | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [a, b] = value as unknown[];
  const valid = (side: unknown): side is number =>
    Number.isInteger(side) && (side as number) >= 0 && (side as number) <= MAX_PIPS;
  return valid(a) && valid(b) ? [a, b] : null;
}

function parseTiles(value: unknown, canonical: boolean): DominoesTile[] | null {
  if (!Array.isArray(value)) return null;
  const tiles: DominoesTile[] = [];
  for (const item of value as unknown[]) {
    const tile = parseTile(item);
    if (!tile || (canonical && tile[0] > tile[1])) return null;
    tiles.push(tile);
  }
  return tiles;
}

const isSeatOf = (playerCount: number) => (value: unknown) =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < playerCount;

function parseSummary(value: unknown, playerCount: number): DominoesHandSummary | null {
  if (!isRecord(value)) return null;
  const { number, ending, winner, points, hands } = value;
  if (!Number.isInteger(number) || (number as number) < 1) return null;
  if (ending !== 'DOMINO' && ending !== 'BLOCKED' && ending !== 'BLOCKED_TIE') return null;
  if (winner !== null && !isSeatOf(playerCount)(winner)) return null;
  if ((winner === null) !== (ending === 'BLOCKED_TIE')) return null;
  if (!Number.isInteger(points) || (points as number) < 0) return null;
  if (!Array.isArray(hands) || hands.length !== playerCount) return null;
  const parsed = (hands as unknown[]).map((tiles) => parseTiles(tiles, true));
  if (parsed.some((tiles) => tiles === null)) return null;
  return {
    number: number as number,
    ending,
    winner: winner as Seat | null,
    points: points as number,
    hands: parsed as DominoesTile[][],
  };
}

function parseHand(value: unknown, playerCount: number): DominoesHandState | null {
  if (!isRecord(value)) return null;
  const isSeat = isSeatOf(playerCount);
  const { number, leader, turn, hands, boneyard, line, opening } = value;
  if (!Number.isInteger(number) || (number as number) < 1) return null;
  if (!isSeat(leader) || !isSeat(turn)) return null;
  if (!Array.isArray(hands) || hands.length !== playerCount) return null;
  const parsedHands = (hands as unknown[]).map((tiles) => parseTiles(tiles, true));
  if (parsedHands.some((tiles) => tiles === null)) return null;
  const parsedBoneyard = parseTiles(boneyard, true);
  const parsedLine = parseTiles(line, false);
  if (!parsedBoneyard || !parsedLine) return null;
  // La línea casa de una ficha a la siguiente.
  for (let index = 1; index < parsedLine.length; index += 1) {
    if (parsedLine[index - 1]?.[1] !== parsedLine[index]?.[0]) return null;
  }
  let parsedOpening: DominoesTile | null = null;
  if (opening !== null) {
    parsedOpening = parseTile(opening);
    if (!parsedOpening || parsedOpening[0] > parsedOpening[1] || parsedLine.length > 0) return null;
  }
  // Las 28 fichas, cada una una vez, entre las manos, el pozo y la línea.
  const all = [
    ...(parsedHands as DominoesTile[][]).flat(),
    ...parsedBoneyard,
    ...parsedLine.map(canonicalTile),
  ];
  if (all.length !== ALL_TILES.length || new Set(all.map(tileKey)).size !== ALL_TILES.length) {
    return null;
  }
  return {
    number: number as number,
    leader: leader as Seat,
    turn: turn as Seat,
    hands: parsedHands as DominoesTile[][],
    boneyard: parsedBoneyard,
    line: parsedLine,
    opening: parsedOpening,
  };
}

/** Comprueba que un snapshot guardado es un estado de este motor. */
function parseState(snapshot: unknown): DominoesState | null {
  if (!isRecord(snapshot)) return null;
  const { playerCount, random, scores, retired, hand, lastHand } = snapshot;
  if (!Number.isInteger(playerCount)) return null;
  const count = playerCount as number;
  if (count < 2 || count > 4) return null;
  if (!isRandomState(random)) return null;
  if (!Array.isArray(scores) || scores.length !== count) return null;
  if (!scores.every((score) => Number.isInteger(score) && (score as number) >= 0)) return null;
  if (count === 4 && (scores[0] !== scores[2] || scores[1] !== scores[3])) return null;
  if (!Array.isArray(retired) || !retired.every(isSeatOf(count))) return null;
  if (new Set(retired).size !== retired.length || retired.length >= count) return null;
  const parsedHand = parseHand(hand, count);
  if (!parsedHand) return null;
  let parsedLast: DominoesHandSummary | null = null;
  if (lastHand !== null) {
    parsedLast = parseSummary(lastHand, count);
    if (!parsedLast) return null;
  }
  const state: DominoesState = {
    playerCount: count,
    random: [...random] as unknown as RandomState,
    scores: scores as number[],
    retired: retired as Seat[],
    hand: parsedHand,
    lastHand: parsedLast,
  };
  // Mientras la partida sigue, le toca a alguien que sigue en juego.
  if (!finalResults(state) && state.retired.includes(parsedHand.turn)) return null;
  return state;
}

// --- Vista ---------------------------------------------------------------------

function playableOf(hand: DominoesHandState, seat: Seat): DominoesPlayable[] {
  const ends = endsOf(hand.line);
  return (hand.hands[seat] ?? []).flatMap((tile) => {
    if (hand.opening && !sameTile(hand.opening, tile)) return [];
    const fits = fittingEnds(tile, hand.line);
    if (fits.length === 0) return [];
    // Con los dos extremos iguales da lo mismo dónde se ponga.
    const choice: DominoesEnd[] = ends && ends.left === ends.right ? ['RIGHT'] : fits;
    return [{ tile: [...tile] as DominoesTile, ends: choice }];
  });
}

// --- Motor -------------------------------------------------------------------

/**
 * Motor del Dominó, versión 1.0.0 (ADR-020, DO1 a DO17).
 *
 * Doble seis, de 2 a 4 jugadores (con 4, en parejas), a 100 puntos. El
 * motor roba y pasa por el jugador que no puede jugar; la única acción es
 * poner una ficha en un extremo.
 */
export const dominoesEngine: GameEngine<
  DominoesSettings,
  DominoesState,
  DominoesAction,
  DominoesEvent,
  DominoesView
> = {
  gameSlug: DOMINOES_SLUG,
  gameVersion: DOMINOES_VERSION,

  metadata: {
    minPlayers: 2,
    maxPlayers: 4,
    timeControls: {
      // De 3 a 6 manos, unas 7 fichas por mano y jugador (DO12).
      REALTIME: [10, 15, 20].map((minutes) => ({
        type: 'TOTAL_PER_PLAYER',
        totalMs: minutes * MINUTE_MS,
      })),
      TURN_BASED: [12, 24, 36].map((hours) => ({
        type: 'TOTAL_PER_PLAYER',
        totalMs: hours * HOUR_MS,
      })),
    },
  },

  parseSettings(input): EngineResponse<DominoesSettings> {
    if (isRecord(input) && Object.keys(input).length === 0) return { ok: true, value: {} };
    return { ok: false, code: 'INVALID_SETTINGS' };
  },

  createInitialState({ playerCount, seed }) {
    const base = { playerCount, retired: [] as Seat[] };
    const dealt = dealHand(base, seedRandom(seed), 1, null);
    return {
      playerCount,
      random: dealt.random,
      scores: seatsOf(playerCount).map(() => 0),
      retired: [],
      hand: dealt.hand,
      lastHand: null,
    };
  },

  restoreState(snapshot) {
    const state = parseState(snapshot);
    return state ? { ok: true, value: state } : { ok: false, code: 'INVALID_GAME_STATE' };
  },

  getStatus: statusOf,

  applyAction(state, seat, input) {
    const status = statusOf(state);
    if (status.finished) return { ok: false, code: 'GAME_ALREADY_FINISHED' };
    if (!status.activeSeats.includes(seat)) return { ok: false, code: 'NOT_YOUR_TURN' };
    if (!isRecord(input) || input.type !== 'PLAY') return invalidAction('MALFORMED_ACTION');
    const given = parseTile(input.tile);
    if (!given) return invalidAction('MALFORMED_ACTION');
    if (input.end !== undefined && input.end !== 'LEFT' && input.end !== 'RIGHT') {
      return invalidAction('MALFORMED_ACTION');
    }

    const { hand } = state;
    const tile = canonicalTile(given);
    const own = hand.hands[seat] ?? [];
    if (!own.some((one) => sameTile(one, tile))) return invalidAction('TILE_NOT_IN_HAND');
    if (hand.opening && !sameTile(hand.opening, tile)) return invalidAction('WRONG_OPENING_TILE');

    const ends = endsOf(hand.line);
    const fits = fittingEnds(tile, hand.line);
    let end: DominoesEnd;
    if (!ends) {
      end = 'RIGHT';
    } else if (input.end !== undefined) {
      if (!fits.includes(input.end)) return invalidAction('TILE_DOES_NOT_FIT');
      end = input.end;
    } else if (fits.length === 0) {
      return invalidAction('TILE_DOES_NOT_FIT');
    } else if (fits.length === 2 && ends.left !== ends.right) {
      return invalidAction('END_REQUIRED');
    } else {
      end = fits.at(-1) as DominoesEnd;
    }

    const events: DominoesEvent[] = [{ type: 'TILE_PLAYED', seat, tile, end }];
    const played: DominoesHandState = {
      ...hand,
      hands: hand.hands.map((tiles, one) =>
        one === seat ? tiles.filter((other) => !sameTile(other, tile)) : tiles,
      ),
      line: place(hand.line, tile, end),
      opening: null,
    };
    const next =
      (played.hands[seat] ?? []).length === 0
        ? endHand(state, played, seat, events)
        : advance(state, played, nextInPlay(state, seat), events);
    return { ok: true, value: { state: next, action: { type: 'PLAY', tile, end }, events } };
  },

  retireSeat(state, seat) {
    if (state.retired.includes(seat) || finalResults(state)) return { state, events: [] };
    const events: DominoesEvent[] = [{ type: 'SEAT_RETIRED', seat }];
    const retired: DominoesState = { ...state, retired: [...state.retired, seat] };
    // Con 3, la mano sigue con los otros dos; si le tocaba, juega el siguiente (DO11).
    if (finalResults(retired) || state.hand.turn !== seat) return { state: retired, events };
    return {
      state: advance(retired, retired.hand, nextInPlay(retired, seat), events),
      events,
    };
  },

  getView(state, viewer) {
    const finished = finalResults(state) !== null;
    const { hand } = state;
    const seat =
      viewer !== null && isSeatOf(state.playerCount)(viewer) && !state.retired.includes(viewer)
        ? viewer
        : null;
    return {
      playerCount: state.playerCount,
      target: TARGET_SCORE,
      teams: teamsOf(state.playerCount),
      handNumber: hand.number,
      leader: hand.leader,
      turn: finished ? null : hand.turn,
      line: hand.line.map((tile) => [...tile] as DominoesTile),
      ends: endsOf(hand.line),
      boneyardCount: hand.boneyard.length,
      tileCounts: seatsOf(state.playerCount).map((one) =>
        state.retired.includes(one) ? 0 : (hand.hands[one] ?? []).length,
      ),
      hand: seat === null ? null : sortTiles(hand.hands[seat] ?? []),
      playable: !finished && seat === hand.turn ? playableOf(hand, seat) : [],
      scores: [...state.scores],
      retiredSeats: [...state.retired],
      lastHand: state.lastHand,
    };
  },
};
