import type { Game, ItemList } from '@gameboard/contracts';
import { computed } from 'vue';
import { useState } from '#imports';
import { knowsGame } from '../games';
import type { Failure } from '../utils/api';
import { useApi } from './useApi';

export type Catalog =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly games: readonly Game[] }
  | { readonly status: 'failed'; readonly failure: Failure };

/**
 * El catálogo de juegos, compartido por las páginas que lo muestran. Se
 * pide en el navegador, porque puede cambiar sin que se vuelva a construir
 * el sitio.
 */
export function useCatalog() {
  const catalog = useState<Catalog>('catalog', () => ({ status: 'loading' }));
  const api = useApi();

  async function load(): Promise<void> {
    if (catalog.value.status === 'failed') catalog.value = { status: 'loading' };
    const result = await api.get<ItemList<Game>>('/games');
    catalog.value = result.ok
      ? { status: 'ready', games: result.data.items }
      : { status: 'failed', failure: result.failure };
  }

  const allGames = computed(() => (catalog.value.status === 'ready' ? catalog.value.games : []));

  /**
   * Los juegos que se ofrecen: los del catálogo que esta versión de la
   * aplicación sabe mostrar (ADR-018, decisión Z5).
   */
  const games = computed(() =>
    allGames.value.filter((game) => knowsGame(game.gameSlug, game.gameVersion)),
  );

  /** Cuántos juegos del catálogo no sabe mostrar: hay una versión más nueva de la aplicación. */
  const unknownGames = computed(() => allGames.value.length - games.value.length);

  /** El nombre de un juego. Si el catálogo no lo tiene, su nombre corto. */
  function gameName(gameSlug: string): string {
    return allGames.value.find((game) => game.gameSlug === gameSlug)?.name ?? gameSlug;
  }

  /**
   * Si el catálogo tiene ese juego en una versión que esta aplicación no sabe
   * mostrar. Una sala no dice su versión: se juega en la vigente del
   * catálogo. Si el catálogo no tiene el juego, decide el servidor.
   */
  function isUnknownGame(gameSlug: string): boolean {
    const game = allGames.value.find((one) => one.gameSlug === gameSlug);
    return game !== undefined && !knowsGame(game.gameSlug, game.gameVersion);
  }

  return { catalog, games, unknownGames, load, gameName, isUnknownGame };
}
