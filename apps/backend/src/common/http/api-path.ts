import { API_BASE_PATH } from '@gameboard/contracts';

/**
 * Ruta de un controlador de la API, con la ruta base y la versión delante.
 * Por ejemplo, `apiPath('auth')` es `/api/v1/auth`.
 */
export function apiPath(path: string): string {
  return `${API_BASE_PATH}/${path}`;
}
