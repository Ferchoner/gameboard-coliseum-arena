import { describe, expect, it } from 'vitest';
import type { Seat } from '../../contract.js';
import { BIRDS, ISLANDS, ORDERS, SEASONS } from './catalog.js';
import { tidesEngine as engine, type TidesState } from './engine.js';
import { legalActions } from './legal.js';
import { leaderOf } from './rules.js';
import { playGame, simulate } from './simulation.js';
import type { TidesEvent, TidesFace } from './types.js';

/** Las reglas de Mareas (ADR-023, MA5 a MA16), una por una. */

/** Encargos caros: con ellos en el mercado nadie puede cumplir sin querer. */
const EXPENSIVE = ['E05', 'E13', 'E27', 'E32'];

/** Un estado inicial de 2 jugadores, con el mercado caro y la fila que se pida. */
function setup(options: { players?: number; seed?: string; row?: readonly string[] } = {}) {
  const state = engine.createInitialState({
    playerCount: options.players ?? 2,
    seed: options.seed ?? 'pruebas',
    settings: {},
  });
  return edit(state, (draft) => {
    setMarket(draft, EXPENSIVE);
    if (options.row) setRow(draft, options.row);
  });
}

/** Cambia una copia del estado y comprueba que sigue siendo un estado válido. */
function edit(state: TidesState, change: (draft: TidesState) => void): TidesState {
  const draft = JSON.parse(JSON.stringify(state)) as TidesState;
  change(draft);
  const restored = engine.restoreState(JSON.parse(JSON.stringify(draft)));
  if (!restored.ok) throw new Error('El estado de la prueba no es válido');
  return draft;
}

function setMarket(draft: TidesState, ids: readonly (string | null)[]) {
  const pool = [...draft.orderDeck, ...draft.market.flatMap((one) => (one ? [one] : []))];
  draft.market = [...ids];
  draft.orderDeck = pool.filter((one) => !ids.includes(one));
}

function setRow(draft: TidesState, ids: readonly string[]) {
  const pool = [...draft.islandDeck, ...draft.row.map((slot) => slot.id)];
  draft.row = ids.map((id) => {
    const size = ISLANDS.find((card) => card.id === id)?.spaces.length ?? 0;
    return {
      id,
      stacks: Array.from({ length: size }, () => []),
      shoals: Array.from({ length: size }, () => false),
    };
  });
  draft.islandDeck = pool.filter((one) => !ids.includes(one));
}

/** Pone un dado de una reserva directamente en una casilla de isla. */
function put(draft: TidesState, die: string, island: number, space: number) {
  for (const one of draft.seats) one.pool = one.pool.filter((other) => other !== die);
  draft.row[island]?.stacks[space]?.push(die);
}

function apply(state: TidesState, seat: Seat, action: unknown) {
  const result = engine.applyAction(state, seat, action);
  if (!result.ok) throw new Error(`Rechazada: ${result.code} ${result.reason ?? ''}`);
  return result.value;
}

function rejection(state: TidesState, seat: Seat, action: unknown) {
  const result = engine.applyAction(state, seat, action);
  return result.ok ? null : (result.reason ?? result.code);
}

const island = (index: number, space: number) => ({ kind: 'ISLAND', island: index, space });
const port = (space: string) => ({ kind: 'PORT', space });
const types = (events: readonly TidesEvent[]) => events.map((event) => event.type);
const activeSeats = (state: TidesState) => {
  const status = engine.getStatus(state);
  return status.finished ? [] : status.activeSeats;
};

// I01 Roca Gris: red→pescado, ancla→sal, vela→ave. I02 Cala Honda: red→pescado,
// red→pescado, ancla→algas, vela→sal. I08 Isla Verde (invierno): red→algas,
// ancla→algas, vela→ave.
const ROW = ['I01', 'I02', 'I08'];

describe('el catálogo propio (anexo)', () => {
  it('tiene 20 islas: 12 para 2, 4 desde 3 y 4 para 4, seis de cada estación', () => {
    expect(ISLANDS).toHaveLength(20);
    const byPlayers = [2, 3, 4].map(
      (count) => ISLANDS.filter((card) => card.minPlayers === count).length,
    );
    expect(byPlayers).toEqual([12, 4, 4]);
    for (const season of SEASONS) {
      expect(ISLANDS.filter((card) => card.seasons.includes(season))).toHaveLength(6);
    }
    expect(new Set(ISLANDS.map((card) => card.id)).size).toBe(20);
  });

  it('tiene 36 aves, nueve por estación y tres de cada tipo', () => {
    expect(BIRDS).toHaveLength(36);
    for (const season of SEASONS) {
      expect(BIRDS.filter((card) => card.season === season)).toHaveLength(9);
    }
    const kinds = new Set(BIRDS.map((card) => card.kind));
    expect(kinds.size).toBe(12);
    for (const kind of kinds) expect(BIRDS.filter((card) => card.kind === kind)).toHaveLength(3);
  });

  it('tiene 32 encargos con los siete usos, de 2 a 5 ingredientes', () => {
    expect(ORDERS).toHaveLength(32);
    expect(new Set(ORDERS.map((card) => card.use)).size).toBe(7);
    for (const card of ORDERS) {
      const cost = card.cost.FISH + card.cost.SALT + card.cost.ALGAE;
      expect(cost).toBeGreaterThanOrEqual(2);
      expect(cost).toBeLessThanOrEqual(5);
    }
  });
});

