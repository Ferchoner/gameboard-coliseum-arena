import type { StoredClocks } from './game-sessions.schema.js';

/**
 * Las cuentas de los relojes (ADR-009, reglas 7.2 a 7.5). Son funciones
 * puras: la hora llega siempre de fuera, y la mide el servidor (regla 7.4).
 *
 * Los relojes se guardan medidos en un instante, `turnStartedAt`. Desde
 * entonces corren solo los de los asientos activos.
 */

/** Los relojes guardados, como una lista en la que la posición es el asiento. */
export function clocksFromStored(stored: StoredClocks, seatCount: number): number[] {
  return Array.from({ length: seatCount }, (_, seat) => stored[String(seat)] ?? 0);
}

export function clocksToStored(clocks: readonly number[]): StoredClocks {
  return Object.fromEntries(clocks.map((ms, seat) => [String(seat), ms]));
}

/** El tiempo que le queda a cada asiento en `now`. Nunca baja de cero. */
export function clocksAt(
  clocks: readonly number[],
  activeSeats: readonly number[],
  turnStartedAt: Date | null,
  now: Date,
): number[] {
  const elapsedMs = turnStartedAt ? Math.max(0, now.getTime() - turnStartedAt.getTime()) : 0;
  return clocks.map((ms, seat) => (activeSeats.includes(seat) ? Math.max(0, ms - elapsedMs) : ms));
}

/**
 * El instante en que se agota el primer reloj de los asientos activos si
 * nadie juega, con los relojes medidos en `turnStartedAt`.
 */
export function deadlineOf(
  clocks: readonly number[],
  activeSeats: readonly number[],
  turnStartedAt: Date,
): Date {
  const shortest = Math.min(...activeSeats.map((seat) => clocks[seat] ?? 0));
  return new Date(turnStartedAt.getTime() + shortest);
}

/** Los asientos activos a los que ya no les queda tiempo, con los relojes medidos ahora. */
export function expiredSeats(clocks: readonly number[], activeSeats: readonly number[]): number[] {
  return activeSeats.filter((seat) => (clocks[seat] ?? 0) <= 0);
}
