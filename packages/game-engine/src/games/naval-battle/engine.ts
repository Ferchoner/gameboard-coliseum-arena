import type {
  EngineResponse,
  GameEngine,
  GameStatus,
  Rejected,
  SeatResult,
} from '../../contract.js';
import type {
  NavalBattleAction,
  NavalBattleCell,
  NavalBattleEvent,
  NavalBattleGridView,
  NavalBattleOrientation,
  NavalBattlePhase,
  NavalBattlePlacement,
  NavalBattleRejectionReason,
  NavalBattleSeat,
  NavalBattleSettings,
  NavalBattleShipId,
  NavalBattleShipView,
  NavalBattleShotResult,
  NavalBattleView,
} from './types.js';

export const NAVAL_BATTLE_SLUG = 'naval-battle';
export const NAVAL_BATTLE_VERSION = '1.0.0';

/** Lado de la cuadrícula (X2). */
export const GRID_SIZE = 10;

/** Los barcos de cada flota, en el orden en que se colocan, con su tamaño (X3). */
export const FLEET: readonly { readonly ship: NavalBattleShipId; readonly size: number }[] = [
  { ship: 'S5', size: 5 },
  { ship: 'S4', size: 4 },
  { ship: 'S3A', size: 3 },
  { ship: 'S3B', size: 3 },
  { ship: 'S2', size: 2 },
];

const SEATS = [0, 1] as const;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Estado del juego. Es un valor JSON plano, y es interno: la plataforma lo
 * guarda sin interpretarlo y los clientes solo reciben su vista.
 *
 * No guarda nada que se pueda deducir. La fase sale de si las dos flotas
 * están colocadas; a quién le toca, del número de disparos de cada uno; y
 * el resultado de cada disparo, de la flota del rival.
 */
export interface NavalBattleState {
  /** `fleets[asiento]`: su flota, en el orden de `FLEET`, o `null` si aún no la colocó. */
  readonly fleets: readonly (readonly NavalBattlePlacement[] | null)[];
  /** `shots[asiento]`: los disparos que hizo ese asiento a la cuadrícula del otro, en orden. */
  readonly shots: readonly (readonly NavalBattleCell[])[];
  /** El asiento retirado por tiempo agotado, rendición o abandono. */
  readonly retiredSeat: NavalBattleSeat | null;
}

// --- Piezas ---------------------------------------------------------------

function isSeat(value: unknown): value is NavalBattleSeat {
  return value === 0 || value === 1;
}

