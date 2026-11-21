/**
 * Mareas: simulación de equilibrio (ADR-023, MA19). Juega partidas enteras
 * con jugadores automáticos y resume las puntuaciones, para ajustar el
 * catálogo propio a la escala que se busca (ganador de 55 a 65 puntos). La
 * plataforma no lo usa; lo usan las pruebas.
 */
import type { Seat } from '../../contract.js';
import { randomInt, type RandomState, seedRandom } from '../../random.js';
import { tidesEngine } from './engine.js';
import { candidateActions } from './legal.js';
import {
  BASICS,
  islandCard,
  leaderOf,
  orderCard,
  orderCost,
  scoreOf,
  seatOf,
  type TidesState,
} from './rules.js';
import type { TidesAction, TidesScoreView } from './types.js';

export type TidesBot = 'RANDOM' | 'GREEDY';

export interface TidesSimulationOptions {
  readonly games: number;
  readonly playerCount: number;
  readonly seed: string;
  /** Cómo juega cada asiento. Por defecto, todos `GREEDY`. */
  readonly bots?: readonly TidesBot[];
  readonly maxSteps?: number;
}

export interface TidesGameRecord {
  readonly rounds: number;
  readonly steps: number;
  readonly scores: readonly TidesScoreView[];
  readonly winners: readonly Seat[];
}

export interface TidesSimulationReport {
  readonly playerCount: number;
  readonly games: readonly TidesGameRecord[];
  /** Partidas que no terminaron dentro del límite de jugadas. */
  readonly unfinished: number;
  readonly winner: { readonly mean: number; readonly min: number; readonly max: number };
  readonly mean: number;
  readonly rounds: number;
  /** Victorias por asiento, contando las compartidas. */
  readonly winsBySeat: readonly number[];
  /** Media de puntos por fuente, por jugador. */
  readonly bySource: Omit<TidesScoreView, 'total'>;
}

/**
 * Lo que vale un estado para un asiento: sus puntos, lo que lleva recogido y
 * las islas que domina ahora mismo. Es una estimación para elegir jugada.
 */
function worth(state: TidesState, seat: Seat): number {
  const one = seatOf(state, seat);
  const score = state.scores?.[seat] ?? scoreOf(one);
  let islands = 0;
  for (const slot of state.row) {
    const leader = leaderOf(slot);
    const points = islandCard(slot.id).points;
    if (leader === seat) islands += points * 0.8;
    else if (leader !== null) islands -= points * 0.25;
  }
  // Lo recogido vale más si acerca un encargo que se puede cumplir.
  let progress = 0;
  for (const id of [...state.market, ...one.promised]) {
    if (!id) continue;
    const card = orderCard(id);
    const total = orderCost(card);
    const covered = Math.min(
      total,
      BASICS.reduce((sum, basic) => sum + Math.min(card.cost[basic], one.ingredients[basic]), 0) +
        one.ingredients.PEARL,
    );
    progress = Math.max(progress, (card.points + 1) * (covered / total) ** 2);
  }
  const basics = BASICS.reduce((sum, basic) => sum + one.ingredients[basic], 0);
  const promised = one.promised.length * 0.5;
  return (
    score.total + basics * 0.3 + one.ingredients.PEARL * 0.6 + islands + progress * 0.8 + promised
  );
}

function choose(
  state: TidesState,
  seat: Seat,
  bot: TidesBot,
  random: RandomState,
): { action: TidesAction; next: TidesState; random: RandomState } {
  const options: { action: TidesAction; next: TidesState }[] = [];
  for (const action of candidateActions(state, seat)) {
    const result = tidesEngine.applyAction(state, seat, action);
    if (result.ok) options.push({ action: result.value.action, next: result.value.state });
  }
  if (options.length === 0) throw new Error(`Sin jugadas para el asiento ${seat}`);
  const roll = randomInt(random, options.length);
  if (bot === 'RANDOM')
    return { ...(options[roll.value] as (typeof options)[number]), random: roll.state };
  let best = options[roll.value] as (typeof options)[number];
  let bestWorth = -Infinity;
  for (const [index, option] of options.entries()) {
    // Terminar el turno pronto apenas cuesta; se prefiere si nada mejora.
    const bonus = option.action.type === 'END_TURN' ? 0.05 : 0;
    // Desempate fijo que cambia con la tirada, para no jugar siempre igual.
    const jitter = ((index * 7919 + roll.value * 104729) % 97) / 9700;
    const value = worth(option.next, seat) + bonus + jitter;
    if (value > bestWorth) {
      best = option;
      bestWorth = value;
    }
  }
  return { ...best, random: roll.state };
}

/** Juega una partida y devuelve cómo acabó, o `null` si pasó del límite. */
export function playGame(
  playerCount: number,
  seed: string,
  bots: readonly TidesBot[],
  maxSteps = 4000,
): TidesGameRecord | null {
  let state = tidesEngine.createInitialState({ playerCount, seed, settings: {} });
  let random = seedRandom(`${seed}:bots`);
  for (let steps = 0; steps < maxSteps; steps += 1) {
    const status = tidesEngine.getStatus(state);
    if (status.finished) {
      return {
        rounds: state.round,
        steps,
        scores: state.scores ?? [],
        winners: state.winners,
      };
    }
    const seat = status.activeSeats[0] as Seat;
    const chosen = choose(state, seat, bots[seat] ?? 'GREEDY', random);
    state = chosen.next;
    random = chosen.random;
  }
  return null;
}

const mean = (values: readonly number[]) =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

export function simulate(options: TidesSimulationOptions): TidesSimulationReport {
  const { games: count, playerCount, seed } = options;
  const bots = options.bots ?? Array.from({ length: playerCount }, () => 'GREEDY' as const);
  const games: TidesGameRecord[] = [];
  let unfinished = 0;
  for (let index = 0; index < count; index += 1) {
    const record = playGame(playerCount, `${seed}-${index}`, bots, options.maxSteps);
    if (record) games.push(record);
    else unfinished += 1;
  }
  const winnerScores = games.flatMap((game) =>
    game.winners.map((seat) => game.scores[seat]?.total ?? 0),
  );
  const all = games.flatMap((game) => game.scores);
  const winsBySeat = Array.from(
    { length: playerCount },
    (_, seat) => games.filter((game) => game.winners.includes(seat)).length,
  );
  return {
    playerCount,
    games,
    unfinished,
    winner: {
      mean: mean(winnerScores),
      min: Math.min(...winnerScores),
      max: Math.max(...winnerScores),
    },
    mean: mean(all.map((score) => score.total)),
    rounds: mean(games.map((game) => game.rounds)),
    winsBySeat,
    bySource: {
      islands: mean(all.map((score) => score.islands)),
      orders: mean(all.map((score) => score.orders)),
      birds: mean(all.map((score) => score.birds)),
      tokens: mean(all.map((score) => score.tokens)),
      leftovers: mean(all.map((score) => score.leftovers)),
    },
  };
}
