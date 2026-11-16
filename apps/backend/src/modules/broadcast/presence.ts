import { Injectable } from '@nestjs/common';

/**
 * Quién está conectado. Un jugador está presente mientras tenga al menos
 * una conexión abierta, muestre lo que muestre (ADR-009, regla 7.25). El
 * dato vive solo en memoria y no se guarda (regla 7.24).
 *
 * Lo escribe `realtime`, que es quien conoce las conexiones. Los demás
 * módulos solo preguntan.
 */
@Injectable()
export class Presence {
  private readonly connections = new Map<string, number>();

  isConnected(playerId: string): boolean {
    return (this.connections.get(playerId) ?? 0) > 0;
  }

  connectionCount(playerId: string): number {
    return this.connections.get(playerId) ?? 0;
  }

  /** Anota una conexión nueva. Devuelve `true` si el jugador pasa a estar presente. */
  connectionOpened(playerId: string): boolean {
    const count = this.connectionCount(playerId) + 1;
    this.connections.set(playerId, count);
    return count === 1;
  }

  /** Anota una conexión cerrada. Devuelve `true` si el jugador deja de estar presente. */
  connectionClosed(playerId: string): boolean {
    const count = this.connectionCount(playerId) - 1;
    if (count > 0) {
      this.connections.set(playerId, count);
      return false;
    }
    this.connections.delete(playerId);
    return true;
  }
}
