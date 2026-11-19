import type { MatchMode, TimeControl } from '@gameboard/contracts';
import type { AnyGameEngine } from '@gameboard/game-engine';

/** Las opciones de una sala que tiene que admitir la versión con la que se juega. */
export interface RoomOptions {
  readonly mode: MatchMode;
  readonly timeControl: TimeControl;
  readonly maxPlayers: number;
  readonly settings: unknown;
}

export type RoomOptionsCheck =
  | { readonly ok: true; readonly settings: unknown }
  | { readonly ok: false; readonly option: 'mode' | 'timeControl' | 'maxPlayers' }
  | { readonly ok: false; readonly option: 'settings'; readonly reason?: string };

/**
 * Comprueba que el motor de una versión admite las opciones de una sala.
 * Lo que un juego admite lo declara su motor (modelo de datos, decisión
 * R1). Se comprueba al crear la sala y, si la versión vigente cambia, antes
 * de cada partida (ADR-017, U5).
 */
export function checkRoomOptions(engine: AnyGameEngine, options: RoomOptions): RoomOptionsCheck {
  const { minPlayers, maxPlayers, timeControls } = engine.metadata;
  const admitted = timeControls[options.mode];
  if (admitted.length === 0) return { ok: false, option: 'mode' };
  const { timeControl } = options;
  if (
    !admitted.some((one) => one.type === timeControl.type && one.totalMs === timeControl.totalMs)
  ) {
    return { ok: false, option: 'timeControl' };
  }
  if (options.maxPlayers < minPlayers || options.maxPlayers > maxPlayers) {
    return { ok: false, option: 'maxPlayers' };
  }
  const settings = engine.parseSettings(options.settings);
  if (!settings.ok) {
    return settings.reason === undefined
      ? { ok: false, option: 'settings' }
      : { ok: false, option: 'settings', reason: settings.reason };
  }
  return { ok: true, settings: settings.value };
}
