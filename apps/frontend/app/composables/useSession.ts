import type { LoginRequest, Me, RegisterRequest } from '@gameboard/contracts';
import { computed } from 'vue';
import { type ApiResult, codeOf } from '../utils/api';
import { useApi } from './useApi';
import { useSessionState } from './useSessionState';

export type { Session } from './useSessionState';

/**
 * La sesión de quien usa la aplicación. La cookie no se puede leer desde
 * el navegador, así que se sabe quién es preguntando a `GET /me`.
 */
export function useSession() {
  const session = useSessionState();
  const api = useApi();

  function accept(result: ApiResult<Me>): ApiResult<Me> {
    if (result.ok) session.value = { status: 'signedIn', me: result.data };
    return result;
  }

  async function refresh(): Promise<void> {
    const result = await api.get<Me>('/me');
    if (result.ok) {
      session.value = { status: 'signedIn', me: result.data };
    } else if (codeOf(result) === 'UNAUTHENTICATED') {
      session.value = { status: 'anonymous' };
    } else {
      session.value = { status: 'unavailable', failure: result.failure };
    }
  }

  /**
   * Comprueba si la sesión sigue valiendo, sin perder lo que ya se sabe si
   * el servidor no contesta. Devuelve `false` solo si se sabe que ya no hay sesión.
   */
  async function stillSignedIn(): Promise<boolean> {
    const result = await api.get<Me>('/me');
    if (result.ok) {
      session.value = { status: 'signedIn', me: result.data };
    } else if (codeOf(result) === 'UNAUTHENTICATED') {
      session.value = { status: 'anonymous' };
      return false;
    }
    return true;
  }

  async function register(body: RegisterRequest): Promise<ApiResult<Me>> {
    return accept(await api.post<Me>('/auth/register', body));
  }

  async function signIn(body: LoginRequest): Promise<ApiResult<Me>> {
    return accept(await api.post<Me>('/auth/login', body));
  }

  async function signOut(): Promise<ApiResult<undefined>> {
    const result = await api.post<undefined>('/auth/logout');
    // Sin sesión en el servidor, la salida ya está hecha.
    if (result.ok || codeOf(result) === 'UNAUTHENTICATED') {
      session.value = { status: 'anonymous' };
    }
    return result;
  }

  return {
    session,
    me: computed(() => (session.value.status === 'signedIn' ? session.value.me : null)),
    refresh,
    stillSignedIn,
    register,
    signIn,
    signOut,
  };
}
