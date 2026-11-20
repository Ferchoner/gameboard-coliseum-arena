import type { DominoesView } from '@gameboard/game-engine/dominoes';
import type { GameTexts } from '../game-ui';
import { dominoesStrings as texts } from './texts';

export const dominoesTexts: GameTexts = {
  seatNames: texts.seats,
  endText(view) {
    const { scores, target } = view as DominoesView;
    return scores.some((score) => score >= target) ? texts.end.reached : null;
  },
  rejections: texts.rejections,
};
