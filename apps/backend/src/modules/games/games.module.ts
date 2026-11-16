import { createGameEngineRegistry, GAME_ENGINES } from '@gameboard/game-engine';
import { Module } from '@nestjs/common';
import { GamesController } from './games.controller.js';
import { GamesRepository } from './games.repository.js';
import { GAME_ENGINE_REGISTRY, GamesService } from './games.service.js';

@Module({
  controllers: [GamesController],
  providers: [
    GamesRepository,
    GamesService,
    { provide: GAME_ENGINE_REGISTRY, useFactory: () => createGameEngineRegistry(GAME_ENGINES) },
  ],
  exports: [GamesService, GAME_ENGINE_REGISTRY],
})
export class GamesModule {}
