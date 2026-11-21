import type { TidesView } from '@gameboard/game-engine/tides';
import type { GameTexts } from '../game-ui';
import { tidesStrings as texts } from './texts';

export const tidesTexts: GameTexts = {
  seatNames: texts.seats,
  endText(view) {
    const { winners, seats } = view as TidesView;
    const first = winners[0];
    if (first === undefined) return null;
    const points = seats[first]?.score.total ?? 0;
    return winners.length > 1 ? texts.end.shared(points) : texts.end.single(points);
  },
  rejections: texts.rejections,
};
