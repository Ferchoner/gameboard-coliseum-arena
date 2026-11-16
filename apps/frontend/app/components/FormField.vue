<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  autocomplete: string;
  hint?: string | undefined;
  error?: string | undefined;
}>();

const value = defineModel<string>({ required: true });

const describedBy = computed(() => {
  const ids = [
    props.hint ? `${props.name}-hint` : null,
    props.error ? `${props.name}-error` : null,
  ].filter((id) => id !== null);
  return ids.length > 0 ? ids.join(' ') : undefined;
});
</script>

<template>
  <div class="field">
    <label :for="name">{{ label }}</label>
    <input
      :id="name"
      v-model="value"
      :name="name"
      :type="type ?? 'text'"
      :autocomplete="autocomplete"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      autocapitalize="none"
      spellcheck="false"
    />
    <p v-if="hint" :id="`${name}-hint`" class="hint">{{ hint }}</p>
    <p v-if="error" :id="`${name}-error`" class="field-error">{{ error }}</p>
  </div>
</template>
