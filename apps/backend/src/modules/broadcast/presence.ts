import { Injectable } from '@nestjs/common';

/**
 * Quién está conectado. Un jugador está presente mientras tenga al menos
 * una conexión abierta, muestre lo que muestre (ADR-009, regla 7.25), y
 * sigue presente un margen de unos segundos después de cerrar la última:
 * así recargar la página no lo muestra desconectado (ADR-015, decisión
 * V3). El dato vive solo en memoria y no se guarda (regla 7.24).
 *
 * Lo escribe `realtime`, que es quien conoce las conexiones y lleva el
 * margen. Los demás módulos solo preguntan.
 */
@Injectable()
export class Presence {
  private readonly connections = new Map<string, number>();
  private readonly present = new Set<string>();

  isConnected(playerId: string): boolean {
    return this.present.has(playerId);
  }

  connectionCount(playerId: string): number {
    return this.connections.get(playerId) ?? 0;
  }

  /**
   * Anota una conexión nueva. Devuelve `true` si el jugador pasa a estar
   * presente: si vuelve dentro del margen, ya lo estaba.
   */
  connectionOpened(playerId: string): boolean {
    this.connections.set(playerId, this.connectionCount(playerId) + 1);
    if (this.present.has(playerId)) return false;
    this.present.add(playerId);
    return true;
  }

  /**
   * Anota una conexión cerrada. Devuelve `true` si el jugador se queda sin
   * conexiones. Sigue presente hasta que se le dé por desconectado.
   */
  connectionClosed(playerId: string): boolean {
    const count = this.connectionCount(playerId) - 1;
    if (count > 0) {
      this.connections.set(playerId, count);
      return false;
    }
    this.connections.delete(playerId);
    return true;
  }

  /**
   * Da por desconectado a un jugador, pasado el margen. Devuelve `true` si
   * deja de estar presente: no lo hace si mientras tanto volvió a conectarse.
   */
  markAbsent(playerId: string): boolean {
    if (this.connectionCount(playerId) > 0) return false;
    return this.present.delete(playerId);
  }
}