describe('opciones y controles de tiempo (MA11, MA12)', () => {
  it('solo acepta la partida sin opciones', () => {
    expect(engine.parseSettings({})).toEqual({ ok: true, value: {} });
    expect(engine.parseSettings({ cofradias: true })).toEqual({
      ok: false,
      code: 'INVALID_SETTINGS',
    });
    expect(engine.parseSettings(null)).toEqual({ ok: false, code: 'INVALID_SETTINGS' });
  });

  it('se juega de 2 a 4 en tiempo real, con 15, 20 o 30 minutos, y no por turnos', () => {
    expect(engine.metadata.minPlayers).toBe(2);
    expect(engine.metadata.maxPlayers).toBe(4);
    expect(engine.metadata.timeControls.REALTIME.map((one) => one.totalMs / 60_000)).toEqual([
      15, 20, 30,
    ]);
    expect(engine.metadata.timeControls.TURN_BASED).toEqual([]);
  });
});

describe('la preparación (sección 1.3)', () => {
  it('reparte la fila, el mercado, una perla y seis dados tirados a cada uno', () => {
    const state = engine.createInitialState({ playerCount: 2, seed: 'a', settings: {} });
    expect(state.row).toHaveLength(3);
    // Con 2 jugadores solo entran las 12 islas "2+".
    expect(state.islandDeck.length + state.row.length).toBe(12);
    expect(state.market.filter((one) => one !== null)).toHaveLength(4);
    expect(state.orderDeck).toHaveLength(28);
    for (const one of state.seats) {
      expect(one.pool).toHaveLength(6);
      expect(one.ingredients).toEqual({ FISH: 0, SALT: 0, ALGAE: 0, PEARL: 1 });
    }
    expect(state.portSide).toBe('HIGH');
    expect(activeSeats(state)).toEqual([0]);
  });

  it('con 4 jugadores usa las 20 islas y una fila de 5', () => {
    const state = engine.createInitialState({ playerCount: 4, seed: 'a', settings: {} });
    expect(state.row).toHaveLength(5);
    expect(state.islandDeck.length + state.row.length).toBe(20);
  });

  it('la misma semilla da la misma partida y otra semilla, otra', () => {
    const one = engine.createInitialState({ playerCount: 3, seed: 'a', settings: {} });
    const same = engine.createInitialState({ playerCount: 3, seed: 'a', settings: {} });
    const other = engine.createInitialState({ playerCount: 3, seed: 'b', settings: {} });
    expect(same).toEqual(one);
    expect(other).not.toEqual(one);
  });
});

