<script setup lang="ts">
import { ref } from 'vue';
import { navigateTo } from '#imports';
import { useSession } from '../composables/useSession';
import { es } from '../i18n/es';
import { failureText } from '../utils/errors';

const { session, me, signOut } = useSession();

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

    <main class="content">
      <slot />
    </main>
  </div>
</template>
