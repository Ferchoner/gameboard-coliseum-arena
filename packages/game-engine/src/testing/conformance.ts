import type {
  AnyGameEngine,
  EngineErrorCode,
  EngineResponse,
  Seat,
  SeatRetirementReason,
} from '../contract.js';
import { metadataProblems } from '../metadata.js';

/**
 * Comprobación común de las reglas del contrato del motor (ADR-018,
 * decisión Z3). No depende de ninguna herramienta de pruebas: devuelve la
 * lista de reglas incumplidas, y cada prueba decide qué hacer con ella.
 */

/** Lo que cada motor aporta para que se le pueda comprobar. */
export interface ConformanceFixture {
  /** Opciones de prueba, tal como llegarían del cliente al crear la sala. */
  readonly settings: unknown;
  /**
   * Acciones que probar desde un estado, para un asiento. Cuando el asiento
   * puede jugar, al menos una debe ser válida. Puede incluir acciones que el
   * juego rechace: también se comprueban.
   */
  candidateActions(state: unknown, seat: Seat): readonly unknown[];
  /** Cuántas partidas se juegan. Por defecto, 20. */
  readonly games?: number;
  /** Cuántos pasos puede durar una partida antes de darla por interminable. Por defecto, 1000. */
  readonly maxSteps?: number;
  /** Semilla del generador que elige asientos y acciones. Por defecto, `conformance`. */
  readonly seed?: string;
  /**
   * Solo para juegos con jugadas fuera de turno (ADR-022, decisión CA19):
   * si el juego puede aceptar esta acción de un asiento que no está activo.
   * A esas acciones no se les exige `NOT_YOUR_TURN`; de vez en cuando, la
   * comprobación juega una desde un asiento que no está activo.
   */
  readonly allowedOutOfTurn?: (action: unknown) => boolean;
}

const ENGINE_ERROR_CODES: readonly EngineErrorCode[] = [
  'INVALID_SETTINGS',
  'INVALID_ACTION',
  'NOT_YOUR_TURN',
  'GAME_ALREADY_FINISHED',
  'INVALID_GAME_STATE',
];
const RETIREMENT_REASONS: readonly SeatRetirementReason[] = [
  'TIMEOUT',
  'RESIGNATION',
  'ABANDONMENT',
];
const NOT_A_STATE: readonly unknown[] = [null, 42, 'no es un estado', []];

/**
 * Comprueba un motor contra las reglas de su contrato jugando partidas con
 * un generador con semilla. Devuelve las reglas incumplidas, sin repetir;
 * una lista vacía si las cumple todas.
 */
export function checkEngineConformance(
  engine: AnyGameEngine,
  fixture: ConformanceFixture,
): string[] {
  const problems = new Set<string>();
  const report = (problem: string) => problems.add(problem);

  for (const problem of metadataProblems(engine.metadata)) report(`metadatos: ${problem}`);

  const settings = guard(report, 'parseSettings', () => engine.parseSettings(fixture.settings));
  if (!settings?.ok) {
    report('parseSettings rechaza las opciones de prueba');
    return [...problems];
  }

  for (const snapshot of NOT_A_STATE) {
    const restored = guard(report, 'restoreState', () => engine.restoreState(snapshot));
    if (restored && (restored.ok || restored.code !== 'INVALID_GAME_STATE')) {
      report(
        `restoreState no rechaza con INVALID_GAME_STATE lo que no es un estado: ${JSON.stringify(snapshot)}`,
      );
    }
  }

  const random = seededRandom(fixture.seed ?? 'conformance');
  const games = fixture.games ?? 20;
  const { minPlayers, maxPlayers } = engine.metadata;

  for (let game = 0; game < games; game += 1) {
    const playerCount = minPlayers + (game % (maxPlayers - minPlayers + 1));
    const setup = {
      playerCount,
      settings: settings.value,
      seed: `${fixture.seed ?? 'conformance'}-${game}`,
    };
    const initial = guard(report, 'createInitialState', () => engine.createInitialState(setup));
    if (initial === undefined) continue;
    const again = guard(report, 'createInitialState', () => engine.createInitialState(setup));
    if (canonical(initial) !== canonical(again)) {
      report(
        'createInitialState no es determinista: con la misma preparación da estados distintos',
      );
    }
    checkState(engine, initial, playerCount, report);
    const status = engine.getStatus(initial);
    if (status.finished) {
      report('el juego empieza ya terminado');
      continue;
    }
    if (playerCount === 2) checkRetirements(engine, initial, report);

    play(engine, fixture, initial, playerCount, random, report);
  }

  return [...problems];
}

