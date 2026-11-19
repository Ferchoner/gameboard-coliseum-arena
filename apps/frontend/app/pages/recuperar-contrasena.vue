<script setup lang="ts">
import {
  PASSWORD_MIN_LENGTH,
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
  toValidationFields,
} from '@gameboard/contracts';
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useHead } from '#imports';
import FormField from '../components/FormField.vue';
import { useSession } from '../composables/useSession';
import { es } from '../i18n/es';
import { failureText, type FieldTexts, fieldTexts, validationTexts } from '../utils/errors';
import { requiredTexts } from '../utils/forms';
import { readResetToken } from '../utils/password-reset';

useHead({ title: `${es.passwordReset.title} · ${es.app.name}` });

const { requestPasswordReset, confirmPasswordReset } = useSession();

/**
 * El enlace del correo trae el token tras `#`, que el navegador no envía a
 * ningún servidor (ADR-017, U7). Se lee al abrir la página y se quita de la
 * dirección para que no quede en el historial.
 */
const token = ref<string | null>(null);

function takeTokenFromAddress(): void {
  const found = readResetToken(window.location.hash);
  if (!found) return;
  token.value = found;
  confirmed.value = false;
  tokenRejected.value = false;
  confirmError.value = null;
  history.replaceState(history.state, '', window.location.pathname + window.location.search);
}

// Si la página ya estaba abierta, el enlace solo cambia lo que va tras `#`.
onMounted(() => {
  takeTokenFromAddress();
  window.addEventListener('hashchange', takeTokenFromAddress);
});
onBeforeUnmount(() => window.removeEventListener('hashchange', takeTokenFromAddress));

// --- Pedir el enlace ---------------------------------------------------------

const request = reactive({ email: '' });
const requestErrors = ref<FieldTexts>({});
const requestError = ref<string | null>(null);
const requestedFor = ref<string | null>(null);
const requesting = ref(false);

async function onRequest(): Promise<void> {
  requestError.value = null;
  const parsed = passwordResetRequestSchema.safeParse(request);
  requestErrors.value = {
    ...(parsed.success ? {} : validationTexts(toValidationFields(parsed.error, request))),
    ...requiredTexts(request),
  };
  if (Object.keys(requestErrors.value).length > 0) return;

  requesting.value = true;
  const result = await requestPasswordReset({ email: request.email.trim() });
  requesting.value = false;

  if (result.ok) {
    requestedFor.value = request.email.trim();
    return;
  }
  requestErrors.value = fieldTexts(result.failure);
  requestError.value = failureText(result.failure);
}

// --- Fijar la contraseña nueva -----------------------------------------------

const confirm = reactive({ newPassword: '' });
const confirmErrors = ref<FieldTexts>({});
const confirmError = ref<string | null>(null);
const confirmed = ref(false);
const confirming = ref(false);
const tokenRejected = ref(false);

async function onConfirm(): Promise<void> {
  if (!token.value) return;
  confirmError.value = null;
  const body = { token: token.value, newPassword: confirm.newPassword };
  const parsed = passwordResetConfirmRequestSchema.safeParse(body);
  confirmErrors.value = {
    ...(parsed.success ? {} : validationTexts(toValidationFields(parsed.error, body))),
    ...requiredTexts(confirm),
  };
  if (Object.keys(confirmErrors.value).length > 0) return;

  confirming.value = true;
  const result = await confirmPasswordReset(body);
  confirming.value = false;

  if (result.ok) {
    confirmed.value = true;
    return;
  }
  if (result.failure.kind === 'api' && result.failure.error.code === 'INVALID_RESET_TOKEN') {
    tokenRejected.value = true;
  }
  confirmErrors.value = fieldTexts(result.failure);
  confirmError.value = failureText(result.failure);
}

/** Deja el enlace que no vale y vuelve a pedir otro. */
function requestAnother(): void {
  token.value = null;
  tokenRejected.value = false;
  confirmError.value = null;
}
</script>

<template>
  <section class="form-page">
    <h1>{{ es.passwordReset.title }}</h1>

    <template v-if="token">
      <template v-if="confirmed">
        <p class="notice ok" role="status">
          {{ es.passwordReset.confirmed }} {{ es.passwordReset.signedOutEverywhere }}
        </p>
        <NuxtLink class="button" to="/entrar">{{ es.passwordReset.goToSignIn }}</NuxtLink>
      </template>

      <form v-else novalidate @submit.prevent="onConfirm">
        <p class="muted">{{ es.passwordReset.confirmIntro }}</p>
        <div v-if="confirmError" class="notice error" role="alert">
          <p>{{ confirmError }}</p>
          <button v-if="tokenRejected" type="button" class="button quiet" @click="requestAnother">
            {{ es.passwordReset.requestAnother }}
          </button>
        </div>

        <FormField
          v-model="confirm.newPassword"
          name="newPassword"
          type="password"
          autocomplete="new-password"
          :label="es.fields.newPassword.label"
          :hint="es.fields.password.hint(PASSWORD_MIN_LENGTH)"
          :error="confirmErrors.newPassword"
        />

        <button type="submit" class="button" :disabled="confirming || tokenRejected">
          {{ confirming ? es.passwordReset.confirmSubmitting : es.passwordReset.confirmSubmit }}
        </button>
      </form>
    </template>

    <template v-else>
      <p v-if="requestedFor" class="notice ok" role="status">
        {{ es.passwordReset.requested(requestedFor) }}
      </p>

      <form v-else novalidate @submit.prevent="onRequest">
        <p class="muted">{{ es.passwordReset.requestIntro }}</p>
        <p v-if="requestError" class="notice error" role="alert">{{ requestError }}</p>

        <FormField
          v-model="request.email"
          name="email"
          type="email"
          autocomplete="email"
          :label="es.fields.email.label"
          :error="requestErrors.email"
        />

        <button type="submit" class="button" :disabled="requesting">
          {{ requesting ? es.passwordReset.requestSubmitting : es.passwordReset.requestSubmit }}
        </button>
      </form>
    </template>

    <p class="muted">
      <NuxtLink to="/entrar">{{ es.passwordReset.backToSignIn }}</NuxtLink>
    </p>
  </section>
</template>
