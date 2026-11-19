<script setup lang="ts">
import { reactive, ref } from 'vue';
import { navigateTo, useHead } from '#imports';
import FormField from '../components/FormField.vue';
import { useGuestOnly } from '../composables/useGuestOnly';
import { useSession } from '../composables/useSession';
import { es } from '../i18n/es';
import { failureText, type FieldTexts, fieldTexts } from '../utils/errors';
import { requiredTexts } from '../utils/forms';

useHead({ title: `${es.signIn.title} · ${es.app.name}` });
useGuestOnly();

const { signIn } = useSession();

const form = reactive({ username: '', password: '' });
const fieldErrors = ref<FieldTexts>({});
const formError = ref<string | null>(null);
const submitting = ref(false);

async function onSubmit(): Promise<void> {
  formError.value = null;
  fieldErrors.value = requiredTexts(form);
  if (Object.keys(fieldErrors.value).length > 0) return;

  submitting.value = true;
  const result = await signIn({ ...form });
  submitting.value = false;

  if (result.ok) {
    await navigateTo('/');
    return;
  }
  fieldErrors.value = fieldTexts(result.failure);
  formError.value = failureText(result.failure);
}
</script>

<template>
  <section class="form-page">
    <h1>{{ es.signIn.title }}</h1>

    <form novalidate @submit.prevent="onSubmit">
      <p v-if="formError" class="notice error" role="alert">{{ formError }}</p>

      <FormField
        v-model="form.username"
        name="username"
        autocomplete="username"
        :label="es.fields.username.label"
        :error="fieldErrors.username"
      />
      <FormField
        v-model="form.password"
        name="password"
        type="password"
        autocomplete="current-password"
        :label="es.fields.password.label"
        :error="fieldErrors.password"
      />

      <button type="submit" class="button" :disabled="submitting">
        {{ submitting ? es.signIn.submitting : es.signIn.submit }}
      </button>
    </form>

    <p class="muted">
      <NuxtLink to="/recuperar-contrasena">{{ es.signIn.forgotPassword }}</NuxtLink>
    </p>
    <p class="muted">
      {{ es.signIn.noAccount }} <NuxtLink to="/registro">{{ es.nav.register }}</NuxtLink>
    </p>
  </section>
</template>
