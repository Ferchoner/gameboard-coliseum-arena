import type { Game, RoomView } from '@gameboard/contracts';

/** Las capacidades de sala que admite un juego, de menor a mayor. */
export function playerCounts(game: Pick<Game, 'minPlayers' | 'maxPlayers'>): number[] {
  return Array.from(
    { length: game.maxPlayers - game.minPlayers + 1 },
    (_, index) => game.minPlayers + index,
  );
}

type RoomProgress = Pick<RoomView, 'mode' | 'maxPlayers' | 'members' | 'status'>;

/** Qué falta para que empiece la partida de una sala en espera (ADR-009, reglas 7.9 y 7.10). */
export type StartHint = 'whenFullAndReady' | 'whenFull' | 'whenAllReady' | 'allReady';

export function startHint(room: RoomProgress): StartHint {
  if (room.members.length < room.maxPlayers) {
    // Por turnos, la primera partida empieza en cuanto la sala se completa.
    return room.mode === 'TURN_BASED' ? 'whenFull' : 'whenFullAndReady';
  }
  return room.members.every((member) => member.ready) ? 'allReady' : 'whenAllReady';
}

/**
 * Si tiene sentido ofrecer la marca de "listo". En tiempo real, siempre
 * que la sala espere. Por turnos, solo con la sala completa: antes de eso
 * la partida empieza sola al completarse, sin marcas.
 */
export function canMarkReady(room: RoomProgress): boolean {
  if (room.status !== 'WAITING') return false;
  return room.mode === 'REALTIME' || room.members.length >= room.maxPlayers;
}

/** El nombre visible de quien creó la sala, si sigue en ella. */
export function ownerName(room: Pick<RoomView, 'ownerPlayerId' | 'members'>): string | null {
  return room.members.find((member) => member.playerId === room.ownerPlayerId)?.displayName ?? null;
}
