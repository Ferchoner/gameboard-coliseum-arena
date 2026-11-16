import { watchEffect } from 'vue';
import { navigateTo } from '#imports';
import { useSession } from './useSession';

/** Las salas son para quien tiene sesión: quien no la tiene va a la página de entrada. */
export function useSignedInOnly(): void {
  const { session } = useSession();

  watchEffect(() => {
    if (session.value.status === 'anonymous') void navigateTo('/entrar', { replace: true });
  });
}
