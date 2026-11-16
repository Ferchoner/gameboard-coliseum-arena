import type { ApiSuccess } from '@gameboard/contracts';
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import { RAW_RESPONSE } from './raw-response.decorator.js';

/**
 * Envuelve el resultado de cada operación en el sobre de respuesta de la
 * API: `{ success: true, data }`. Una operación sin resultado responde sin
 * cuerpo.
 */
@Injectable()
export class EnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean | undefined>(RAW_RESPONSE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();

    return next
      .handle()
      .pipe(
        map((data: unknown) =>
          data === undefined ? undefined : ({ success: true, data } satisfies ApiSuccess<unknown>),
        ),
      );
  }
}
