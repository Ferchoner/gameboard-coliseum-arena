import type { Game, ItemList } from '@gameboard/contracts';
import { computed } from 'vue';
import { useState } from '#imports';
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

  const games = computed(() => (catalog.value.status === 'ready' ? catalog.value.games : []));

  /** El nombre de un juego. Si el catálogo no lo tiene, su nombre corto. */
  function gameName(gameSlug: string): string {
    return games.value.find((game) => game.gameSlug === gameSlug)?.name ?? gameSlug;
  }

  return { catalog, games, load, gameName };
}
