import type {
  EngineResponse,
  GameEngine,
  GameStatus,
  Rejected,
  Seat,
  SeatResult,
} from '../../contract.js';
import { isRandomState, randomInt, type RandomState, seedRandom, shuffle } from '../../random.js';
import type {
  BlindFiveAction,
  BlindFiveClue,
  BlindFiveDeclaration,
  BlindFiveDots,
  BlindFiveEvent,
  BlindFiveOutReason,
  BlindFiveRejectionReason,
  BlindFiveSettings,
  BlindFiveStandTile,
  BlindFiveStep,
  BlindFiveSuit,
  BlindFiveTile,
  BlindFiveView,
} from './types.js';

export const BLIND_FIVE_SLUG = 'blind-five';
export const BLIND_FIVE_VERSION = '1.0.0';

/** Las fichas van del 1 al 60, todas distintas (CA3). */
export const TILE_COUNT = 60;

/** Fichas de cada atril: una de cada palo. */
export const STAND_SIZE = 5;

export const SUITS: readonly BlindFiveSuit[] = ['S1', 'S2', 'S3', 'S4', 'S5'];

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

// --- Catálogo (CA3) -----------------------------------------------------------

/** El palo va de 5 en 5: 1, 6, 11… son `S1`; 2, 7, 12…, `S2`; y así hasta `S5`. */
export function suitOf(number: number): BlindFiveSuit {
  return SUITS[(number - 1) % SUITS.length] as BlindFiveSuit;
}

/** Los puntos van por tramos de 5 que se repiten cada 15: 1 a 5, 1 punto; 6 a 10, 2; 11 a 15, 3; 16 a 20, 1… */
export function dotsOf(number: number): BlindFiveDots {
  return (Math.floor(((number - 1) % 15) / 5) + 1) as BlindFiveDots;
}

function tileOf(number: number): BlindFiveTile {
  return { number, suit: suitOf(number), dots: dotsOf(number) };
}

/** Las 60 fichas, del 1 al 60. */
export const CATALOG: readonly BlindFiveTile[] = Array.from({ length: TILE_COUNT }, (_, index) =>
  tileOf(index + 1),
);

// --- Estado -------------------------------------------------------------------

/** Un asiento fuera del juego, y por qué (CA11 y CA13). */
export interface BlindFiveOut {
  readonly seat: Seat;
  readonly reason: BlindFiveOutReason;
}

/**
 * Estado del juego. Es un valor JSON plano, y es interno: la plataforma lo
 * guarda sin interpretarlo y los clientes solo reciben su vista.
 */
export interface BlindFiveState {
  readonly playerCount: number;
  /** El estado del generador de azar, que decide qué ficha sale al revelar. */
  readonly random: RandomState;
  /** `stands[asiento]`: sus cinco números, de menor a mayor, uno de cada palo. */
  readonly stands: readonly (readonly number[])[];
  /** Las fichas boca abajo, de menor a mayor. Al revelar, el azar elige una del palo pedido. */
  readonly supply: readonly number[];
  /** Las fichas boca arriba, de menor a mayor. */
  readonly faceUp: readonly number[];
  /** Las fichas que han estado boca arriba, en el orden en que se vieron, desde las 5 iniciales. */
  readonly revealed: readonly number[];
  /** Las pistas dadas, en orden. Cada ficha usada en una pista ya no está boca arriba (CA8). */
  readonly clues: readonly BlindFiveClue[];
  readonly declarations: readonly BlindFiveDeclaration[];
  /** Los asientos fuera, en el orden en que salieron. */
  readonly out: readonly BlindFiveOut[];
  /** A quién le toca. Siempre un asiento que sigue en juego mientras la partida sigue. */
  readonly turn: Seat;
  /** En qué paso del turno está. */
  readonly step: BlindFiveStep;
  /** Quien acertó. `null` si nadie ha acertado todavía. */
  readonly winner: Seat | null;
}

// --- Piezas -------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidAction(reason: BlindFiveRejectionReason): Rejected {
  return { ok: false, code: 'INVALID_ACTION', reason };
}

function seatsOf(playerCount: number): Seat[] {
  return Array.from({ length: playerCount }, (_, seat) => seat);
}

const ascending = (a: number, b: number) => a - b;

const isOut = (state: Pick<BlindFiveState, 'out'>, seat: Seat) =>
  state.out.some((one) => one.seat === seat);

function inPlay(state: Pick<BlindFiveState, 'playerCount' | 'out'>): Seat[] {
  return seatsOf(state.playerCount).filter((seat) => !isOut(state, seat));
}

