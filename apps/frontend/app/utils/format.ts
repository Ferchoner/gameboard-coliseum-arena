import type { Game } from '@gameboard/contracts';
import { es } from '../i18n/es';

/** Una duración en palabras, con sus dos unidades más grandes: "1 hora y 30 minutos". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const parts = [
    { count: Math.floor(totalSeconds / 3600), text: es.duration.hours },
    { count: Math.floor((totalSeconds % 3600) / 60), text: es.duration.minutes },
    { count: totalSeconds % 60, text: es.duration.seconds },
  ]
    .filter((part) => part.count > 0)
    .slice(0, 2)
    .map((part) => part.text(part.count));

  return parts.length > 0 ? parts.join(` ${es.duration.and} `) : es.duration.seconds(0);
}

export function formatPlayers(game: Pick<Game, 'minPlayers' | 'maxPlayers'>): string {
  return game.minPlayers === game.maxPlayers
    ? es.home.players.exact(game.minPlayers)
    : es.home.players.range(game.minPlayers, game.maxPlayers);
}
