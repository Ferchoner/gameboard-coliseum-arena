<script setup lang="ts">
import {
  type CreateRoomRequest,
  type Game,
  MATCH_MODES,
  type MatchMode,
  type RoomView,
} from '@gameboard/contracts';
import { computed, reactive, ref, watch } from 'vue';
import { useApi } from '../composables/useApi';
import { es } from '../i18n/es';
import { failureText } from '../utils/errors';
import { formatDuration } from '../utils/format';
import { playerCounts } from '../utils/rooms';

const props = defineProps<{ games: readonly Game[] }>();
const emit = defineEmits<{ created: [room: RoomView] }>();

const api = useApi();

const form = reactive({
  gameSlug: '',
  mode: 'REALTIME' as MatchMode,
  totalMs: 0,
  maxPlayers: 0,
  rematchEnabled: false,
});
const formError = ref<string | null>(null);
const submitting = ref(false);

const game = computed(() => props.games.find((one) => one.gameSlug === form.gameSlug) ?? null);
/** Lo que se puede elegir lo declara cada juego: el formulario no ofrece nada más. */
const modes = computed(() =>
  MATCH_MODES.filter((mode) => (game.value?.timeControls[mode].length ?? 0) > 0),
);
const timeControls = computed(() => game.value?.timeControls[form.mode] ?? []);
const counts = computed(() => (game.value ? playerCounts(game.value) : []));

// Al cambiar de juego o de modalidad, lo elegido antes puede dejar de valer.
watch(
  () => props.games,
  (games) => {
    if (!games.some((one) => one.gameSlug === form.gameSlug)) {
      form.gameSlug = games[0]?.gameSlug ?? '';
    }
  },
  { immediate: true },
);
watch(
  modes,
  (available) => {
    if (!available.includes(form.mode)) form.mode = available[0] ?? 'REALTIME';
  },
  { immediate: true },
);
watch(
  timeControls,
  (available) => {
    if (!available.some((control) => control.totalMs === form.totalMs)) {
      form.totalMs = available[0]?.totalMs ?? 0;
    }
  },
  { immediate: true },
);
watch(
  counts,
  (available) => {
    if (!available.includes(form.maxPlayers)) form.maxPlayers = available[0] ?? 0;
  },
  { immediate: true },
);

async function onSubmit(): Promise<void> {
  const timeControl = timeControls.value.find((control) => control.totalMs === form.totalMs);
  if (!game.value || !timeControl) return;

  formError.value = null;
  submitting.value = true;
  const body: CreateRoomRequest = {
    gameSlug: form.gameSlug,
    mode: form.mode,
    timeControl,
    maxPlayers: form.maxPlayers,
    rematchEnabled: form.mode === 'TURN_BASED' && form.rematchEnabled,
  };
  const result = await api.post<RoomView>('/rooms', body);
  submitting.value = false;

  if (result.ok) {
    emit('created', result.data);
  } else {
    formError.value = failureText(result.failure);
  }
}
</script>

<template>
  <form novalidate @submit.prevent="onSubmit">
    <p v-if="formError" class="notice error wide" role="alert">{{ formError }}</p>

    <div class="field">
      <label for="create-game">{{ es.rooms.create.game }}</label>
      <select id="create-game" v-model="form.gameSlug" name="gameSlug">
        <option v-for="one in games" :key="one.gameSlug" :value="one.gameSlug">
          {{ one.name }}
        </option>
      </select>
    </div>

    <div class="field">
      <label for="create-mode">{{ es.rooms.create.mode }}</label>
      <select id="create-mode" v-model="form.mode" name="mode">
        <option v-for="mode in modes" :key="mode" :value="mode">{{ es.home.modes[mode] }}</option>
      </select>
    </div>

    <div class="field">
      <label for="create-time">{{ es.rooms.create.timeControl }}</label>
      <select id="create-time" v-model.number="form.totalMs" name="totalMs">
        <option v-for="control in timeControls" :key="control.totalMs" :value="control.totalMs">
          {{ formatDuration(control.totalMs) }}
        </option>
      </select>
    </div>

    <div v-if="counts.length > 1" class="field">
      <label for="create-players">{{ es.rooms.create.maxPlayers }}</label>
      <select id="create-players" v-model.number="form.maxPlayers" name="maxPlayers">
        <option v-for="count in counts" :key="count" :value="count">{{ count }}</option>
      </select>
    </div>

    <div v-if="form.mode === 'TURN_BASED'" class="field wide">
      <div class="check">
        <input
          id="create-rematch"
          v-model="form.rematchEnabled"
          type="checkbox"
          name="rematchEnabled"
          aria-describedby="create-rematch-hint"
        />
        <label for="create-rematch">{{ es.rooms.create.rematch }}</label>
      </div>
      <p id="create-rematch-hint" class="hint">{{ es.rooms.create.rematchHint }}</p>
    </div>

    <div class="wide">
      <button type="submit" class="button" :disabled="submitting">
        {{ submitting ? es.rooms.create.submitting : es.rooms.create.submit }}
      </button>
    </div>
  </form>
</template>