/** El siguiente asiento que sigue en juego después de `seat`. */
function nextInPlay(state: Pick<BlindFiveState, 'playerCount' | 'out'>, seat: Seat): Seat {
  for (let step = 1; step <= state.playerCount; step += 1) {
    const next = (seat + step) % state.playerCount;
    if (!isOut(state, next)) return next;
  }
  return seat;
}

/** El primer paso de un turno: revelar si queda pozo; si no, pista si queda algo boca arriba; si no, cantar (CA12). */
function firstStep(state: Pick<BlindFiveState, 'supply' | 'faceUp'>): BlindFiveStep {
  if (state.supply.length > 0) return 'REVEAL';
  return state.faceUp.length > 0 ? 'CLUE' : 'DECLARE_ONLY';
}

/** Pasa el turno al siguiente asiento en juego, en su primer paso. */
function passTurn(state: BlindFiveState, from: Seat): BlindFiveState {
  return { ...state, turn: nextInPlay(state, from), step: firstStep(state) };
}

/** Quien gana, si el juego terminó: quien acertó o, si queda uno solo en juego, ese (CA11). */
function winnerOf(state: BlindFiveState): Seat | null {
  if (state.winner !== null) return state.winner;
  const playing = inPlay(state);
  return playing.length === 1 ? (playing[0] as Seat) : null;
}

function finalResults(state: BlindFiveState): SeatResult[] | null {
  const winner = winnerOf(state);
  if (winner === null) return null;
  return seatsOf(state.playerCount).map((seat) => ({
    seat,
    outcome: seat === winner ? 'WIN' : 'LOSS',
  }));
}

function statusOf(state: BlindFiveState): GameStatus {
  const results = finalResults(state);
  if (results) return { finished: true, results };
  return { finished: false, activeSeats: [state.turn] };
}

/** Saca a un asiento del juego y, si le tocaba y la partida sigue, pasa el turno. */
function removeSeat(state: BlindFiveState, seat: Seat, reason: BlindFiveOutReason): BlindFiveState {
  const removed: BlindFiveState = { ...state, out: [...state.out, { seat, reason }] };
  if (winnerOf(removed) !== null || state.turn !== seat) return removed;
  return passTurn(removed, seat);
}

// --- Acciones -----------------------------------------------------------------

type Applied = EngineResponse<{
  state: BlindFiveState;
  action: BlindFiveAction;
  events: BlindFiveEvent[];
}>;

function reveal(state: BlindFiveState, seat: Seat, input: Record<string, unknown>): Applied {
  const { suit } = input;
  if (typeof suit !== 'string' || !SUITS.includes(suit as BlindFiveSuit)) {
    return invalidAction('MALFORMED_ACTION');
  }
  if (state.step === 'DECLARE_ONLY') return invalidAction('MUST_DECLARE');
  if (state.step !== 'REVEAL') return invalidAction('WRONG_STEP');
  const candidates = state.supply.filter((number) => suitOf(number) === suit);
  if (candidates.length === 0) return invalidAction('SUIT_EXHAUSTED');

  const drawn = randomInt(state.random, candidates.length);
  const tile = candidates[drawn.value] as number;
  const next: BlindFiveState = {
    ...state,
    random: drawn.state,
    supply: state.supply.filter((number) => number !== tile),
    faceUp: [...state.faceUp, tile].sort(ascending),
    revealed: [...state.revealed, tile],
    step: 'CLUE',
  };
  return {
    ok: true,
    value: {
      state: next,
      action: { type: 'REVEAL', suit: suit as BlindFiveSuit },
      events: [{ type: 'TILE_REVEALED', seat, tile }],
    },
  };
}

function clue(state: BlindFiveState, seat: Seat, input: Record<string, unknown>): Applied {
  const { tile, clue: kind, position } = input;
  if (!Number.isInteger(tile) || (kind !== 'SORT' && kind !== 'COMPARE')) {
    return invalidAction('MALFORMED_ACTION');
  }
  if (kind === 'COMPARE' && !Number.isInteger(position)) return invalidAction('MALFORMED_ACTION');
  if (state.step === 'DECLARE_ONLY') return invalidAction('MUST_DECLARE');
  if (state.step !== 'CLUE') return invalidAction('WRONG_STEP');
  const number = tile as number;
  if (!state.faceUp.includes(number)) return invalidAction('TILE_NOT_FACE_UP');
  const stand = state.stands[seat] ?? [];

  let given: BlindFiveClue;
  let action: BlindFiveAction;
  if (kind === 'SORT') {
    given = { seat, tile: number, clue: 'SORT', slot: stand.filter((own) => own < number).length };
    action = { type: 'CLUE', tile: number, clue: 'SORT' };
  } else {
    const at = position as number;
    if (at < 0 || at >= STAND_SIZE) return invalidAction('POSITION_OUT_OF_RANGE');
    const sameDots = dotsOf(stand[at] as number) === dotsOf(number);
    given = { seat, tile: number, clue: 'COMPARE', position: at, sameDots };
    action = { type: 'CLUE', tile: number, clue: 'COMPARE', position: at };
  }

  // La ficha de la pista sale de las boca arriba y queda junto al atril (CA8).
  const used: BlindFiveState = {
    ...state,
    faceUp: state.faceUp.filter((one) => one !== number),
    clues: [...state.clues, given],
  };
  return {
    ok: true,
    value: {
      state: passTurn(used, seat),
      action,
      events: [{ type: 'CLUE_GIVEN', ...given }],
    },
  };
}

