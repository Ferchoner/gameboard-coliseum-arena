import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { SessionCookie } from './session-cookie.js';
import { type AuthContext, SessionsService } from './sessions.service.js';

declare global {
  namespace Express {
    interface Request {
      /** Quién hace la petición. Lo pone `SessionGuard` en las operaciones con sesión. */
      auth?: AuthContext;
    }
  }
}

const IS_PUBLIC = 'gameboard:public';

/**
 * Marca una operación que no exige sesión. Sin esta marca, toda operación
 * la exige: olvidarse de protegerla no la deja abierta.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Quién hace la petición, en una operación con sesión. */
export const CurrentAuth = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthContext => {
    const auth = context.switchToHttp().getRequest<Request>().auth;
    if (!auth) throw new Error('@CurrentAuth() se usó en una operación sin sesión');
    return auth;
  },
);

/**
 * Comprueba la sesión en la entrada de toda operación (matriz de permisos,
 * sección 7). Si no hay una sesión válida, responde `UNAUTHENTICATED`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly cookie: SessionCookie,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // El canal de tiempo real comprueba la sesión al abrir la conexión, no en cada mensaje.
    if (context.getType() !== 'http') return true;

    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const auth = await this.sessions.authenticate(this.cookie.read(request));
    if (!auth) {
      throw new AppError('UNAUTHENTICATED', 'There is no valid session');
    }
    request.auth = auth;
    return true;
  }
}
