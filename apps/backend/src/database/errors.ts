const UNIQUE_VIOLATION = '23505';

interface PostgresError {
  readonly code?: unknown;
  readonly constraint?: unknown;
  readonly cause?: unknown;
}

/**
 * Si el error es una violación de unicidad de PostgreSQL, devuelve el nombre
 * de la restricción incumplida. Si no lo es, devuelve `null`.
 *
 * Drizzle envuelve el error del controlador, así que se busca también en
 * la cadena de causas.
 */
export function uniqueViolationOf(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    const candidate = current as PostgresError;
    if (candidate.code === UNIQUE_VIOLATION) {
      return typeof candidate.constraint === 'string' ? candidate.constraint : '';
    }
    current = candidate.cause;
  }
  return null;
}