function declare(state: BlindFiveState, seat: Seat, input: Record<string, unknown>): Applied {
  const { numbers } = input;
  if (!Array.isArray(numbers)) return invalidAction('MALFORMED_ACTION');
  const list = numbers as unknown[];
  const valid =
    list.length === STAND_SIZE &&
    list.every(
      (one) => Number.isInteger(one) && (one as number) >= 1 && (one as number) <= TILE_COUNT,
    ) &&
    list.every((one, index) => index === 0 || (list[index - 1] as number) < (one as number));
  // Un error al escribir no elimina a nadie (CA10).
  if (!valid) return invalidAction('INVALID_DECLARATION');

  const guess = list as number[];
  const stand = state.stands[seat] ?? [];
  const correct = guess.every((one, index) => one === stand[index]);
  const declaration: BlindFiveDeclaration = { seat, numbers: [...guess], correct };
  const declared: BlindFiveState = {
    ...state,
    declarations: [...state.declarations, declaration],
  };
  const events: BlindFiveEvent[] = [{ type: 'DECLARED', ...declaration }];
  let next: BlindFiveState;
  if (correct) {
    next = { ...declared, winner: seat };
  } else {
    next = removeSeat(declared, seat, 'WRONG_DECLARATION');
    events.push({ type: 'SEAT_OUT', seat, reason: 'WRONG_DECLARATION' });
  }
  return {
    ok: true,
    value: { state: next, action: { type: 'DECLARE', numbers: [...guess] }, events },
  };
}

// --- Restaurar ------------------------------------------------------------------

const isSeatOf = (playerCount: number) => (value: unknown) =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) < playerCount;

const isTileNumber = (value: unknown) =>
  Number.isInteger(value) && (value as number) >= 1 && (value as number) <= TILE_COUNT;

function parseNumbers(value: unknown, sorted: boolean): number[] | null {
  if (!Array.isArray(value) || !value.every(isTileNumber)) return null;
  const numbers = value as number[];
  if (sorted && numbers.some((one, index) => index > 0 && (numbers[index - 1] as number) >= one)) {
    return null;
  }
  return [...numbers];
}

function parseClue(value: unknown, playerCount: number): BlindFiveClue | null {
  if (!isRecord(value)) return null;
  const { seat, tile, clue: kind, slot, position, sameDots } = value;
  if (!isSeatOf(playerCount)(seat) || !isTileNumber(tile)) return null;
  if (kind === 'SORT') {
    if (!Number.isInteger(slot) || (slot as number) < 0 || (slot as number) > STAND_SIZE) {
      return null;
    }
    return { seat: seat as Seat, tile: tile as number, clue: 'SORT', slot: slot as number };
  }
  if (kind === 'COMPARE') {
    if (
      !Number.isInteger(position) ||
      (position as number) < 0 ||
      (position as number) >= STAND_SIZE
    ) {
      return null;
    }
    if (typeof sameDots !== 'boolean') return null;
    return {
      seat: seat as Seat,
      tile: tile as number,
      clue: 'COMPARE',
      position: position as number,
      sameDots,
    };
  }
  return null;
}

function parseDeclaration(value: unknown, playerCount: number): BlindFiveDeclaration | null {
  if (!isRecord(value)) return null;
  const { seat, numbers, correct } = value;
  const parsed = parseNumbers(numbers, true);
  if (!isSeatOf(playerCount)(seat) || !parsed || parsed.length !== STAND_SIZE) return null;
  if (typeof correct !== 'boolean') return null;
  return { seat: seat as Seat, numbers: parsed, correct };
}

