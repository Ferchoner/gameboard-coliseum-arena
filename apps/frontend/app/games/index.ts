import { fourInARowTexts } from './four-in-a-row';
import FourInARowBoard from './FourInARowBoard.vue';
import type { GameUi } from './game-ui';

export type { GameUi } from './game-ui';

/**
 * Los juegos que esta versión de la aplicación sabe mostrar, por su nombre
 * corto. Añadir un juego es añadir aquí su tablero y sus textos.
 */
const GAME_UIS: Readonly<Record<string, GameUi>> = {
  'four-in-a-row': { ...fourInARowTexts, board: FourInARowBoard },
};

export function gameUi(gameSlug: string): GameUi | null {
  return GAME_UIS[gameSlug] ?? null;
}
