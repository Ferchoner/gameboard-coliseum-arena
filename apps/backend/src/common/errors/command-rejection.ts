/** Códigos con los que solo se rechaza una orden del canal de tiempo real. */
export type RealtimeOnlyRejectionCode =
  'STALE_STATE_VERSION' | 'CLOCK_EXPIRED' | 'NOT_YOUR_TURN' | 'INVALID_ACTION';

export interface CommandRejectionDetails {
  /** Motivo propio del juego, cuando el rechazo viene del motor. */
  readonly reason?: string;
  /** Versión actual del estado, cuando el código es `STALE_STATE_VERSION`. */
  readonly currentStateVersion?: number;
}

/**
 * El rechazo previsto de una orden de juego con un código que no existe en
 * la API, porque las jugadas solo viajan por el canal de tiempo real
 * (catálogo de errores). Los rechazos con códigos que también usa la API
 * siguen siendo un `AppError`.
 */
export class CommandRejection extends Error {
  constructor(
    readonly code: RealtimeOnlyRejectionCode,
    readonly details: CommandRejectionDetails = {},
  ) {
    super(`The command was rejected: ${code}`);
    this.name = 'CommandRejection';
  }
}
