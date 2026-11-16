import { toValidationFields } from '@gameboard/contracts';
import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from '../errors/app-error.js';

/**
 * Valida los parámetros de la dirección de una petición con un esquema del
 * paquete de contratos, igual que `ZodBody` hace con el cuerpo. Si no lo
 * cumplen, rechaza con `VALIDATION_ERROR` e indica cuáles fallan.
 *
 * Uso: `@Query(new ZodQuery(listRoomsQuerySchema)) query: ListRoomsQuery`.
 */
export class ZodQuery<Schema extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<Schema>
> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.output<Schema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError('VALIDATION_ERROR', 'The query parameters are not valid', {
        fields: toValidationFields(result.error, value),
      });
    }
    return result.data;
  }
}
