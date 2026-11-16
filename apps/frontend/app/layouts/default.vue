<script setup lang="ts">
import { computed, ref } from 'vue';
import { navigateTo } from '#imports';
import { useRealtime } from '../composables/useRealtime';
import { useSession } from '../composables/useSession';
import { es } from '../i18n/es';
import { failureText } from '../utils/errors';

const { session, me, signOut } = useSession();
const { state: connection, realtimeMatches } = useRealtime();

/** Lo que hay que contar de la conexión de tiempo real, si hay algo que contar. */
const connectionNotice = computed(() => {
  if (!me.value) return null;
  if (connection.value.status === 'reconnecting') {
    // Sin conexión corre el plazo de abandono de sus partidas en tiempo real (regla 7.26).
    return realtimeMatches.value.length > 0
      ? `${es.realtime.reconnecting} ${es.realtime.reconnectingInMatch}`
      : es.realtime.reconnecting;
  }
  // El fin de la sesión lo cuenta la propia sesión, que lleva a la página de entrada.
  if (connection.value.status === 'stopped' && connection.value.reason !== 'SESSION_ENDED') {
    return es.realtime.stopped[connection.value.reason];
  }
  return null;
});

const signingOut = ref(false);
const notice = ref<string | null>(null);

async function onSignOut(): Promise<void> {
  signingOut.value = true;
  notice.value = null;
  const result = await signOut();
  signingOut.value = false;

  if (session.value.status === 'anonymous') {
    await navigateTo('/');
  } else if (!result.ok) {
    notice.value = failureText(result.failure);
  }
}
</script>

<template>
  <div class="page">
    <header class="site-header">
      <NuxtLink class="brand" to="/">{{ es.app.name }}</NuxtLink>

      <nav class="site-nav" :aria-label="es.app.name">
        <template v-if="me">
          <NuxtLink class="nav-link" to="/salas">{{ es.nav.rooms }}</NuxtLink>
          <NuxtLink class="nav-link" to="/partidas">{{ es.nav.matches }}</NuxtLink>
          <span class="who">
            <span class="visually-hidden">{{ es.nav.signedInAs }}</span>
            {{ me.displayName }}
          </span>
          <button type="button" class="button quiet" :disabled="signingOut" @click="onSignOut">
            {{ signingOut ? es.nav.signingOut : es.nav.signOut }}
          </button>
        </template>
        <template v-else-if="session.status === 'anonymous'">
          <NuxtLink class="button quiet" to="/entrar">{{ es.nav.signIn }}</NuxtLink>
          <NuxtLink class="button" to="/registro">{{ es.nav.register }}</NuxtLink>
        </template>
      </nav>
    </header>

    <p v-if="notice" class="notice error" role="alert">{{ notice }}</p>
    <p v-else-if="session.status === 'unavailable'" class="notice error" role="alert">
      {{ es.client.sessionUnknown }} {{ failureText(session.failure) }}
    </p>

    <p v-if="connectionNotice" class="notice warning" role="status">{{ connectionNotice }}</p>

    <main class="content">
      <slot />
    </main>
  </div>
</template>
