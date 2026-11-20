/**
 * Generador de azar con semilla para los motores (ADR-020, decisión DO15).
 *
 * El motor no puede generar azar por su cuenta (contrato del motor, regla
 * 1): recibe una semilla de la plataforma al crear el estado. Con ella
 * arranca este generador, cuyo estado son cuatro números enteros que el
 * juego guarda dentro de su propio estado. Cada llamada devuelve el valor y
 * el estado siguiente, sin modificar nada, así que cada transición sigue
 * siendo determinista y una partida se puede reproducir desde su semilla.
 *
 * Es el generador sfc32, con la semilla repartida por cyrb128. No sirve
 * para nada que tenga que ver con la seguridad.
 */

/** El estado del generador: cuatro enteros sin signo de 32 bits. Es JSON plano. */
export type RandomState = readonly [number, number, number, number];

/** Vueltas que se descartan al sembrar, para que semillas parecidas den series distintas. */
const WARM_UP = 16;

/** Convierte la semilla en el estado inicial del generador. */
export function seedRandom(seed: string): RandomState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < seed.length; index += 1) {
    const char = seed.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ char, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ char, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ char, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ char, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  let state: RandomState = [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
  for (let round = 0; round < WARM_UP; round += 1) state = nextRandom(state).state;
  return state;
}

/** Un número en [0, 1) y el estado siguiente. */
export function nextRandom(state: RandomState): { value: number; state: RandomState } {
  let [a, b, c, d] = state;
  let t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  t = (t + d) | 0;
  c = (c + t) | 0;
  return { value: (t >>> 0) / 4294967296, state: [a >>> 0, b >>> 0, c >>> 0, d >>> 0] };
}

/** Un entero en [0, `bound`) y el estado siguiente. */
export function randomInt(
  state: RandomState,
  bound: number,
): { value: number; state: RandomState } {
  const next = nextRandom(state);
  return { value: Math.floor(next.value * bound), state: next.state };
}

/** Baraja una copia de la lista (Fisher-Yates). No toca la que recibe. */
export function shuffle<T>(
  items: readonly T[],
  state: RandomState,
): { items: T[]; state: RandomState } {
  const shuffled = [...items];
  let current = state;
  for (let last = shuffled.length - 1; last > 0; last -= 1) {
    const step = randomInt(current, last + 1);
    current = step.state;
    [shuffled[last], shuffled[step.value]] = [shuffled[step.value] as T, shuffled[last] as T];
  }
  return { items: shuffled, state: current };
}

/** Si un valor leído de un snapshot es un estado del generador. */
export function isRandomState(value: unknown): value is RandomState {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffffffff) &&
    value.some((part) => part !== 0)
  );
}
