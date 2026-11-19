import type { StoredActiveSince } from './game-sessions.schema.js';

/**
 * Desde qué versión del estado está activo cada asiento (ADR-019,
 * decisiones X15 y X16). Son funciones puras.
 *
 * Con un solo asiento activo, que pasa a estarlo en la versión actual, la
 * regla de la versión es la de siempre: la jugada tiene que hacerse sobre
 * la versión actual (ADR-010, regla 8.11). Con varios activos a la vez, la
 * jugada de uno sube la versión sin cambiar lo que los demás tenían
 * delante, así que a ellos les vale también la versión desde la que están
 * activos.
 */

/** Al empezar la partida, los asientos activos lo están desde la versión 0. */
export function initialActiveSince(activeSeats: readonly number[]): StoredActiveSince {
  return Object.fromEntries(activeSeats.map((seat) => [String(seat), 0]));
}

/**
 * Las versiones tras un cambio que deja el estado en `nextVersion`. Un
 * asiento que seguía activo conserva la suya, salvo el que acaba de jugar:
 * la suya vuelve a contar desde su jugada, para que dos jugadas suyas
 * sobre la misma versión no se apliquen las dos (X16). Tras una
 * retirada, `actingSeat` es `null`.
 */
export function activeSinceAfter(
  previous: { readonly activeSeats: readonly number[]; readonly activeSince: StoredActiveSince },
  nextActiveSeats: readonly number[],
  nextVersion: number,
  actingSeat: number | null,
): StoredActiveSince {
  return Object.fromEntries(
    nextActiveSeats.map((seat) => {
      const kept = previous.activeSeats.includes(seat) && seat !== actingSeat;
      const since = kept ? previous.activeSince[String(seat)] : undefined;
      return [String(seat), since ?? nextVersion];
    }),
  );
}

/**
 * Si una jugada de `seat` hecha sobre `expected` vale con la sesión como
 * está: es la versión actual o, si el asiento está activo, una versión
 * desde la que lo está sin interrupción (X15).
 */
export function acceptsStateVersion(
  session: {
    readonly stateVersion: number;
    readonly activeSeats: readonly number[];
    readonly activeSince: StoredActiveSince;
  },
  seat: number,
  expected: number,
): boolean {
  if (expected === session.stateVersion) return true;
  if (expected > session.stateVersion || !session.activeSeats.includes(seat)) return false;
  const since = session.activeSince[String(seat)];
  return since !== undefined && since <= expected;
}
