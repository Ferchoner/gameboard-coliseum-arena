<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  autocomplete: string;
  hint?: string | undefined;
  error?: string | undefined;
  /** Texto de varias líneas, como la biografía. */
  multiline?: boolean;
  /** Texto escrito por la persona, como su nombre visible: con mayúsculas y corrector. */
  prose?: boolean;
  readonly?: boolean;
}>();

const value = defineModel<string>({ required: true });

const describedBy = computed(() => {
  const ids = [
    props.hint ? `${props.name}-hint` : null,
    props.error ? `${props.name}-error` : null,
  ].filter((id) => id !== null);
  return ids.length > 0 ? ids.join(' ') : undefined;
});

const textAttributes = computed(() =>
  props.prose ? {} : { autocapitalize: 'none', spellcheck: false },
);
</script>

<template>
  <div class="field">
    <label :for="name">{{ label }}</label>
    <textarea
      v-if="multiline"
      :id="name"
      v-model="value"
      :name="name"
      :autocomplete="autocomplete"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      :readonly="readonly"
      rows="4"
      v-bind="textAttributes"
    />
    <input
      v-else
      :id="name"
      v-model="value"
      :name="name"
      :type="type ?? 'text'"
      :autocomplete="autocomplete"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="describedBy"
      :readonly="readonly"
      v-bind="textAttributes"
    />
    <p v-if="hint" :id="`${name}-hint`" class="hint">{{ hint }}</p>
    <p v-if="error" :id="`${name}-error`" class="field-error">{{ error }}</p>
  </div>
</template>
