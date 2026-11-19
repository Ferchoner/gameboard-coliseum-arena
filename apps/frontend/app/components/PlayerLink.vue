<script setup lang="ts">
/** El nombre visible de un jugador, que lleva a su perfil público (ADR-017, U9). */
defineProps<{ readonly player: { readonly username: string; readonly displayName: string } }>();
</script>

<template>
  <NuxtLink class="player-link" :to="`/jugadores/${encodeURIComponent(player.username)}`">{{
    player.displayName
  }}</NuxtLink>
</template>