describe('colocar barcas en las islas (MA6)', () => {
  const base = (faces: Record<string, TidesFace>) =>
    edit(setup({ row: ROW }), (draft) => Object.assign(draft.faces, faces));

  it('en una casilla de su figura recoge su ingrediente y, sin nada más que hacer, el turno pasa', () => {
    const state = base({ '0B0': 'NET' });
    const { state: next, events } = apply(state, 0, {
      type: 'PLACE',
      die: '0B0',
      target: island(0, 0),
    });
    expect(next.seats[0]?.ingredients.FISH).toBe(1);
    expect(next.row[0]?.stacks[0]).toEqual(['0B0']);
    expect(types(events)).toEqual(['DIE_PLACED', 'GATHERED', 'TURN_ENDED']);
    expect(activeSeats(next)).toEqual([1]);
  });

  it('en una casilla de otra figura hay que forzar pagando su ingrediente o una perla, y no recoge', () => {
    const state = base({ '0B0': 'NET' });
    expect(rejection(state, 0, { type: 'PLACE', die: '0B0', target: island(0, 1) })).toBe(
      'FACE_MISMATCH',
    );
    expect(
      rejection(state, 0, { type: 'PLACE', die: '0B0', target: island(0, 1), force: 'SALT' }),
    ).toBe('CANNOT_AFFORD');
    expect(
      rejection(state, 0, { type: 'PLACE', die: '0B0', target: island(0, 1), force: 'FISH' }),
    ).toBe('CANNOT_FORCE');
    const { state: next, events } = apply(state, 0, {
      type: 'PLACE',
      die: '0B0',
      target: island(0, 1),
      force: 'PEARL',
    });
    expect(next.seats[0]?.ingredients).toEqual({ FISH: 0, SALT: 0, ALGAE: 0, PEARL: 0 });
    expect(events[0]).toMatchObject({ type: 'DIE_PLACED', forced: true });
    expect(types(events)).not.toContain('GATHERED');
  });

  it('una casilla de ave solo se fuerza con perla', () => {
    const state = edit(base({ '0B0': 'NET' }), (draft) => {
      (draft.seats[0] as TidesState['seats'][number]).ingredients.FISH = 1;
    });
    expect(
      rejection(state, 0, { type: 'PLACE', die: '0B0', target: island(0, 2), force: 'FISH' }),
    ).toBe('CANNOT_FORCE');
    expect(() =>
      apply(state, 0, { type: 'PLACE', die: '0B0', target: island(0, 2), force: 'PEARL' }),
    ).not.toThrow();
  });

  it('no se pone una barca sobre otro dado', () => {
    const state = edit(base({ '0B0': 'NET', '1B0': 'NET' }), (draft) => put(draft, '1B0', 0, 0));
    expect(rejection(state, 0, { type: 'PLACE', die: '0B0', target: island(0, 0) })).toBe(
      'SPACE_OCCUPIED',
    );
  });

  it('solo se colocan dados propios de la reserva, una vez por turno', () => {
    const state = base({ '0B0': 'NET', '0B1': 'NET' });
    expect(rejection(state, 0, { type: 'PLACE', die: '1B0', target: island(0, 0) })).toBe(
      'DIE_NOT_IN_POOL',
    );
    expect(rejection(state, 1, { type: 'PLACE', die: '1B0', target: island(0, 0) })).toBe(
      'NOT_YOUR_TURN',
    );
    // Con un encargo que se puede cumplir, el turno no se termina solo.
    const open = edit(state, (draft) => setMarket(draft, ['E14', 'E13', 'E27', 'E32']));
    const { state: next } = apply(open, 0, { type: 'PLACE', die: '0B0', target: island(0, 0) });
    expect(activeSeats(next)).toEqual([0]);
    expect(rejection(next, 0, { type: 'PLACE', die: '0B1', target: island(1, 0) })).toBe(
      'ALREADY_PLACED',
    );
    expect(rejection(open, 0, { type: 'END_TURN' })).toBe('MUST_PLACE_FIRST');
    expect(activeSeats(apply(next, 0, { type: 'END_TURN' }).state)).toEqual([1]);
  });
});

describe('los dados de clima (MA6, D2, D8)', () => {
  it('la calma recoge dos más del ingrediente de la casilla', () => {
    const state = edit(setup({ row: ROW }), (draft) => (draft.faces['0W0'] = 'CALM'));
    const { state: next } = apply(state, 0, { type: 'PLACE', die: '0W0', target: island(1, 2) });
    expect(next.seats[0]?.ingredients.ALGAE).toBe(3);
  });

  it('la tormenta se pone encima de cualquier dado y le quita la isla a quien la dominaba', () => {
    const state = edit(setup({ row: ROW }), (draft) => {
      draft.faces['0W0'] = 'STORM';
      put(draft, '1B0', 0, 0);
    });
    expect(leaderOf(state.row[0] as TidesState['row'][number])).toBe(1);
    const { state: next } = apply(state, 0, { type: 'PLACE', die: '0W0', target: island(0, 0) });
    expect(next.row[0]?.stacks[0]).toEqual(['1B0', '0W0']);
    expect(leaderOf(next.row[0] as TidesState['row'][number])).toBeNull();
  });

  it('la brisa solo va encima de una barca propia, que vuelve a la reserva', () => {
    const state = edit(setup({ row: ROW }), (draft) => {
      draft.faces['0W0'] = 'BREEZE';
      draft.faces['0W1'] = 'CALM';
      put(draft, '0B0', 1, 0);
      put(draft, '1B0', 1, 1);
    });
    expect(rejection(state, 0, { type: 'PLACE', die: '0W0', target: island(1, 1) })).toBe(
      'SPACE_OCCUPIED',
    );
    expect(rejection(state, 0, { type: 'PLACE', die: '0W1', target: island(1, 0) })).toBe(
      'SPACE_OCCUPIED',
    );
    const { state: next, events } = apply(state, 0, {
      type: 'PLACE',
      die: '0W0',
      target: island(1, 0),
    });
    expect(next.row[1]?.stacks[0]).toEqual(['0W0']);
    expect(next.seats[0]?.pool).toContain('0B0');
    expect(types(events)).toContain('DIE_RETURNED');
  });
});