/** Juega una partida hasta el final, comprobando cada paso. */
function play(
  engine: AnyGameEngine,
  fixture: ConformanceFixture,
  initial: unknown,
  playerCount: number,
  random: () => number,
  report: (problem: string) => void,
): void {
  let state = initial;
  const maxSteps = fixture.maxSteps ?? 1000;

  for (let step = 0; step < maxSteps; step += 1) {
    const status = engine.getStatus(state);
    if (status.finished) {
      checkFinished(engine, fixture, state, playerCount, report);
      return;
    }

    const frozen = deepFreeze(clone(state));
    const seat = pick(status.activeSeats, random) as Seat;

    // Un asiento que no puede jugar no juega, aunque la acción sea válida,
    // salvo las jugadas que el juego admite fuera de turno (CA19).
    const outOfTurn = fixture.allowedOutOfTurn ?? (() => false);
    const waiting = seats(playerCount).filter((one) => !status.activeSeats.includes(one));
    for (const other of waiting) {
      for (const action of fixture.candidateActions(state, seat)) {
        if (outOfTurn(action)) continue;
        const response = guard(report, 'applyAction', () =>
          engine.applyAction(frozen, other, action),
        );
        if (response && (response.ok || response.code !== 'NOT_YOUR_TURN')) {
          report(
            'applyAction no rechaza con NOT_YOUR_TURN la acción de un asiento que no puede jugar',
          );
        }
      }
    }

    // De vez en cuando juega fuera de turno un asiento que no está activo (CA19).
    const offTurn =
      fixture.allowedOutOfTurn && waiting.length > 0 && random() < 0.1
        ? (pick(waiting, random) as Seat)
        : null;
    const player = offTurn ?? seat;
    const all = fixture.candidateActions(state, player);
    const candidates = shuffle(offTurn === null ? all : all.filter(outOfTurn), random);
    let next: unknown;
    for (const action of candidates) {
      const first = guard(report, 'applyAction', () => engine.applyAction(frozen, player, action));
      const second = guard(report, 'applyAction', () => engine.applyAction(frozen, player, action));
      if (first === undefined) continue;
      if (canonical(first) !== canonical(second)) {
        report(
          'applyAction no es determinista: la misma acción sobre el mismo estado da resultados distintos',
        );
      }
      if (!first.ok) {
        checkRejection(first, report);
        continue;
      }
      checkJson(first.value.action, 'la acción aceptada', report);
      checkJson(first.value.events, 'los eventos', report);
      next = first.value.state;
      break;
    }

    if (next === undefined) {
      // Que ninguna jugada fuera de turno valga en un estado no es un fallo.
      if (offTurn !== null) continue;
      report('ninguna de las acciones de prueba fue aceptada en un estado en curso');
      return;
    }
    state = next;
    checkState(engine, state, playerCount, report);
    if (playerCount === 2 && random() < 0.1) checkRetirements(engine, state, report);
  }
  report(`una partida no terminó en ${maxSteps} pasos`);
}

/** Un estado cualquiera: serializable, recuperable, con asientos activos válidos y vistas serializables. */
function checkState(
  engine: AnyGameEngine,
  state: unknown,
  playerCount: number,
  report: (problem: string) => void,
): void {
  checkJson(state, 'el estado', report);
  const restored = guard(report, 'restoreState', () =>
    engine.restoreState(JSON.parse(JSON.stringify(state))),
  );
  if (!restored?.ok) {
    report('restoreState rechaza un estado que el propio motor creó, después de pasarlo por JSON');
  } else if (canonical(restored.value) !== canonical(state)) {
    report('restoreState no devuelve el mismo estado que recibe');
  }

  const status = engine.getStatus(state);
  if (!status.finished) {
    const active = status.activeSeats;
    if (active.length === 0) report('getStatus devuelve una lista vacía de asientos activos');
    if (new Set(active).size !== active.length) report('getStatus repite un asiento activo');
    if (active.some((seat) => !Number.isInteger(seat) || seat < 0 || seat >= playerCount)) {
      report('getStatus devuelve como activo un asiento que no es de la partida');
    }
  }
  for (const viewer of [...seats(playerCount), null]) {
    const view = guard(report, 'getView', () => engine.getView(deepFreeze(clone(state)), viewer));
    checkJson(view, 'la vista', report);
  }
}

