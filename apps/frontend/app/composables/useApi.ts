import { API_BASE_PATH } from '@gameboard/contracts';
import { useRuntimeConfig } from '#imports';
import { type ApiResult, codeOf, readApiResponse } from '../utils/api';
import { useSessionState } from './useSessionState';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Llamadas a la API. Envían siempre la cookie de sesión, porque la API vive
 * en otro origen del mismo sitio (ADR-004), y nunca lanzan: devuelven el
 * dato o el motivo del fallo.
 */
export function useApi() {
  const { apiOrigin } = useRuntimeConfig().public;
  const session = useSessionState();

  /**
   * Si la API dice que no hay sesión mientras la aplicación cree que sí, la
   * sesión terminó: caducó o se cerró en otra pestaña. Lo anota para que
   * toda la aplicación lo sepa, la pida quien la pida.
   */
  function noticeSessionEnd<T>(result: ApiResult<T>): ApiResult<T> {
    if (codeOf(result) === 'UNAUTHENTICATED' && session.value.status === 'signedIn') {
      session.value = { status: 'anonymous' };
    }
    return result;
  }

  async function request<T>(method: Method, path: string, body?: object): Promise<ApiResult<T>> {
    try {
      const response = await $fetch.raw<unknown>(`${API_BASE_PATH}${path}`, {
        baseURL: apiOrigin,
        method,
        ...(body === undefined ? {} : { body }),
        credentials: 'include',
        ignoreResponseError: true,
      });
      return noticeSessionEnd(readApiResponse<T>(response.status, response._data));
    } catch {
      return { ok: false, failure: { kind: 'network' } };
    }
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: object) => request<T>('POST', path, body),
    put: <T>(path: string, body?: object) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: object) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  };
}