describe('el puerto (anexo, sección 3)', () => {
  it('en pleamar, la casilla de cualquier dado da un ingrediente a elegir y admite varios dados', () => {
    const state = edit(setup({ row: ROW }), (draft) =>
      draft.port.ANY_1.push(draft.seats[1]?.pool.shift() as string),
    );
    const { state: waiting } = apply(state, 0, {
      type: 'PLACE',
      die: '0B0',
      target: port('ANY_1'),
    });
    expect(waiting.pending[0]).toEqual({ kind: 'CHOOSE_INGREDIENTS', mode: 'ONE' });
    expect(rejection(waiting, 0, { type: 'PLACE', die: '0B1', target: port('ANY_1') })).toBe(
      'PENDING_DECISION',
    );
    expect(rejection(waiting, 0, { type: 'RESOLVE', ingredients: ['FISH', 'SALT'] })).toBe(
      'BAD_CHOICE',
    );
    const { state: next } = apply(waiting, 0, { type: 'RESOLVE', ingredients: ['SALT'] });
    expect(next.seats[0]?.ingredients.SALT).toBe(1);
    expect(next.port.ANY_1).toHaveLength(2);
  });

  it('en bajamar, la misma casilla da dos del mismo ingrediente', () => {
    const state = edit(setup({ row: ROW }), (draft) => (draft.portSide = 'LOW'));
    const { state: waiting } = apply(state, 0, {
      type: 'PLACE',
      die: '0B0',
      target: port('ANY_1'),
    });
    expect(waiting.pending[0]).toEqual({ kind: 'CHOOSE_INGREDIENTS', mode: 'TWO_SAME' });
    expect(rejection(waiting, 0, { type: 'RESOLVE', ingredients: ['FISH', 'SALT'] })).toBe(
      'BAD_CHOICE',
    );
    const { state: next } = apply(waiting, 0, { type: 'RESOLVE', ingredients: ['FISH', 'FISH'] });
    expect(next.seats[0]?.ingredients.FISH).toBe(2);
  });

  it('las casillas de clima piden esa cara y se usan una vez por ronda', () => {
    const state = edit(setup({ row: ROW }), (draft) => {
      draft.faces['0W0'] = 'CALM';
      draft.faces['0B0'] = 'NET';
    });
    expect(rejection(state, 0, { type: 'PLACE', die: '0B0', target: port('CALM') })).toBe(
      'FACE_MISMATCH',
    );
    const { state: next } = apply(state, 0, { type: 'PLACE', die: '0W0', target: port('CALM') });
    expect(next.seats[0]?.ingredients).toMatchObject({ FISH: 1, ALGAE: 1 });
    const again = edit(next, (draft) => {
      draft.faces['1W0'] = 'CALM';
    });
    expect(rejection(again, 1, { type: 'PLACE', die: '1W0', target: port('CALM') })).toBe(
      'PORT_SPACE_USED',
    );
  });

  it('la tormenta en pleamar aparta todos los dados de clima de las islas (D1)', () => {
    const state = edit(setup({ row: ROW }), (draft) => {
      draft.faces['0W0'] = 'STORM';
      put(draft, '1W0', 0, 0);
      put(draft, '1B0', 1, 0);
    });
    const { state: next } = apply(state, 0, { type: 'PLACE', die: '0W0', target: port('STORM') });
    expect(next.row[0]?.stacks[0]).toEqual([]);
    expect(next.seats[1]?.aside).toContain('1W0');
    expect(next.row[1]?.stacks[0]).toEqual(['1B0']);
  });

  it('la tormenta en bajamar pone hasta dos bajíos, y en un bajío no se coloca (B2)', () => {
    const state = edit(setup({ row: ROW }), (draft) => {
      draft.portSide = 'LOW';
      draft.faces['0W0'] = 'STORM';
    });
    const { state: one } = apply(state, 0, { type: 'PLACE', die: '0W0', target: port('STORM') });
    expect(one.pending[0]).toEqual({ kind: 'SHOAL', remaining: 2, island: null });
    const { state: two } = apply(one, 0, { type: 'RESOLVE', island: 1, space: 0 });
    const { state: done } = apply(two, 0, { type: 'RESOLVE', skip: true });
    expect(done.row[1]?.shoals[0]).toBe(true);
    const next = edit(done, (draft) => (draft.faces['1B0'] = 'NET'));
    expect(rejection(next, 1, { type: 'PLACE', die: '1B0', target: island(1, 0) })).toBe(
      'SPACE_SHOALED',
    );
  });
});