/** El final: un resultado por asiento, y ninguna acción más. */
function checkFinished(
  engine: AnyGameEngine,
  fixture: ConformanceFixture,
  state: unknown,
  playerCount: number,
  report: (problem: string) => void,
): void {
  const status = engine.getStatus(state);
  if (!status.finished) return;
  const resultSeats = status.results.map((result) => result.seat).sort((a, b) => a - b);
  if (canonical(resultSeats) !== canonical(seats(playerCount))) {
    report('el resultado no tiene exactamente un resultado por asiento');
  }
  if (status.results.some((result) => !['WIN', 'LOSS', 'DRAW'].includes(result.outcome))) {
    report('el resultado tiene un desenlace desconocido');
  }
  const frozen = deepFreeze(clone(state));
  for (const seat of seats(playerCount)) {
    for (const action of fixture.candidateActions(state, seat)) {
      const response = guard(report, 'applyAction', () => engine.applyAction(frozen, seat, action));
      if (response && (response.ok || response.code !== 'GAME_ALREADY_FINISHED')) {
        report('applyAction no rechaza con GAME_ALREADY_FINISHED una acción tras el final');
      }
    }
  }
}

/** En un juego de dos, retirar un asiento termina el juego: pierde el retirado y gana el otro (7.18). */
function checkRetirements(
  engine: AnyGameEngine,
  state: unknown,
  report: (problem: string) => void,
): void {
  const frozen = deepFreeze(clone(state));
  for (const seat of [0, 1]) {
    for (const reason of RETIREMENT_REASONS) {
      const retirement = guard(report, 'retireSeat', () => engine.retireSeat(frozen, seat, reason));
      if (retirement === undefined) continue;
      checkJson(retirement.state, 'el estado tras una retirada', report);
      checkJson(retirement.events, 'los eventos de una retirada', report);
      const status = engine.getStatus(retirement.state);
      const outcomes = status.finished
        ? Object.fromEntries(status.results.map((result) => [result.seat, result.outcome]))
        : null;
      if (!outcomes || outcomes[seat] !== 'LOSS' || outcomes[1 - seat] !== 'WIN') {
        report(
          `en un juego de dos, retirar un asiento por ${reason} no termina con su derrota y la victoria del otro`,
        );
      }
    }
  }
}

function checkRejection(
  response: Extract<EngineResponse<unknown>, { ok: false }>,
  report: (problem: string) => void,
): void {
  if (!ENGINE_ERROR_CODES.includes(response.code)) {
    report(`un rechazo usa un código fuera de la lista cerrada: ${String(response.code)}`);
  }
  if (response.reason !== undefined && typeof response.reason !== 'string') {
    report('el motivo de un rechazo no es un texto');
  }
}

// --- Ayudas ------------------------------------------------------------------

/** Ejecuta una llamada al motor y anota como incumplimiento que lance un error. */
function guard<T>(report: (problem: string) => void, name: string, call: () => T): T | undefined {
  try {
    return call();
  } catch (error) {
    report(
      error instanceof TypeError &&
        /read.only|frozen|not extensible|Cannot (assign|add|delete)/i.test(error.message)
        ? `${name} modifica el estado que recibe`
        : `${name} lanza un error: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/** Anota lo que no es un valor JSON plano (regla 4 del contrato). */
function checkJson(value: unknown, what: string, report: (problem: string) => void): void {
  const problem = jsonProblem(value, '');
  if (problem) report(`${what} no es un valor JSON plano: ${problem}`);
}

function jsonProblem(value: unknown, path: string): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return null;
  if (typeof value === 'number')
    return Number.isFinite(value) ? null : `${path || 'valor'} no es un número finito`;
  if (typeof value !== 'object') return `${path || 'valor'} es de tipo ${typeof value}`;
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const problem = jsonProblem(item, `${path}[${index}]`);
      if (problem) return problem;
    }
    return null;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return `${path || 'valor'} es un objeto de una clase`;
  }
  for (const [key, item] of Object.entries(value)) {
    const problem = jsonProblem(item, path ? `${path}.${key}` : key);
    if (problem) return problem;
  }
  return null;
}

/** Texto JSON con las claves ordenadas, para comparar valores sin depender del orden. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

function seats(playerCount: number): Seat[] {
  return Array.from({ length: playerCount }, (_, seat) => seat);
}

function pick<T>(items: readonly T[], random: () => number): T | undefined {
  return items[Math.floor(random() * items.length)];
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let last = shuffled.length - 1; last > 0; last -= 1) {
    const other = Math.floor(random() * (last + 1));
    [shuffled[last], shuffled[other]] = [shuffled[other] as T, shuffled[last] as T];
  }
  return shuffled;
}

/** Un generador con semilla (mulberry32), para que cada ejecución juegue las mismas partidas. */
function seededRandom(seed: string): () => number {
  let state = 0;
  for (const char of seed) state = (Math.imul(state, 31) + char.charCodeAt(0)) | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
