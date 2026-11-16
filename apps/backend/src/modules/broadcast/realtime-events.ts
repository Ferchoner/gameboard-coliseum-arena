import type { GameEventView, RoomCloseReason } from '@gameboard/contracts';
import type { MatchSnapshot } from './match-snapshot.js';
import { Injectable, Logger } from '@nestjs/common';

/** Algo que ocurrió y que el canal de tiempo real tiene que contar a los clientes. */
export type RealtimeEvent =
  /** Cambió algo de una sala: sus miembros, sus marcas de listo o su estado. */
  | { readonly type: 'ROOM_CHANGED'; readonly roomId: string }
  | { readonly type: 'ROOM_CLOSED'; readonly roomId: string; readonly closeReason: RoomCloseReason }
  /**
   * Cambió una partida: empezó, alguien jugó, terminó o se anuló. Lleva la
   * partida tal como quedó guardada, para que cada participante reciba lo
   * que ve su asiento sin volver a leerla.
   */
  | {
      readonly type: 'MATCH_CHANGED';
      readonly snapshot: MatchSnapshot;
      /** Eventos de juego que produjo el cambio. Vacía si no hubo ninguno. */
      readonly events: readonly GameEventView[];
      /** La orden que provocó el cambio, si fue la orden de un jugador. */
      readonly origin: { readonly playerId: string; readonly requestId: string } | null;
    }
  /** Una sesión de autenticación dejó de valer: se cerró o caducó. */
  | { readonly type: 'SESSION_ENDED'; readonly sessionId: string };

export type RealtimeEventListener = (event: RealtimeEvent) => void;

/**
 * La única vía por la que un módulo avisa de un cambio (arquitectura,
 * regla 7; ADR-013, decisión H5). Los módulos publican aquí sin conocer el
 * WebSocket, y `realtime` escucha y decide a quién se lo envía.
 *
 * Se publica solo después de guardar: dentro de una transacción, con
 * `DatabaseService.afterCommit`.
 */
@Injectable()
export class RealtimeEvents {
  private readonly logger = new Logger(RealtimeEvents.name);
  private readonly listeners = new Set<RealtimeEventListener>();

  publish(event: RealtimeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.error(`Falló el envío de ${event.type}: ${String(error)}`);
      }
    }
  }

  /** Solo `realtime` escucha. Devuelve cómo dejar de hacerlo. */
  subscribe(listener: RealtimeEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