describe('los encargos (MA7, MA15, B4)', () => {
  const rich = (market: readonly (string | null)[]) =>
    edit(setup({ row: ROW }), (draft) => {
      setMarket(draft, market);
      (draft.seats[0] as TidesState['seats'][number]).ingredients = {
        FISH: 2,
        SALT: 2,
        ALGAE: 1,
        PEARL: 1,
      };
    });

  it('se cumplen con el coste justo, la perla por cualquiera, y el mercado se repone', () => {
    // E14 Cabo de remolque: pescado y sal.
    const state = rich(['E14', 'E13', 'E27', 'E32']);
    const top = state.orderDeck[0];
    expect(
      rejection(state, 0, { type: 'FULFIL', order: 'E14', payment: { FISH: 2, SALT: 1 } }),
    ).toBe('BAD_PAYMENT');
    expect(
      rejection(state, 0, { type: 'FULFIL', order: 'E14', payment: { FISH: 1, SALT: 0 } }),
    ).toBe('BAD_PAYMENT');
    const { state: next } = apply(state, 0, {
      type: 'FULFIL',
      order: 'E14',
      payment: { FISH: 1, PEARL: 1 },
    });
    expect(next.seats[0]?.hand).toEqual(['E14']);
    expect(next.seats[0]?.ingredients).toEqual({ FISH: 1, SALT: 2, ALGAE: 1, PEARL: 0 });
    expect(next.market[0]).toBe(top);
    expect(rejection(next, 0, { type: 'FULFIL', order: 'E13', payment: {} })).toBe(
      'ALREADY_FULFILLED',
    );
  });

  it('no se cumple lo que no se puede pagar ni lo que no está a la vista', () => {
    const state = rich(EXPENSIVE);
    expect(
      rejection(state, 0, {
        type: 'FULFIL',
        order: 'E32',
        payment: { FISH: 1, SALT: 2, ALGAE: 2 },
      }),
    ).toBe('CANNOT_AFFORD');
    expect(
      rejection(state, 0, { type: 'FULFIL', order: 'E01', payment: { FISH: 1, SALT: 1 } }),
    ).toBe('ORDER_NOT_AVAILABLE');
  });

  it('cumplir uno apalabrado no repone el mercado', () => {
    const state = edit(rich([null, 'E13', 'E27', 'E32']), (draft) => {
      draft.orderDeck = draft.orderDeck.filter((one) => one !== 'E01');
      (draft.seats[0] as TidesState['seats'][number]).promised = ['E01'];
    });
    const { state: next } = apply(state, 0, {
      type: 'FULFIL',
      order: 'E01',
      payment: { FISH: 1, SALT: 1 },
    });
    expect(next.market[0]).toBeNull();
    expect(next.seats[0]?.promised).toEqual([]);
    expect(next.seats[0]?.hand).toEqual(['E01']);
  });

  it('apalabrar deja elegir la carta revelada o una del mercado, que se repone con la revelada', () => {
    const state = edit(setup({ row: ROW }), (draft) => (draft.faces['0W0'] = 'BREEZE'));
    const { state: waiting } = apply(state, 0, {
      type: 'PLACE',
      die: '0W0',
      target: port('BREEZE'),
    });
    const pending = waiting.pending[0];
    expect(pending).toMatchObject({ kind: 'PROMISE', remaining: 1, optional: false });
    const revealed = (pending as { revealed: string }).revealed;
    // La carta revelada solo la ve quien decide.
    expect(engine.getView(waiting, 0).pending).toMatchObject({ revealed });
    expect(engine.getView(waiting, 0).revealed?.id).toBe(revealed);
    expect(engine.getView(waiting, 1).pending).toMatchObject({ revealed: null });
    expect(engine.getView(waiting, 1).revealed).toBeNull();
    expect(engine.getView(waiting, null).pending).toMatchObject({ revealed: null });
    expect(rejection(waiting, 0, { type: 'RESOLVE', skip: true })).toBe('BAD_CHOICE');
    const { state: next } = apply(waiting, 0, { type: 'RESOLVE', order: 'E13' });
    expect(next.seats[0]?.promised).toEqual(['E13']);
    expect(next.market).toEqual(['E05', revealed, 'E27', 'E32']);
  });
});

