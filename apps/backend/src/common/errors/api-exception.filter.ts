import type { ApiFailure } from '@gameboard/contracts';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RouteTable } from '../http/route-table.js';
import { AppError } from './app-error.js';

/** Errores que el intérprete del cuerpo de la petición deja con un `type` propio. */
interface BodyParserError {
  readonly type: string;
  readonly status: number;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as BodyParserError).type === 'string' &&
    typeof (error as BodyParserError).status === 'number'
  );
}

/** Así empieza el mensaje con el que NestJS rechaza una petición de otro origen. */
const CROSS_ORIGIN_MESSAGE = 'Cross-origin request detected';

const INVALID_BODY = { fields: [{ field: 'body', rule: 'INVALID_FORMAT' }] } as const;

/**
 * Fallos que el framework o sus piezas producen por su cuenta, según su
 * estado HTTP. El texto es fijo: el del fallo original puede dar detalles
 * internos.
 */
const BY_STATUS: Readonly<Record<number, () => AppError>> = {
  400: () => new AppError('VALIDATION_ERROR', 'The request body is not valid JSON', INVALID_BODY),
  401: () => new AppError('UNAUTHENTICATED', 'There is no valid session'),
  403: () => new AppError('FORBIDDEN', 'The account is not allowed to do this'),
  404: () => new AppError('ROUTE_NOT_FOUND', 'The route does not exist'),
  405: () => new AppError('METHOD_NOT_ALLOWED', 'The method is not allowed on this route'),
  413: () => new AppError('PAYLOAD_TOO_LARGE', 'The request body is too large'),
  429: () => new AppError('RATE_LIMITED', 'Too many requests'),
};

/**
 * Convierte cualquier fallo en la respuesta de error del contrato:
 * `{ success: false, error: { code, message, details } }`, con un código
 * del catálogo y su estado HTTP.
 *
 * Un fallo no previsto responde `INTERNAL_ERROR` sin dar detalles, y el
 * detalle queda en el registro junto al identificador de la petición.
 */
@Injectable()
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  constructor(private readonly routes: RouteTable) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const error = this.toAppError(exception, request, response);
    if (!error) {
      this.logger.error(
        { requestId: request.requestId, method: request.method, path: request.path },
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiFailure = {
      success: false,
      error: error
        ? {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          }
        : { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    };

    if (response.headersSent) return;
    response.status(error?.status ?? 500).json(body);
  }

  /** Devuelve el fallo previsto que corresponde, o `null` si es un fallo interno. */
  private toAppError(exception: unknown, request: Request, response: Response): AppError | null {
    if (exception instanceof AppError) return exception;

    // Un cuerpo que no se puede leer: demasiado grande o JSON mal formado.
    if (isBodyParserError(exception)) {
      if (exception.status === 413) return BY_STATUS[413]?.() ?? null;
      if (exception.status >= 400 && exception.status < 500) return BY_STATUS[400]?.() ?? null;
      return null;
    }

    if (exception instanceof NotFoundException) {
      const allowed = this.routes.allowedMethods(request.path);
      if (allowed.length > 0) {
        response.setHeader('Allow', allowed.join(', '));
        return new AppError('METHOD_NOT_ALLOWED', `${request.method} is not allowed on this route`);
      }
      return new AppError('ROUTE_NOT_FOUND', 'The route does not exist');
    }

    if (
      exception instanceof ForbiddenException &&
      exception.message.startsWith(CROSS_ORIGIN_MESSAGE)
    ) {
      return new AppError('ORIGIN_NOT_ALLOWED', 'The request does not come from an allowed origin');
    }

    if (exception instanceof HttpException) {
      return BY_STATUS[exception.getStatus()]?.() ?? null;
    }

    return null;
  }
}
