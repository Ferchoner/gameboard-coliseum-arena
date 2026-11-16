<script setup lang="ts">
import { onMounted } from 'vue';
import { useSession } from './composables/useSession';

const { refresh } = useSession();

// La página pública se genera al construir, sin sesión. Se pregunta por ella ya en el navegador.
onMounted(refresh);
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
