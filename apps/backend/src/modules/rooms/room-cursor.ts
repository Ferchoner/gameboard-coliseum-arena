import type { RoomListPosition } from './rooms.repository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * El cursor de la lista de salas: la fecha de creación y el identificador
 * de la última sala de la página (ADR-013, decisión H15). Para el cliente
 * es un texto opaco: solo lo devuelve tal como lo recibió.
 */
export function encodeRoomCursor(position: RoomListPosition): string {
  const value = JSON.stringify([position.createdAt.toISOString(), position.id]);
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** Lee un cursor. Devuelve `null` si no es uno que haya emitido el servidor. */
export function decodeRoomCursor(cursor: string): RoomListPosition | null {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(value) || value.length !== 2) return null;

  const [createdAt, id] = value as unknown[];
  if (typeof createdAt !== 'string' || typeof id !== 'string' || !UUID.test(id)) return null;
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== createdAt) return null;
  return { createdAt: date, id };
}
