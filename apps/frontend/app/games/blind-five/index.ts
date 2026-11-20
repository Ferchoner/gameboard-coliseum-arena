import type { BlindFiveView } from '@gameboard/game-engine/blind-five';
import type { GameTexts } from '../game-ui';
import { blindFiveStrings as texts } from './texts';

export const blindFiveTexts: GameTexts = {
  seatNames: texts.seats,
  endText(view) {
    const { winner, declarations } = view as BlindFiveView;
    if (winner === null) return null;
    const guessed = declarations.some((one) => one.seat === winner && one.correct);
    return guessed ? texts.end.guessed : texts.end.lastStanding;
  },
  rejections: texts.rejections,
};