function otherSeat(seat: NavalBattleSeat): NavalBattleSeat {
  return seat === 0 ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const sameCell = (a: NavalBattleCell, b: NavalBattleCell) => a.row === b.row && a.col === b.col;

const inGrid = ({ row, col }: NavalBattleCell) =>
  row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;

function sizeOf(ship: NavalBattleShipId): number {
  return FLEET.find((one) => one.ship === ship)?.size ?? 0;
}

/** Las casillas que ocupa un barco colocado. */
export function shipCells(placement: NavalBattlePlacement): NavalBattleCell[] {
  return Array.from({ length: sizeOf(placement.ship) }, (_, step) =>
    placement.orientation === 'H'
      ? { row: placement.row, col: placement.col + step }
      : { row: placement.row + step, col: placement.col },
  );
}

function invalidAction(reason: NavalBattleRejectionReason): Rejected {
  return { ok: false, code: 'INVALID_ACTION', reason };
}

function phaseOf(state: NavalBattleState): NavalBattlePhase {
  return state.fleets.every((fleet) => fleet !== null) ? 'FIRING' : 'PLACEMENT';
}

/** En la fase de disparos, a quién le toca: dispara primero el 0 y se alternan (X6). */
function seatToFire(state: NavalBattleState): NavalBattleSeat {
  return (state.shots[0]?.length ?? 0) > (state.shots[1]?.length ?? 0) ? 1 : 0;
}

const keyOf = ({ row, col }: NavalBattleCell) => row * GRID_SIZE + col;

/**
 * Repasa en orden los disparos contra una flota: el resultado de cada uno y
 * cuántos barcos quedaban hundidos tras él. Una sola pasada, con las
 * casillas tocadas en un conjunto.
 */
function replay(
  fleet: readonly NavalBattlePlacement[],
  shots: readonly NavalBattleCell[],
): { result: NavalBattleShotResult; sunkCount: number }[] {
  const ships = fleet.map((placement) => new Set(shipCells(placement).map(keyOf)));
  const hits = new Set<number>();
  let sunkCount = 0;
  return shots.map((shot) => {
    const key = keyOf(shot);
    const ship = ships.find((cells) => cells.has(key));
    if (!ship || hits.has(key)) return { result: ship ? 'HIT' : 'MISS', sunkCount };
    hits.add(key);
    const sunk = [...ship].every((cell) => hits.has(cell));
    if (sunk) sunkCount += 1;
    return { result: sunk ? 'SUNK' : 'HIT', sunkCount };
  });
}

/** Si los disparos dados hunden ese barco. */
function isSunk(placement: NavalBattlePlacement, shots: readonly NavalBattleCell[]): boolean {
  const fired = new Set(shots.map(keyOf));
  return shipCells(placement).every((cell) => fired.has(keyOf(cell)));
}

/** Los barcos hundidos de una flota con esos disparos. */
function sunkShips(
  fleet: readonly NavalBattlePlacement[] | null,
  shots: readonly NavalBattleCell[],
): NavalBattlePlacement[] {
  return (fleet ?? []).filter((placement) => isSunk(placement, shots));
}

/** El resultado de un disparo contra una flota, con los disparos hasta ese incluido. */
function shotResult(
  fleet: readonly NavalBattlePlacement[],
  shotsSoFar: readonly NavalBattleCell[],
  shot: NavalBattleCell,
): NavalBattleShotResult {
  const hit = fleet.find((placement) => shipCells(placement).some((cell) => sameCell(cell, shot)));
  if (!hit) return 'MISS';
  return isSunk(hit, shotsSoFar) ? 'SUNK' : 'HIT';
}

/** Si los disparos de `attacker` hundieron toda la flota del otro. */
function sankAll(state: NavalBattleState, attacker: NavalBattleSeat): boolean {
  const fleet = state.fleets[otherSeat(attacker)];
  return !!fleet && sunkShips(fleet, state.shots[attacker] ?? []).length === FLEET.length;
}

function results(winner: NavalBattleSeat): readonly SeatResult[] {
  return SEATS.map((seat) => ({ seat, outcome: seat === winner ? 'WIN' : 'LOSS' }));
}

function statusOf(state: NavalBattleState): GameStatus {
  // Un asiento retirado pierde y gana el otro (ADR-009, regla 7.18).
  if (state.retiredSeat !== null) {
    return { finished: true, results: results(otherSeat(state.retiredSeat)) };
  }
  for (const seat of SEATS) {
    if (sankAll(state, seat)) return { finished: true, results: results(seat) };
  }
  if (phaseOf(state) === 'PLACEMENT') {
    // Los dos colocan a la vez: está activo quien todavía no ha colocado (X5).
    return { finished: false, activeSeats: SEATS.filter((seat) => state.fleets[seat] === null) };
  }
  return { finished: false, activeSeats: [seatToFire(state)] };
}

// --- Validar lo que llega ---------------------------------------------------

function parseCell(value: Record<string, unknown>): NavalBattleCell | null {
  const { row, col } = value;
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  return { row: row as number, col: col as number };
}

function isOrientation(value: unknown): value is NavalBattleOrientation {
  return value === 'H' || value === 'V';
}

function isShipId(value: unknown): value is NavalBattleShipId {
  return FLEET.some((one) => one.ship === value);
}

/** Lee una flota con la forma de la acción. `null` si no la tiene. */
function parsePlacements(value: unknown): NavalBattlePlacement[] | null {
  if (!Array.isArray(value)) return null;
  const placements: NavalBattlePlacement[] = [];
  for (const item of value as unknown[]) {
    if (!isRecord(item) || !isShipId(item.ship) || !isOrientation(item.orientation)) return null;
    const cell = parseCell(item);
    if (!cell) return null;
    placements.push({ ship: item.ship, ...cell, orientation: item.orientation });
  }
  return placements;
}

/**
 * Comprueba una flota: los cinco barcos, una vez cada uno, dentro de la
 * cuadrícula, sin solaparse y sin tocarse ni en diagonal (X3 y X4).
 * Devuelve la flota en el orden de `FLEET`.
 */
export function checkFleet(
  placements: readonly NavalBattlePlacement[],
): NavalBattleRejectionReason | NavalBattlePlacement[] {
  const ordered = FLEET.map(({ ship }) => placements.filter((one) => one.ship === ship));
  if (placements.length !== FLEET.length || ordered.some((found) => found.length !== 1)) {
    return 'INVALID_FLEET';
  }
  const fleet = ordered.map((found) => found[0] as NavalBattlePlacement);

  const cells = fleet.map(shipCells);
  if (cells.some((one) => !one.every(inGrid))) return 'SHIP_OUT_OF_BOUNDS';
  for (let a = 0; a < cells.length; a += 1) {
    for (let b = a + 1; b < cells.length; b += 1) {
      const pairs = (cells[a] ?? []).flatMap((x) => (cells[b] ?? []).map((y) => [x, y] as const));
      if (pairs.some(([x, y]) => sameCell(x, y))) return 'SHIPS_OVERLAP';
      if (pairs.some(([x, y]) => Math.abs(x.row - y.row) <= 1 && Math.abs(x.col - y.col) <= 1)) {
        return 'SHIPS_TOUCHING';
      }
    }
  }
  return fleet;
}

/** Comprueba que un snapshot guardado es un estado al que se puede llegar jugando. */
function parseState(snapshot: unknown): NavalBattleState | null {
  if (!isRecord(snapshot)) return null;
  const { fleets, shots, retiredSeat } = snapshot;
  if (retiredSeat !== null && !isSeat(retiredSeat)) return null;

  if (!Array.isArray(fleets) || fleets.length !== 2) return null;
  const parsedFleets: (NavalBattlePlacement[] | null)[] = [];
  for (const fleet of fleets as unknown[]) {
    if (fleet === null) {
      parsedFleets.push(null);
      continue;
    }
    const placements = parsePlacements(fleet);
    const checked = placements && checkFleet(placements);
    if (!Array.isArray(checked)) return null;
    // Se guarda en el orden de `FLEET`.
    if (JSON.stringify(checked) !== JSON.stringify(placements)) return null;
    parsedFleets.push(checked);
  }

  if (!Array.isArray(shots) || shots.length !== 2) return null;
  const parsedShots: NavalBattleCell[][] = [];
  for (const list of shots as unknown[]) {
    if (!Array.isArray(list)) return null;
    const cells: NavalBattleCell[] = [];
    for (const item of list as unknown[]) {
      const cell = isRecord(item) ? parseCell(item) : null;
      if (!cell || !inGrid(cell) || cells.some((one) => sameCell(one, cell))) return null;
      if (Object.keys(item as object).length !== 2) return null;
      cells.push(cell);
    }
    parsedShots.push(cells);
  }

  const [first = [], second = []] = parsedShots;
  // No se dispara antes de que estén las dos flotas, y los disparos se alternan desde el 0.
  if (parsedFleets.some((fleet) => fleet === null) && first.length + second.length > 0) {
    return null;
  }
  if (first.length - second.length !== 0 && first.length - second.length !== 1) return null;

  const state: NavalBattleState = {
    fleets: parsedFleets,
    shots: parsedShots,
    retiredSeat,
  };

  // Nadie dispara después de hundir toda la flota rival.
  for (const seat of SEATS) {
    const own = parsedShots[seat] ?? [];
    const fleet = parsedFleets[otherSeat(seat)];
    if (!fleet) continue;
    const winningShot = replay(fleet, own).findIndex((step) => step.sunkCount === FLEET.length);
    if (winningShot === -1) continue;
    if (own.length !== winningShot + 1) return null;
    const rivalShots = parsedShots[otherSeat(seat)]?.length ?? 0;
    if (rivalShots !== (seat === 0 ? winningShot : winningShot + 1)) return null;
  }
  return state;
}

// --- Vista ---------------------------------------------------------------

function shipView(placement: NavalBattlePlacement): NavalBattleShipView {
  return { ship: placement.ship, cells: shipCells(placement) };
}

function gridView(
  state: NavalBattleState,
  owner: NavalBattleSeat,
  viewer: NavalBattleSeat | null,
): NavalBattleGridView {
  const fleet = state.fleets[owner] ?? null;
  const received = state.shots[otherSeat(owner)] ?? [];
  return {
    placed: fleet !== null,
    // La flota solo la ve su dueño (X10).
    ships: viewer === owner && fleet ? fleet.map(shipView) : null,
    sunk: sunkShips(fleet, received).map(shipView),
    shots: fleet
      ? replay(fleet, received).map((step, index) => ({
          ...(received[index] as NavalBattleCell),
          result: step.result,
        }))
      : [],
  };
}

function lastShotOf(state: NavalBattleState): NavalBattleView['lastShot'] {
  const first = state.shots[0] ?? [];
  const second = state.shots[1] ?? [];
  if (first.length === 0) return null;
  // Si el 0 lleva un disparo más, el último es suyo; si no, del 1.
  const [seat, list]: [NavalBattleSeat, readonly NavalBattleCell[]] =
    first.length > second.length ? [0, first] : [1, second];
  const shot = list.at(-1);
  return shot ? { seat, row: shot.row, col: shot.col } : null;
}

// --- Motor ----------------------------------------------------------------

/**
 * Motor de Batalla naval, versión 1.0.0 (ADR-019, X1 a X12).
 *
 * Dos jugadores con una cuadrícula de 10 × 10 y cinco barcos cada uno. Los
 * dos colocan su flota a la vez; después disparan por turnos, uno por
 * turno, empezando el asiento 0. Gana quien hunde toda la flota rival.
 */
export const navalBattleEngine: GameEngine<
  NavalBattleSettings,
  NavalBattleState,
  NavalBattleAction,
  NavalBattleEvent,
  NavalBattleView
> = {
  gameSlug: NAVAL_BATTLE_SLUG,
  gameVersion: NAVAL_BATTLE_VERSION,

  metadata: {
    minPlayers: 2,
    maxPlayers: 2,
    timeControls: {
      // De 40 a 70 disparos por jugador, más la colocación (X12).
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

  parseSettings(input): EngineResponse<NavalBattleSettings> {
    if (isRecord(input) && Object.keys(input).length === 0) return { ok: true, value: {} };
    return { ok: false, code: 'INVALID_SETTINGS' };
  },

  createInitialState() {
    return { fleets: [null, null], shots: [[], []], retiredSeat: null };
  },

  restoreState(snapshot) {
    const state = parseState(snapshot);
    return state ? { ok: true, value: state } : { ok: false, code: 'INVALID_GAME_STATE' };
  },

  getStatus: statusOf,

  applyAction(state, seat, input) {
    const status = statusOf(state);
    if (status.finished) return { ok: false, code: 'GAME_ALREADY_FINISHED' };
    if (!status.activeSeats.includes(seat) || !isSeat(seat)) {
      return { ok: false, code: 'NOT_YOUR_TURN' };
    }
    if (!isRecord(input)) return invalidAction('MALFORMED_ACTION');

    if (input.type === 'PLACE_FLEET') {
      const placements = parsePlacements(input.ships);
      if (!placements) return invalidAction('MALFORMED_ACTION');
      if (phaseOf(state) !== 'PLACEMENT') return invalidAction('WRONG_PHASE');
      const checked = checkFleet(placements);
      if (!Array.isArray(checked)) return invalidAction(checked);
      return {
        ok: true,
        value: {
          state: {
            ...state,
            fleets: state.fleets.map((fleet, one) => (one === seat ? checked : fleet)),
          },
          action: { type: 'PLACE_FLEET', ships: checked },
          // El evento es público: no lleva la flota (contrato del motor, M8).
          events: [{ type: 'FLEET_PLACED', seat }],
        },
      };
    }

    if (input.type === 'FIRE') {
      const cell = parseCell(input);
      if (!cell) return invalidAction('MALFORMED_ACTION');
      if (phaseOf(state) !== 'FIRING') return invalidAction('WRONG_PHASE');
      if (!inGrid(cell)) return invalidAction('CELL_OUT_OF_RANGE');
      const own = state.shots[seat] ?? [];
      if (own.some((shot) => sameCell(shot, cell))) return invalidAction('CELL_ALREADY_FIRED');

      const target = otherSeat(seat);
      const fleet = state.fleets[target] ?? [];
      const shots = [...own, cell];
      const result = shotResult(fleet, shots, cell);
      const events: NavalBattleEvent[] = [{ type: 'SHOT_FIRED', seat, ...cell, result }];
      if (result === 'SUNK') {
        const sunk = fleet.find((placement) =>
          shipCells(placement).some((one) => sameCell(one, cell)),
        );
        if (sunk) {
          events.push({ type: 'SHIP_SUNK', seat: target, ship: sunk.ship, cells: shipCells(sunk) });
        }
      }
      return {
        ok: true,
        value: {
          state: { ...state, shots: state.shots.map((list, one) => (one === seat ? shots : list)) },
          action: { type: 'FIRE', ...cell },
          events,
        },
      };
    }

    return invalidAction('MALFORMED_ACTION');
  },

  retireSeat(state, seat) {
    return { state: { ...state, retiredSeat: isSeat(seat) ? seat : null }, events: [] };
  },

  getView(state, viewer) {
    const seat = isSeat(viewer) ? viewer : null;
    return {
      size: GRID_SIZE,
      fleet: FLEET,
      phase: phaseOf(state),
      grids: SEATS.map((owner) => gridView(state, owner, seat)),
      lastShot: lastShotOf(state),
    };
  },
};
