import { API_BASE_PATH } from '@gameboard/contracts';
import { useRuntimeConfig } from '#imports';
import { type ApiResult, readApiResponse } from '../utils/api';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * Llamadas a la API. Envían siempre la cookie de sesión, porque la API vive
 * en otro origen del mismo sitio (ADR-004), y nunca lanzan: devuelven el
 * dato o el motivo del fallo.
 */
export function useApi() {
  const { apiOrigin } = useRuntimeConfig().public;

  async function request<T>(method: Method, path: string, body?: object): Promise<ApiResult<T>> {
    try {
      const response = await $fetch.raw<unknown>(`${API_BASE_PATH}${path}`, {
        baseURL: apiOrigin,
        method,
        ...(body === undefined ? {} : { body }),
        credentials: 'include',
        ignoreResponseError: true,
      });
      return readApiResponse<T>(response.status, response._data);
    } catch {
      return { ok: false, failure: { kind: 'network' } };
    }
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: object) => request<T>('POST', path, body),
  };
}
