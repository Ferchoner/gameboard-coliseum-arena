import { defineAsyncComponent } from 'vue';
import { blindFiveTexts } from './blind-five';
import { dominoesTexts } from './dominoes';
import { fourInARowTexts } from './four-in-a-row';
import { navalBattleTexts } from './naval-battle';
import type { GameUi } from './game-ui';
import { gameUiKey } from './keys';

export type { BoardProps, GameUi } from './game-ui';

/**
 * Los juegos que esta versión de la aplicación sabe mostrar, por juego y
 * versión mayor (ADR-018, decisión Z5). Cada tablero se carga solo cuando
 * se abre una partida de su juego (Z7). Añadir un juego es añadir aquí su
 * tablero y sus textos, que viven en su carpeta.
 */
const GAME_UIS: Readonly<Record<string, GameUi>> = {
  'four-in-a-row@1': {
    ...fourInARowTexts,
    board: defineAsyncComponent(() => import('./four-in-a-row/FourInARowBoard.vue')),
  },
  'naval-battle@1': {
    ...navalBattleTexts,
    board: defineAsyncComponent(() => import('./naval-battle/NavalBattleBoard.vue')),
  },
  'dominoes@1': {
    ...dominoesTexts,
    board: defineAsyncComponent(() => import('./dominoes/DominoesBoard.vue')),
  },
  'blind-five@1': {
    ...blindFiveTexts,
    board: defineAsyncComponent(() => import('./blind-five/BlindFiveBoard.vue')),
  },
};

export function gameUi(gameSlug: string, gameVersion: string): GameUi | null {
  return GAME_UIS[gameUiKey(gameSlug, gameVersion)] ?? null;
}

/** Si esta versión de la aplicación sabe mostrar ese juego en esa versión. */
export function knowsGame(gameSlug: string, gameVersion: string): boolean {
  return gameUi(gameSlug, gameVersion) !== null;
}