describe('usar encargos (MA7)', () => {
  const withHand = (hand: readonly string[], change?: (draft: TidesState) => void) =>
    edit(setup({ row: ROW }), (draft) => {
      draft.orderDeck = draft.orderDeck.filter((one) => !hand.includes(one));
      (draft.seats[0] as TidesState['seats'][number]).hand = [...hand];
      change?.(draft);
    });

  it('remolcar mueve una barca a una casilla vacía de una isla, sin recoger', () => {
    const state = withHand(['E14'], (draft) => put(draft, '1B0', 0, 0));
    const { state: next } = apply(state, 0, {
      type: 'USE',
      order: 'E14',
      die: '1B0',
      to: { island: 2, space: 1 },
    });
    expect(next.row[0]?.stacks[0]).toEqual([]);
    expect(next.row[2]?.stacks[1]).toEqual(['1B0']);
    expect(next.seats[1]?.ingredients.ALGAE).toBe(0);
    expect(next.seats[0]?.used).toEqual(['E14']);
    expect(
      rejection(next, 0, { type: 'USE', order: 'E14', die: '1B0', to: { island: 0, space: 0 } }),
    ).toBe('ALREADY_USED');
  });

  it('amarrar aparta cualquier dado colocado hasta la ronda siguiente', () => {
    const state = withHand(['E24'], (draft) => put(draft, '1B0', 0, 0));
    const { state: next } = apply(state, 0, { type: 'USE', order: 'E24', die: '1B0' });
    expect(next.row[0]?.stacks[0]).toEqual([]);
    expect(next.seats[1]?.aside).toEqual(['1B0']);
  });

  it('doble faena deja colocar dos dados en el turno', () => {
    const state = withHand(['E10'], (draft) => {
      draft.faces['0B0'] = 'NET';
      draft.faces['0B1'] = 'NET';
    });
    const { state: one } = apply(state, 0, { type: 'USE', order: 'E10' });
    const { state: two } = apply(one, 0, { type: 'PLACE', die: '0B0', target: island(1, 0) });
    expect(activeSeats(two)).toEqual([0]);
    const { state: three } = apply(two, 0, { type: 'PLACE', die: '0B1', target: island(1, 1) });
    expect(three.seats[0]?.ingredients.FISH).toBe(2);
    expect(activeSeats(three)).toEqual([1]);
  });

  it('girar un dado cambia su cara a la elegida', () => {
    const state = withHand(['E01'], (draft) => (draft.faces['0B0'] = 'NET'));
    const { state: next } = apply(state, 0, {
      type: 'USE',
      order: 'E01',
      die: '0B0',
      face: 'SAIL',
    });
    expect(next.faces['0B0']).toBe('SAIL');
    expect(rejection(state, 0, { type: 'USE', order: 'E01', die: '0B0', face: 'CALM' })).toBe(
      'BAD_CHOICE',
    );
  });
});

describe('las aves (MA8, MA9)', () => {
  it('una casilla de ave sube un ave del montón elegido; con cuatro a bordo hay que soltar una', () => {
    const state = edit(setup({ row: ROW }), (draft) => {
      draft.faces['0B0'] = 'SAIL';
      const one = draft.seats[0] as TidesState['seats'][number];
      for (const season of ['SPRING', 'SUMMER', 'AUTUMN'] as const) {
        one.aboard.push({ bird: draft.birdPiles[season].shift() as string, die: null });
      }
    });
    const { state: board } = apply(state, 0, { type: 'PLACE', die: '0B0', target: island(0, 2) });
    expect(board.pending[0]).toEqual({ kind: 'BOARD_BIRD' });
    const top = board.birdPiles.WINTER[0] as string;
    const { state: release } = apply(board, 0, { type: 'RESOLVE', season: 'WINTER' });
    expect(release.pending[0]).toEqual({ kind: 'RELEASE_BIRD' });
    expect(release.seats[0]?.aboard).toHaveLength(4);
    const { state: next } = apply(release, 0, { type: 'RESOLVE', bird: top });
    expect(next.seats[0]?.aboard).toHaveLength(3);
    expect(next.seats[0]?.free).toEqual([top]);
  });

  it('el Cormorán da una perla al poner una barca en su casilla', () => {
    const cormorant = BIRDS.find((card) => card.kind === 'CORMORANT')?.id as string;
    const state = edit(setup({ row: ROW }), (draft) => {
      draft.birdPiles.SUMMER = draft.birdPiles.SUMMER.filter((one) => one !== cormorant);
      (draft.seats[0] as TidesState['seats'][number]).aboard = [{ bird: cormorant, die: null }];
    });
    expect(
      rejection(state, 0, { type: 'PLACE', die: '0W0', target: { kind: 'BIRD', bird: cormorant } }),
    ).toBe('FACE_MISMATCH');
    const { state: next } = apply(state, 0, {
      type: 'PLACE',
      die: '0B0',
      target: { kind: 'BIRD', bird: cormorant },
    });
    expect(next.seats[0]?.ingredients.PEARL).toBe(2);
    expect(next.seats[0]?.aboard[0]?.die).toBe('0B0');
  });

  it('un ave suelta anida en una isla reclamada de su estación, una por isla', () => {
    const winter = BIRDS.find((card) => card.season === 'WINTER')?.id as string;
    const spring = BIRDS.find((card) => card.season === 'SPRING')?.id as string;
    const state = edit(setup({ row: ['I01', 'I02', 'I03'] }), (draft) => {
      draft.birdPiles.WINTER = draft.birdPiles.WINTER.filter((one) => one !== winter);
      draft.birdPiles.SPRING = draft.birdPiles.SPRING.filter((one) => one !== spring);
      draft.islandDeck = draft.islandDeck.filter((one) => one !== 'I08');
      const one = draft.seats[0] as TidesState['seats'][number];
      one.free = [winter, spring];
      one.claimed = ['I08'];
    });
    expect(rejection(state, 0, { type: 'NEST', bird: spring, island: 'I08' })).toBe(
      'NEST_NOT_ALLOWED',
    );
    const { state: next } = apply(state, 0, { type: 'NEST', bird: winter, island: 'I08' });
    expect(next.seats[0]?.nests).toEqual([{ bird: winter, island: 'I08' }]);
    expect(engine.getView(next, null).seats[0]?.score.birds).toBe(4);
  });
});

