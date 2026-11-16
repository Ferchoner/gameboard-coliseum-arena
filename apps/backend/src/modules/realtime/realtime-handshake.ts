import type { IncomingMessage } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { SessionCookie } from '../auth/session-cookie.js';
import { type AuthContext, SessionsService } from '../auth/sessions.service.js';

/** Estado HTTP con el que se rechaza una apertura. El navegador no se lo muestra a la página. */
export type HandshakeRejection = 401 | 403;

/**
 * Decide si se acepta la apertura de una conexión, antes de completarla
 * (ADR-003, condición 5.4; ADR-013, decisión H4). Comprueba lo mismo que
 * la entrada de la API y en el mismo orden: primero el origen y después
 * la sesión, que sale de la cookie y de ningún otro sitio.
 */
@Injectable()
export class RealtimeHandshake {
  /** De quién es cada apertura aceptada, hasta que el canal la recoge. */
  private readonly accepted = new WeakMap<IncomingMessage, AuthContext>();

  constructor(
    private readonly sessions: SessionsService,
    private readonly cookie: SessionCookie,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Devuelve `null` si la apertura se acepta, o el estado con el que se rechaza. */
  async verify(request: IncomingMessage): Promise<HandshakeRejection | null> {
    // Un WebSocket no está sujeto a CORS: sin esta comprobación, cualquier
    // página podría abrir el canal con la cookie del jugador (ADR-004, condición 5.5).
    if (request.headers.origin !== this.config.http.frontendOrigin) return 403;

    const auth = await this.sessions.authenticate(this.cookie.read(request));
    if (!auth) return 401;

    this.accepted.set(request, auth);
    return null;
  }

  /** De quién es la conexión que se abrió con esa petición. */
  identify(request: IncomingMessage): AuthContext | null {
    return this.accepted.get(request) ?? null;
  }
}
