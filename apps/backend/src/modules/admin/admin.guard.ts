import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppError } from '../../common/errors/app-error.js';

/**
 * Toda operación de `/admin` exige el rol `ADMIN` (matriz de permisos,
 * sección 5). Se comprueba después de la sesión y antes que la forma de
 * los datos, como fija el orden de la sección 7.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { auth } = context.switchToHttp().getRequest<Request>();
    if (auth?.role !== 'ADMIN') {
      throw new AppError('FORBIDDEN', 'The operation requires the administrator role');
    }
    return true;
  }
}
