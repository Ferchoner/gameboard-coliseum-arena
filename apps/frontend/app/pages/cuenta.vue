<script setup lang="ts">
import {
  BIOGRAPHY_MAX_LENGTH,
  changePasswordRequestSchema,
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  toValidationFields,
  type UpdateMeRequest,
  updateMeRequestSchema,
} from '@gameboard/contracts';
import { reactive, ref, watch } from 'vue';
import { useHead } from '#imports';
import FormField from '../components/FormField.vue';
import { useSession } from '../composables/useSession';
import { useSignedInOnly } from '../composables/useSignedInOnly';
import { es } from '../i18n/es';
import { failureText, type FieldTexts, fieldTexts, validationTexts } from '../utils/errors';
import { requiredTexts } from '../utils/forms';

useSignedInOnly();
useHead({ title: `${es.account.title} · ${es.app.name}` });

const { me, updateMe, changePassword } = useSession();

// --- Perfil ------------------------------------------------------------------

const profile = reactive({ displayName: '', biography: '' });
const profileErrors = ref<FieldTexts>({});
const profileError = ref<string | null>(null);
const profileNotice = ref<string | null>(null);
const savingProfile = ref(false);

// El formulario parte de la cuenta tal como está, también al llegar la sesión después de abrir la página.
watch(
  () => me.value?.userId,
  () => {
    profile.displayName = me.value?.displayName ?? '';
    profile.biography = me.value?.biography ?? '';
  },
  { immediate: true },
);

/** Solo lo que cambió. El servidor recorta los espacios (ADR-017, U13). */
function profileChanges(): UpdateMeRequest {
  const current = me.value;
  const changes: { displayName?: string; biography?: string | null } = {};
  if (profile.displayName.trim() !== current?.displayName) {
    changes.displayName = profile.displayName.trim();
  }
  const biography = profile.biography.trim() === '' ? null : profile.biography.trim();
  if (biography !== (current?.biography ?? null)) changes.biography = biography;
  return changes;
}

async function onSaveProfile(): Promise<void> {
  profileError.value = null;
  profileNotice.value = null;
  const changes = profileChanges();
  const parsed = updateMeRequestSchema.safeParse(changes);
  profileErrors.value = {
    ...(parsed.success ? {} : validationTexts(toValidationFields(parsed.error, changes))),
    ...requiredTexts({ displayName: profile.displayName.trim() }),
  };
  if (Object.keys(profileErrors.value).length > 0) return;
  if (Object.keys(changes).length === 0) {
    profileNotice.value = es.account.profile.unchanged;
    return;
  }

  savingProfile.value = true;
  const result = await updateMe(changes);
  savingProfile.value = false;

  if (result.ok) {
    profile.displayName = result.data.displayName;
    profile.biography = result.data.biography ?? '';
    profileNotice.value = es.account.profile.saved;
    return;
  }
  profileErrors.value = fieldTexts(result.failure);
  profileError.value = failureText(result.failure);
}

// --- Contraseña --------------------------------------------------------------

const password = reactive({ currentPassword: '', newPassword: '' });
const passwordErrors = ref<FieldTexts>({});
const passwordError = ref<string | null>(null);
const passwordNotice = ref<string | null>(null);
const savingPassword = ref(false);

async function onChangePassword(): Promise<void> {
  passwordError.value = null;
  passwordNotice.value = null;
  const parsed = changePasswordRequestSchema.safeParse(password);
  passwordErrors.value = {
    ...(parsed.success ? {} : validationTexts(toValidationFields(parsed.error, password))),
    ...requiredTexts(password),
  };
  if (Object.keys(passwordErrors.value).length > 0) return;

  savingPassword.value = true;
  const result = await changePassword({ ...password });
  savingPassword.value = false;

  if (result.ok) {
    password.currentPassword = '';
    password.newPassword = '';
    passwordNotice.value = es.account.password.changed;
    return;
  }
  // La contraseña actual equivocada se señala en su campo.
  if (result.failure.kind === 'api' && result.failure.error.code === 'INVALID_CURRENT_PASSWORD') {
    passwordErrors.value = { currentPassword: es.errors.INVALID_CURRENT_PASSWORD };
    return;
  }
  passwordErrors.value = fieldTexts(result.failure);
  passwordError.value = failureText(result.failure);
}
</script>

<template>
  <template v-if="me">
    <section class="intro">
      <h1>{{ es.account.title }}</h1>
      <p class="muted">{{ es.account.intro }}</p>
      <NuxtLink :to="`/jugadores/${encodeURIComponent(me.username)}`">
        {{ es.account.publicProfile }}
      </NuxtLink>
    </section>

    <section class="panel account-section" aria-labelledby="profile-title">
      <h2 id="profile-title">{{ es.account.profile.title }}</h2>

      <dl class="account-facts">
        <div>
          <dt>{{ es.account.profile.username }}</dt>
          <dd data-testid="account-username">{{ me.username }}</dd>
        </div>
        <div>
          <dt>{{ es.account.profile.email }}</dt>
          <dd>{{ me.email }}</dd>
        </div>
      </dl>

      <form class="stacked" novalidate @submit.prevent="onSaveProfile">
        <p v-if="profileError" class="notice error" role="alert">{{ profileError }}</p>
        <p v-if="profileNotice" class="notice ok" role="status">{{ profileNotice }}</p>

        <FormField
          v-model="profile.displayName"
          name="displayName"
          autocomplete="nickname"
          prose
          :label="es.fields.displayName.label"
          :hint="es.fields.displayName.hint(DISPLAY_NAME_MAX_LENGTH)"
          :error="profileErrors.displayName"
        />
        <FormField
          v-model="profile.biography"
          name="biography"
          autocomplete="off"
          multiline
          prose
          :label="es.fields.biography.label"
          :hint="es.fields.biography.hint(BIOGRAPHY_MAX_LENGTH)"
          :error="profileErrors.biography"
        />

        <div>
          <button type="submit" class="button" :disabled="savingProfile">
            {{ savingProfile ? es.account.profile.submitting : es.account.profile.submit }}
          </button>
        </div>
      </form>
    </section>

    <section class="panel account-section" aria-labelledby="password-title">
      <h2 id="password-title">{{ es.account.password.title }}</h2>
      <p class="muted">{{ es.account.password.intro }}</p>

      <form class="stacked" novalidate @submit.prevent="onChangePassword">
        <p v-if="passwordError" class="notice error" role="alert">{{ passwordError }}</p>
        <p v-if="passwordNotice" class="notice ok" role="status">{{ passwordNotice }}</p>

        <!-- Para que el gestor de contraseñas sepa de qué cuenta es. -->
        <input
          type="text"
          name="username"
          autocomplete="username"
          :value="me.username"
          hidden
          readonly
        />
        <FormField
          v-model="password.currentPassword"
          name="currentPassword"
          type="password"
          autocomplete="current-password"
          :label="es.fields.currentPassword.label"
          :error="passwordErrors.currentPassword"
        />
        <FormField
          v-model="password.newPassword"
          name="newPassword"
          type="password"
          autocomplete="new-password"
          :label="es.fields.newPassword.label"
          :hint="es.fields.password.hint(PASSWORD_MIN_LENGTH)"
          :error="passwordErrors.newPassword"
        />

        <div>
          <button type="submit" class="button" :disabled="savingPassword">
            {{ savingPassword ? es.account.password.submitting : es.account.password.submit }}
          </button>
        </div>
      </form>
    </section>
  </template>
</template>
