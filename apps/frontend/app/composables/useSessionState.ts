import type { Me } from '@gameboard/contracts';
import { useState } from '#imports';
import type { Failure } from '../utils/api';

export type Session =
  /** Todavía no se ha preguntado al servidor. */
  | { readonly status: 'unknown' }
  | { readonly status: 'anonymous' }
  | { readonly status: 'signedIn'; readonly me: Me }
  /** No se pudo saber: el servidor no contestó como se esperaba. */
  | { readonly status: 'unavailable'; readonly failure: Failure };

/**
 * Lo que la aplicación sabe de la sesión, compartido por toda ella. Está
 * aparte de `useSession` porque también lo anota `useApi`, que `useSession` usa.
 */
export function useSessionState() {
  return useState<Session>('session', () => ({ status: 'unknown' }));
}
