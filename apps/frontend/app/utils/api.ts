import { API_ERROR_CODES, type ApiError, type ApiErrorCode } from '@gameboard/contracts';

/** Por qué no se obtuvo lo que se pedía. */
export type Failure =
  /** El servidor respondió con un error del catálogo. */
  | { readonly kind: 'api'; readonly error: ApiError }
  /** No hubo respuesta: sin conexión, servidor caído o petición bloqueada por el navegador. */
  | { readonly kind: 'network' }
  /** Hubo respuesta, pero no tiene la forma del contrato. */
  | { readonly kind: 'unexpected' };

export type ApiResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly failure: Failure };

const KNOWN_CODES: ReadonlySet<string> = new Set(API_ERROR_CODES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApiError(value: unknown): value is ApiError {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    KNOWN_CODES.has(value.code) &&
    typeof value.message === 'string' &&
    (value.details === undefined || isRecord(value.details))
  );
}

/**
 * Lee una respuesta de la API según su sobre (`contracts/01-rest-api.md`):
 * `{ success: true, data }`, `{ success: false, error }` o `204` sin cuerpo.
 */
export function readApiResponse<T>(status: number, body: unknown): ApiResult<T> {
  const succeeded = status >= 200 && status < 300;

  if (status === 204) return { ok: true, data: undefined as T };
  if (isRecord(body)) {
    if (succeeded && body.success === true && 'data' in body) {
      return { ok: true, data: body.data as T };
    }
    if (!succeeded && body.success === false && isApiError(body.error)) {
      return { ok: false, failure: { kind: 'api', error: body.error } };
    }
  }
  return { ok: false, failure: { kind: 'unexpected' } };
}

/** El código del catálogo con el que falló una petición, si falló con uno. */
export function codeOf(result: ApiResult<unknown>): ApiErrorCode | null {
  return !result.ok && result.failure.kind === 'api' ? result.failure.error.code : null;
}
