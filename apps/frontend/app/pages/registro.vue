<script setup lang="ts">
import {
  PASSWORD_MIN_LENGTH,
  registerRequestSchema,
  toValidationFields,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@gameboard/contracts';
import { reactive, ref } from 'vue';
import { navigateTo, useHead } from '#imports';
import FormField from '../components/FormField.vue';
import { useGuestOnly } from '../composables/useGuestOnly';
import { useSession } from '../composables/useSession';
import { es } from '../i18n/es';
import { failureText, type FieldTexts, fieldTexts, validationTexts } from '../utils/errors';
import { requiredTexts } from '../utils/forms';

useHead({ title: `${es.register.title} · ${es.app.name}` });
useGuestOnly();

const { register } = useSession();

const form = reactive({ email: '', username: '', password: '' });
const fieldErrors = ref<FieldTexts>({});
const formError = ref<string | null>(null);
const submitting = ref(false);

/** Las mismas reglas que aplica el servidor, para avisar antes de enviar. */
function check(): FieldTexts {
  const parsed = registerRequestSchema.safeParse(form);
  const invalid = parsed.success ? {} : validationTexts(toValidationFields(parsed.error, form));
  return { ...invalid, ...requiredTexts(form) };
}

async function onSubmit(): Promise<void> {
  formError.value = null;
  fieldErrors.value = check();
  if (Object.keys(fieldErrors.value).length > 0) return;

  submitting.value = true;
  const result = await register({ ...form });
  submitting.value = false;

  if (result.ok) {
    await navigateTo('/');
    return;
  }
  fieldErrors.value = fieldTexts(result.failure);
  // Un dato ya en uso se señala en su campo; cualquier otro fallo, sobre el formulario.
  const code = result.failure.kind === 'api' ? result.failure.error.code : null;
  if (code !== 'EMAIL_TAKEN' && code !== 'USERNAME_TAKEN') {
    formError.value = failureText(result.failure);
  }
}
</script>

<template>
  <section class="form-page">
    <h1>{{ es.register.title }}</h1>

    <form novalidate @submit.prevent="onSubmit">
      <p v-if="formError" class="notice error" role="alert">{{ formError }}</p>

      <FormField
        v-model="form.email"
        name="email"
        type="email"
        autocomplete="email"
        :label="es.fields.email.label"
        :error="fieldErrors.email"
      />
      <FormField
        v-model="form.username"
        name="username"
        autocomplete="username"
        :label="es.fields.username.label"
        :hint="es.fields.username.hint(USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH)"
        :error="fieldErrors.username"
      />
      <FormField
        v-model="form.password"
        name="password"
        type="password"
        autocomplete="new-password"
        :label="es.fields.password.label"
        :hint="es.fields.password.hint(PASSWORD_MIN_LENGTH)"
        :error="fieldErrors.password"
      />

      <button type="submit" class="button" :disabled="submitting">
        {{ submitting ? es.register.submitting : es.register.submit }}
      </button>
    </form>

    <p class="muted">
      {{ es.register.haveAccount }} <NuxtLink to="/entrar">{{ es.nav.signIn }}</NuxtLink>
    </p>
  </section>
</template>