/** Comprueba que un snapshot guardado es un estado de este motor. */
function parseState(snapshot: unknown): BlindFiveState | null {
  if (!isRecord(snapshot)) return null;
  const { playerCount, random, stands, supply, faceUp, revealed, clues, declarations, out } =
    snapshot;
  const { turn, step, winner } = snapshot;
  if (!Number.isInteger(playerCount)) return null;
  const count = playerCount as number;
  if (count < 2 || count > 4 || !isRandomState(random)) return null;
  const isSeat = isSeatOf(count);

  if (!Array.isArray(stands) || stands.length !== count) return null;
  const parsedStands = (stands as unknown[]).map((stand) => parseNumbers(stand, true));
  // Cada atril, cinco números en orden, uno de cada palo.
  for (const stand of parsedStands) {
    if (!stand || stand.length !== STAND_SIZE) return null;
    if (new Set(stand.map(suitOf)).size !== SUITS.length) return null;
  }
  const parsedSupply = parseNumbers(supply, true);
  const parsedFaceUp = parseNumbers(faceUp, true);
  const parsedRevealed = parseNumbers(revealed, false);
  if (!parsedSupply || !parsedFaceUp || !parsedRevealed) return null;
  if (!Array.isArray(clues) || !Array.isArray(declarations) || !Array.isArray(out)) return null;
  const parsedClues = (clues as unknown[]).map((one) => parseClue(one, count));
  const parsedDeclarations = (declarations as unknown[]).map((one) => parseDeclaration(one, count));
  if (parsedClues.some((one) => one === null) || parsedDeclarations.some((one) => one === null)) {
    return null;
  }
  const parsedOut: BlindFiveOut[] = [];
  for (const one of out as unknown[]) {
    if (!isRecord(one) || !isSeat(one.seat)) return null;
    if (one.reason !== 'WRONG_DECLARATION' && one.reason !== 'RETIRED') return null;
    parsedOut.push({ seat: one.seat as Seat, reason: one.reason });
  }
  if (new Set(parsedOut.map((one) => one.seat)).size !== parsedOut.length) return null;
  if (!isSeat(turn) || (winner !== null && !isSeat(winner))) return null;
  if (step !== 'REVEAL' && step !== 'CLUE' && step !== 'DECLARE_ONLY') return null;

  // Las 60 fichas, cada una una vez, entre los atriles, el pozo, las boca arriba y las pistas.
  const all = [
    ...(parsedStands as number[][]).flat(),
    ...parsedSupply,
    ...parsedFaceUp,
    ...(parsedClues as BlindFiveClue[]).map((one) => one.tile),
  ];
  if (all.length !== TILE_COUNT || new Set(all).size !== TILE_COUNT) return null;
  // Lo que ha estado boca arriba es lo que está boca arriba más lo usado en pistas.
  const seen = new Set([
    ...parsedFaceUp,
    ...(parsedClues as BlindFiveClue[]).map((one) => one.tile),
  ]);
  if (parsedRevealed.length !== seen.size || !parsedRevealed.every((one) => seen.has(one))) {
    return null;
  }

  const state: BlindFiveState = {
    playerCount: count,
    random: [...random] as unknown as RandomState,
    stands: parsedStands as number[][],
    supply: parsedSupply,
    faceUp: parsedFaceUp,
    revealed: parsedRevealed,
    clues: parsedClues as BlindFiveClue[],
    declarations: parsedDeclarations as BlindFiveDeclaration[],
    out: parsedOut,
    turn: turn as Seat,
    step,
    winner: winner as Seat | null,
  };
  // Mientras la partida sigue, le toca a alguien que sigue en juego.
  if (winnerOf(state) === null && isOut(state, state.turn)) return null;
  return state;
}

// --- Vista ----------------------------------------------------------------------

function standView(numbers: readonly number[], visible: boolean): BlindFiveStandTile[] {
  return numbers.map((number) =>
    visible
      ? { suit: suitOf(number), number, dots: dotsOf(number) }
      : { suit: suitOf(number), number: null, dots: null },
  );
}

// --- Motor ----------------------------------------------------------------------

/**
 * Motor de Cinco a ciegas, versión 1.0.0 (ADR-022, CA2 a CA15).
 *
 * De 2 a 4 jugadores. Cada uno ve los cinco números de los demás, pero no
 * los suyos. En su turno revela una ficha y pide una pista, que da el
 * motor. Cualquiera puede cantar sus cinco en cualquier momento, también
 * fuera de turno: si acierta, gana; si falla, queda fuera.
 */
export const blindFiveEngine: GameEngine<
  BlindFiveSettings,
  BlindFiveState,
  BlindFiveAction,
  BlindFiveEvent,
  BlindFiveView
