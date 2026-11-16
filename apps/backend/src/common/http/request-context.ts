import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

declare global {
  namespace Express {
    interface Request {
      /** Identificador de la petición. Va también en la cabecera `X-Request-Id`. */
      requestId?: string;
    }
  }
}

const logger = new Logger('HTTP');

/**
 * Primer paso de toda petición: le da un identificador, lo devuelve en la
 * cabecera `X-Request-Id` (API, decisión A17) y anota la petición en el
 * registro de actividad cuando termina.
 *
 * Del registro quedan fuera la consulta de la URL, las cabeceras y el
 * cuerpo, para no guardar datos personales ni credenciales.
 */
export function requestContext(request: Request, response: Response, next: NextFunction): void {
  const requestId = randomUUID();
  const startedAt = performance.now();
  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);

  response.on('finish', () => {
    const entry = {
      requestId,
      method: request.method,
      path: request.path,
      status: response.statusCode,
      durationMs: Math.round(performance.now() - startedAt),
    };
    if (request.path === '/health') {
      logger.debug(entry);
    } else {
      logger.log(entry);
    }
  });

  next();
}
