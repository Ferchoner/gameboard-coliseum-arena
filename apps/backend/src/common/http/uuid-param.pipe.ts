import type { ApiErrorCode } from '@gameboard/contracts';
import type { PipeTransform } from '@nestjs/common';
import { AppError } from '../errors/app-error.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un identificador recibido en la ruta. Si no tiene forma de UUID, lo que
 * nombra no puede existir, así que responde con el código de "no existe"
 * de ese recurso en lugar de llegar a la base de datos.
 *
 * Uso: `@Param('roomId', new UuidParam('ROOM_NOT_FOUND')) roomId: string`.
 */
export class UuidParam implements PipeTransform<string, string> {
  constructor(private readonly notFoundCode: ApiErrorCode) {}

  transform(value: string): string {
    if (!UUID.test(value)) {
      throw new AppError(this.notFoundCode, 'The identifier does not name anything');
    }
    return value.toLowerCase();
  }
}