> = {
  gameSlug: BLIND_FIVE_SLUG,
  gameVersion: BLIND_FIVE_VERSION,

  metadata: {
    minPlayers: 2,
    maxPlayers: 4,
    timeControls: {
      // De 6 a 12 turnos por jugador; pensar en el turno de otro no gasta reloj (CA14).
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

  parseSettings(input): EngineResponse<BlindFiveSettings> {
    if (isRecord(input) && Object.keys(input).length === 0) return { ok: true, value: {} };
    return { ok: false, code: 'INVALID_SETTINGS' };
  },

  createInitialState({ playerCount, seed }) {
    // Cada palo se baraja aparte: cada atril recibe uno de cada palo, y se
    // ponen boca arriba cinco más, uno de cada palo (CA5).
    let random = seedRandom(seed);
    const stands: number[][] = seatsOf(playerCount).map(() => []);
    const faceUp: number[] = [];
    const supply: number[] = [];
    for (const suit of SUITS) {
      const shuffled = shuffle(
        CATALOG.filter((tile) => tile.suit === suit).map((tile) => tile.number),
        random,
      );
      random = shuffled.state;
      const [up, ...rest] = shuffled.items.slice(playerCount);
      for (const seat of seatsOf(playerCount)) stands[seat]?.push(shuffled.items[seat] as number);
      faceUp.push(up as number);
      supply.push(...rest);
    }
    const sortedFaceUp = [...faceUp].sort(ascending);
    return {
      playerCount,
      random,
      stands: stands.map((stand) => [...stand].sort(ascending)),
      supply: supply.sort(ascending),
      faceUp: sortedFaceUp,
      revealed: [...sortedFaceUp],
      clues: [],
      declarations: [],
      out: [],
      turn: 0,
      step: 'REVEAL',
      winner: null,
    };
  },

  restoreState(snapshot) {
    const state = parseState(snapshot);
    return state ? { ok: true, value: state } : { ok: false, code: 'INVALID_GAME_STATE' };
  },

  getStatus: statusOf,

  applyAction(state, seat, input) {
    if (finalResults(state)) return { ok: false, code: 'GAME_ALREADY_FINISHED' };
    // Quien queda fuera ya no juega, ni siquiera cantando.
    if (!isSeatOf(state.playerCount)(seat) || isOut(state, seat)) {
      return { ok: false, code: 'NOT_YOUR_TURN' };
    }
    const type = isRecord(input) ? input.type : undefined;
    // Cantar vale en cualquier momento, le toque o no (CA9; contrato, M10).
    if (type === 'DECLARE') return declare(state, seat, input as Record<string, unknown>);
    if (seat !== state.turn) return { ok: false, code: 'NOT_YOUR_TURN' };
    if (type === 'REVEAL') return reveal(state, seat, input as Record<string, unknown>);
    if (type === 'CLUE') return clue(state, seat, input as Record<string, unknown>);
    return invalidAction('MALFORMED_ACTION');
  },

  retireSeat(state, seat) {
    // Quien ya quedó fuera por cantar mal no cambia nada (CA20).
    if (isOut(state, seat) || finalResults(state)) return { state, events: [] };
    return {
      state: removeSeat(state, seat, 'RETIRED'),
      events: [{ type: 'SEAT_OUT', seat, reason: 'RETIRED' }],
    };
  },

  getView(state, viewer) {
    const finished = finalResults(state) !== null;
    const winner = winnerOf(state);
    const looker = viewer !== null && isSeatOf(state.playerCount)(viewer) ? viewer : null;
    const supplyBySuit = Object.fromEntries(
      SUITS.map((suit) => [suit, state.supply.filter((number) => suitOf(number) === suit).length]),
    ) as Record<BlindFiveSuit, number>;
    return {
      playerCount: state.playerCount,
      catalog: CATALOG.map((tile) => ({ ...tile })),
      turn: finished ? null : state.turn,
      step: finished ? null : state.step,
      seats: seatsOf(state.playerCount).map((seat) => {
        // El atril propio solo se ve al quedar fuera o al terminar (CA11);
        // sin asiento, ninguno hasta el final.
        const visible = finished || (looker !== null && (looker !== seat || isOut(state, seat)));
        return {
          stand: standView(state.stands[seat] ?? [], visible),
          clues: state.clues.filter((one) => one.seat === seat),
          out: state.out.find((one) => one.seat === seat)?.reason ?? null,
        };
      }),
      faceUp: state.faceUp.map(tileOf),
      revealed: [...state.revealed],
      supplyBySuit,
      declarations: state.declarations.map((one) => ({ ...one, numbers: [...one.numbers] })),
      winner,
    };
  },
};
