import type { Game, ItemList } from '@gameboard/contracts';
import { Controller, Get, Param } from '@nestjs/common';
import { apiPath } from '../../common/http/api-path.js';
import { Public } from '../auth/session.guard.js';
import { GamesService } from './games.service.js';

/** El catálogo se consulta sin sesión (API, decisión A8). */
@Public()
@Controller(apiPath('games'))
export class GamesController {
  constructor(private readonly games: GamesService) {}

  @Get()
  async listGames(): Promise<ItemList<Game>> {
    return { items: await this.games.listGames() };
  }

  @Get(':gameSlug')
  getGame(@Param('gameSlug') gameSlug: string): Promise<Game> {
    return this.games.getGame(gameSlug);
  }
}