describe('el fin de ronda (sección 1.10, B6)', () => {
  it('quien domina una isla se la queda; con empate o más clima, se descarta', () => {
    // Cada asiento con un solo dado: la ronda acaba al colocarlo.
    const state = edit(setup({ row: ROW }), (draft) => {
      const [zero, one] = draft.seats as [TidesState['seats'][number], TidesState['seats'][number]];
      put(draft, '0B1', 0, 0);
      put(draft, '1B1', 1, 0);
      put(draft, '0B2', 1, 1);
      put(draft, '1W1', 2, 0);
      put(draft, '0B3', 2, 1);
      zero.aside = zero.pool.filter((die) => die !== '0B0');
      zero.pool = ['0B0'];
      one.aside = one.pool.filter((die) => die !== '1B0');
      one.pool = ['1B0'];
      draft.faces['0B0'] = 'ANCHOR';
      draft.faces['1B0'] = 'NET';
    });
    const { state: mid } = apply(state, 0, { type: 'PLACE', die: '0B0', target: island(0, 1) });
    const { state: next, events } = apply(mid, 1, {
      type: 'PLACE',
      die: '1B0',
      target: port('ANY_1'),
    });
    // La casilla del puerto deja una elección pendiente; se resuelve y la ronda acaba.
    const { state: after, events: more } = apply(next, 1, {
      type: 'RESOLVE',
      ingredients: ['FISH'],
    });
    const all = [...events, ...more];
    expect(all).toContainEqual({ type: 'ISLAND_CLAIMED', seat: 0, island: 'I01' });
    expect(all).toContainEqual({ type: 'ISLAND_DISCARDED', island: 'I02' });
    expect(all).toContainEqual({ type: 'ISLAND_DISCARDED', island: 'I08' });
    expect(after.seats[0]?.claimed).toEqual(['I01']);
    expect(after.round).toBe(2);
    expect(after.portSide).toBe('LOW');
    expect(after.firstSeat).toBe(1);
    expect(activeSeats(after)).toEqual([1]);
    // Todos los dados vuelven a la reserva y se tiran de nuevo (B6).
    expect(after.seats.map((one) => one.pool.length)).toEqual([6, 6]);
    expect(after.port.ANY_1).toEqual([]);
  });

  it('con 2 jugadores la partida dura 4 rondas y termina cuando no hay islas para otra fila (B1)', () => {
    const record = playGame(2, 'cuatro-rondas', ['GREEDY', 'GREEDY']);
    expect(record?.rounds).toBe(4);
    expect(record?.winners.length).toBeGreaterThan(0);
  });
});

describe('la puntuación final (sección 1.11, B3, MA14)', () => {
  it('cuenta islas, encargos, aves, fichas y un punto por cada 3 sobrantes', () => {
    const winter = BIRDS.find((card) => card.season === 'WINTER')?.id as string;
    const state = edit(setup({ row: ROW }), (draft) => {
      draft.birdPiles.WINTER = draft.birdPiles.WINTER.filter((one) => one !== winter);
      draft.islandDeck = draft.islandDeck.filter((one) => !['I09', 'I10'].includes(one));
      draft.orderDeck = draft.orderDeck.filter((one) => one !== 'E01');
      const one = draft.seats[0] as TidesState['seats'][number];
      one.claimed = ['I09', 'I10'];
      one.aboard = [{ bird: winter, die: null }];
      one.hand = ['E01'];
      one.tokens = 2;
      one.ingredients = { FISH: 3, SALT: 1, ALGAE: 0, PEARL: 1 };
      // Deja el mazo sin islas para otra fila y a cada asiento con un dado.
      draft.islandDeck = [];
      const other = draft.seats[1] as TidesState['seats'][number];
      one.aside = one.pool.filter((die) => die !== '0B0');
      one.pool = ['0B0'];
      other.aside = [...other.pool];
      other.pool = [];
    });
    const { state: next } = apply(state, 0, { type: 'PLACE', die: '0B0', target: port('ANY_2') });
    const { state: done } = apply(next, 0, { type: 'RESOLVE', season: 'SPRING' });
    expect(done.phase).toBe('FINISHED');
    const score = done.scores?.[0];
    // I09 5 + I10 5; E01 2; el ave de invierno anida (3) y la de primavera suelta (1); 2 fichas;
    // 5 sobrantes dan 1 punto.
    expect(score).toEqual({ islands: 10, orders: 2, birds: 4, tokens: 2, leftovers: 1, total: 19 });
    expect(engine.getStatus(done)).toEqual({
      finished: true,
      results: [
        { seat: 0, outcome: 'WIN', score: 19 },
        { seat: 1, outcome: 'LOSS', score: 0 },
      ],
    });
    expect(rejection(done, 0, { type: 'END_TURN' })).toBe('GAME_ALREADY_FINISHED');
  });
});

