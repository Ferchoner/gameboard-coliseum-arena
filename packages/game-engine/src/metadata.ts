import type { GameMetadata, MatchMode } from './contract.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/** Lo más que puede durar el reloj de un jugador en tiempo real (ADR-009, regla 7.2). */
export const MAX_REALTIME_TOTAL_MS = 30 * MINUTE_MS;

/** Los relojes que admite la modalidad por turnos (ADR-009, regla 7.2; ADR-016, N1). */
export const TURN_BASED_TOTALS_MS: readonly number[] = [12, 24, 36].map((hours) => hours * HOUR_MS);

const MODES: readonly MatchMode[] = ['REALTIME', 'TURN_BASED'];

/**
 * Lo que incumplen los metadatos de un motor, en frases para quien lo
 * escribe. Vacío si los cumple todos (ADR-018, decisión Z4):
 *
 * - `minPlayers` y `maxPlayers` son enteros y `1 <= minPlayers <= maxPlayers`.
 * - Admite al menos una modalidad.
 * - En tiempo real, cada control dura más de 0 y como mucho 30 minutos.
 * - Por turnos, cada control es de 12, 24 o 36 horas.
 * - No repite controles en una modalidad.
 */
export function metadataProblems(metadata: GameMetadata): string[] {
  const problems: string[] = [];
  const { minPlayers, maxPlayers, timeControls } = metadata;

  if (!Number.isInteger(minPlayers) || !Number.isInteger(maxPlayers)) {
    problems.push('minPlayers y maxPlayers deben ser enteros');
  } else if (minPlayers < 1 || minPlayers > maxPlayers) {
    problems.push(
      `debe cumplirse 1 <= minPlayers <= maxPlayers (son ${minPlayers} y ${maxPlayers})`,
    );
  }

  if (MODES.every((mode) => (timeControls[mode] ?? []).length === 0)) {
    problems.push(
      'no admite ninguna modalidad: las dos listas de controles de tiempo están vacías',
    );
  }

  for (const mode of MODES) {
    const controls = timeControls[mode] ?? [];
    const totals = controls.map((control) => control.totalMs);
    if (new Set(totals).size !== totals.length) {
      problems.push(`repite un control de tiempo en ${mode}`);
    }
    for (const control of controls) {
      if (control.type !== 'TOTAL_PER_PLAYER') {
        problems.push(`${mode}: tipo de control desconocido ${String(control.type)}`);
        continue;
      }
      const valid =
        mode === 'REALTIME'
          ? Number.isInteger(control.totalMs) &&
            control.totalMs > 0 &&
            control.totalMs <= MAX_REALTIME_TOTAL_MS
          : TURN_BASED_TOTALS_MS.includes(control.totalMs);
      if (!valid) {
        problems.push(
          mode === 'REALTIME'
            ? `REALTIME: ${control.totalMs} ms no está entre 1 ms y 30 minutos (regla 7.2)`
            : `TURN_BASED: ${control.totalMs} ms no es 12, 24 ni 36 horas (regla 7.2)`,
        );
      }
    }
  }
  return problems;
}
