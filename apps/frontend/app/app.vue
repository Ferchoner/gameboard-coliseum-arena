<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useRealtime } from './composables/useRealtime';
import { useSession } from './composables/useSession';

const { session, refresh } = useSession();
const realtime = useRealtime();

// La página pública se genera al construir, sin sesión. Se pregunta por ella ya en el navegador.
onMounted(refresh);

// La conexión de tiempo real es de toda la aplicación: se abre al iniciar
// sesión y se cierra al salir (protocolo, sección 2).
watch(
  () => session.value.status,
  (status) => {
    if (status === 'signedIn') realtime.start();
    else if (status === 'anonymous') realtime.stop();
  },
);
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
