import { watchEffect } from 'vue';
import { navigateTo } from '#imports';
import { useSession } from './useSession';

/** Quien ya tiene sesión no necesita las páginas de registro ni de entrada. */
export function useGuestOnly(): void {
  const { session } = useSession();

  watchEffect(() => {
    if (session.value.status === 'signedIn') void navigateTo('/', { replace: true });
  });
}