describe('las retiradas (MA13)', () => {
  it('con 2 jugadores gana quien queda', () => {
    const state = setup({ row: ROW });
    const { state: next } = engine.retireSeat(state, 0, 'RESIGNATION');
    expect(engine.getStatus(next)).toMatchObject({
      finished: true,
      results: [
        { seat: 0, outcome: 'LOSS' },
        { seat: 1, outcome: 'WIN' },
      ],
    });
  });

  it('con 3, sus barcas salen de las islas y la partida sigue sin su asiento', () => {
    const state = edit(setup({ players: 3, row: ['I01', 'I02', 'I08', 'I03'] }), (draft) => {
      put(draft, '0B1', 0, 0);
      put(draft, '0W1', 1, 0);
    });
    const { state: next, events } = engine.retireSeat(state, 0, 'RESIGNATION');
    expect(types(events)).toEqual(['SEAT_RETIRED']);
    expect(next.row[0]?.stacks[0]).toEqual([]);
    expect(next.row[1]?.stacks[0]).toEqual(['0W1']);
    expect(activeSeats(next)).toEqual([1]);
    expect(engine.restoreState(JSON.parse(JSON.stringify(next))).ok).toBe(true);
  });
});

describe('el estado guardado (MA16)', () => {
  it('rechaza un snapshot con un dado repetido o una carta que no existe', () => {
    const state = setup({ row: ROW });
    const repeated = JSON.parse(JSON.stringify(state)) as TidesState;
    repeated.seats[1]?.pool.push('0B0');
    expect(engine.restoreState(repeated)).toEqual({ ok: false, code: 'INVALID_GAME_STATE' });
    const unknown = JSON.parse(JSON.stringify(state)) as TidesState;
    unknown.market[0] = 'E99';
    expect(engine.restoreState(unknown)).toEqual({ ok: false, code: 'INVALID_GAME_STATE' });
    expect(engine.restoreState(null)).toEqual({ ok: false, code: 'INVALID_GAME_STATE' });
  });

  it('una acción desconocida o mal formada se rechaza sin cambiar nada', () => {
    const state = setup({ row: ROW });
    const copy = JSON.parse(JSON.stringify(state)) as TidesState;
    expect(rejection(state, 0, { type: 'OTRA_COSA' })).toBe('MALFORMED_ACTION');
    expect(rejection(state, 0, { type: 'PLACE', die: 7 })).toBe('MALFORMED_ACTION');
    expect(rejection(state, 0, { type: 'ROUND_CHOICES', flamingo: 0 })).toBe('WRONG_PHASE');
    expect(state).toEqual(copy);
  });
});

describe('partidas completas y equilibrio (MA4 y MA18)', () => {
  it('siempre hay una jugada válida y las partidas de 2, 3 y 4 terminan', () => {
    for (const players of [2, 3, 4]) {
      let state = engine.createInitialState({
        playerCount: players,
        seed: `l${players}`,
        settings: {},
      });
      for (let step = 0; step < 4000 && !engine.getStatus(state).finished; step += 1) {
        const seat = activeSeats(state)[0] as Seat;
        const legal = legalActions(state, seat);
        expect(legal.length).toBeGreaterThan(0);
        state = apply(state, seat, legal[(step * 7) % legal.length]).state;
      }
      expect(engine.getStatus(state).finished).toBe(true);
    }
  });

  it('con jugadores automáticos voraces, el ganador queda en la escala buscada', () => {
    const report = simulate({ games: 6, playerCount: 3, seed: 'equilibrio' });
    expect(report.unfinished).toBe(0);
    expect(report.rounds).toBe(4);
    // Los automáticos juegan peor que una persona; su ganador va por debajo de 55 a 65.
    expect(report.winner.mean).toBeGreaterThan(35);
    expect(report.winner.mean).toBeLessThan(65);
  });
});
