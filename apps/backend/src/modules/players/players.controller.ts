import type { ItemList, PlayerGameStatistics, PublicPlayer } from '@gameboard/contracts';
import { Controller, Get, Param } from '@nestjs/common';
import { apiPath } from '../../common/http/api-path.js';
import { StatisticsService } from '../statistics/statistics.service.js';
import { PlayersService } from './players.service.js';

/** El perfil público y las estadísticas de cualquier jugador, para quien tenga sesión. */
@Controller(apiPath('players'))
export class PlayersController {
  constructor(
    private readonly players: PlayersService,
    private readonly statistics: StatisticsService,
  ) {}

  @Get(':username')
  getPlayer(@Param('username') username: string): Promise<PublicPlayer> {
    return this.players.getPublic(username);
  }

  @Get(':username/statistics')
  async getPlayerStatistics(
    @Param('username') username: string,
  ): Promise<ItemList<PlayerGameStatistics>> {
    const player = await this.players.getPublic(username);
    return { items: await this.statistics.listForPlayer(player.playerId) };
  }
}
