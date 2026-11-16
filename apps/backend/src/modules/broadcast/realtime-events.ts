import type { RoomCloseReason } from '@gameboard/contracts';
import { Injectable, Logger } from '@nestjs/common';

/** Algo que ocurrió y que el canal de tiempo real tiene que contar a los clientes. */
export type RealtimeEvent =
  /** Cambió algo de una sala: sus miembros, sus marcas de listo o su estado. */
  | { readonly type: 'ROOM_CHANGED'; readonly roomId: string }
  | { readonly type: 'ROOM_CLOSED'; readonly roomId: string; readonly closeReason: RoomCloseReason }
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
