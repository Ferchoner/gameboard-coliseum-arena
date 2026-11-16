import { toValidationFields } from '@gameboard/contracts';
import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from '../errors/app-error.js';

/**
 * Valida el cuerpo de una petición con un esquema del paquete de contratos
 * (ADR-012, decisión S6). Si no lo cumple, rechaza con `VALIDATION_ERROR` e
 * indica qué campos fallan y por qué.
 *
 * Uso: `@Body(new ZodBody(registerRequestSchema)) body: RegisterRequest`.
 */
export class ZodBody<Schema extends z.ZodType> implements PipeTransform<unknown, z.output<Schema>> {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.output<Schema> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError('VALIDATION_ERROR', 'The request body is not valid', {
        fields: toValidationFields(result.error, value),
      });
    }
    return result.data;
  }
}
