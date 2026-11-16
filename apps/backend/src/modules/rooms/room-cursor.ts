import { decodePageCursor, encodePageCursor } from '../../common/http/page-cursor.js';
import type { RoomListPosition } from './rooms.repository.js';

/**
 * El cursor de la lista de salas: la fecha de creación y el identificador
 * de la última sala de la página (ADR-013, decisión H15).
 */
export function encodeRoomCursor(position: RoomListPosition): string {
  return encodePageCursor({ at: position.createdAt, id: position.id });
}

/** Lee un cursor. Devuelve `null` si no es uno que haya emitido el servidor. */
export function decodeRoomCursor(cursor: string): RoomListPosition | null {
  const position = decodePageCursor(cursor);
  return position ? { createdAt: position.at, id: position.id } : null;
}
