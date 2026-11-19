import type { NavalBattleView } from '@gameboard/game-engine/naval-battle';
import type { GameTexts } from '../game-ui';
import { navalBattleStrings as texts } from './texts';

export const navalBattleTexts: GameTexts = {
  seatNames: texts.seats,
  endText(view) {
    const { grids, fleet } = view as NavalBattleView;
    const sankAll = grids.some((grid) => grid.sunk.length === fleet.length);
    return sankAll ? texts.end.sunkAll : null;
  },
  rejections: texts.rejections,
};
