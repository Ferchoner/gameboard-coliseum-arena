import { type ApiErrorCode, httpStatusOf } from '@gameboard/contracts';

/**
 * Un fallo previsto, con un código del catálogo de errores. Es la única
 * forma en que el código de la aplicación rechaza una petición: el filtro
 * de errores lo convierte en la respuesta que fija el contrato.
 */
export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ApiErrorCode,
    /** Texto en inglés, para quien desarrolla. No se muestra al usuario. */
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = httpStatusOf(code);
  }
}
