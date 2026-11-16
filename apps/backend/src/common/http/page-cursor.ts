const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Posición en una lista ordenada por fecha: la fecha y el identificador del último elemento visto. */
export interface PagePosition {
  readonly at: Date;
  readonly id: string;
}

/**
 * El cursor de una lista paginada: la fecha y el identificador del último
 * elemento de la página (ADR-013, decisión H15). Para el cliente es un
 * texto opaco: solo lo devuelve tal como lo recibió.
 */
export function encodePageCursor(position: PagePosition): string {
  const value = JSON.stringify([position.at.toISOString(), position.id]);
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** Lee un cursor. Devuelve `null` si no es uno que haya emitido el servidor. */
export function decodePageCursor(cursor: string): PagePosition | null {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length !== 2) return null;

  const [at, id] = value as unknown[];
  if (typeof at !== 'string' || typeof id !== 'string' || !UUID.test(id)) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== at) return null;
  return { at: date, id };
}
