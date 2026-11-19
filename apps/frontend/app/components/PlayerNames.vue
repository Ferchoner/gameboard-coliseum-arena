<script setup lang="ts">
import PlayerLink from './PlayerLink.vue';

/** Varios jugadores separados por comas, cada uno con el enlace a su perfil. */
defineProps<{
  readonly players: readonly { readonly username: string; readonly displayName: string }[];
}>();
</script>

<template>
  <template v-for="(player, index) in players" :key="player.username"
    >{{ index > 0 ? ', ' : '' }}<PlayerLink :player="player"
  /></template>
</template>
