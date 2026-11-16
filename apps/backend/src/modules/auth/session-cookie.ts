import { Inject, Injectable } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'node:http';
import type { Response } from 'express';
import { Clock } from '../../common/clock.js';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import type { IssuedSession } from './sessions.service.js';

/**
 * Busca una cookie por su nombre en la cabecera `Cookie`. Devuelve `null`
 * si no está. Sirve igual para una petición de la API que para la apertura
 * de un WebSocket, que solo trae cabeceras.
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    const value = part.slice(separator + 1).trim();
    return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
  }
  return null;
}

/**
 * La cookie de sesión (ADR-004, condiciones 5.1 y 5.2; ADR-012, decisión S13).
 *
 * Es `HttpOnly` y `SameSite=Lax`, con la ruta `/` y sin `Domain`, de modo
 * que solo la recibe el host de la API. Lleva `Secure` siempre, salvo en
 * local sin HTTPS.
 */
@Injectable()
export class SessionCookie {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  /** Lee la cookie de una petición de la API o de la apertura de un WebSocket. */
  read(request: { readonly headers: IncomingHttpHeaders }): string | null {
    return readCookie(request.headers.cookie, this.config.session.cookieName);
  }

  /**
   * Entrega la sesión al navegador. La cookie dura hasta el tope de la
   * sesión; la caducidad por inactividad la aplica el servidor.
   */
  set(response: Response, session: IssuedSession): void {
    response.cookie(this.config.session.cookieName, session.token, {
      ...this.attributes(),
      maxAge: Math.max(0, session.absoluteExpiresAt.getTime() - this.clock.now().getTime()),
    });
  }

  clear(response: Response): void {
    response.clearCookie(this.config.session.cookieName, this.attributes());
  }

  private attributes() {
    return {
      httpOnly: true,
      secure: this.config.session.cookieSecure,
      sameSite: 'lax',
      path: '/',
    } as const;
  }
}
