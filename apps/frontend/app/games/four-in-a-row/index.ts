import type { FourInARowView } from '@gameboard/game-engine/four-in-a-row';
import type { GameTexts } from '../game-ui';
import { fourInARowStrings as texts } from './texts';

export const fourInARowTexts: GameTexts = {
  seatNames: texts.seats,
  endText(view) {
    const { winningLine, cells } = view as FourInARowView;
    if (winningLine) return texts.end.line;
    const full = cells.every((column) => column.every((seat) => seat !== null));
    return full ? texts.end.full : null;
  },
  rejections: texts.rejections,
};
