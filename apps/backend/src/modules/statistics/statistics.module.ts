import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module.js';
import { StatisticsRepository } from './statistics.repository.js';
import { StatisticsService } from './statistics.service.js';

/** Contadores por jugador y juego (arquitectura, sección 4). Dueño de `game_statistics`. */
@Module({
  imports: [GamesModule],
  providers: [StatisticsRepository, StatisticsService],
  exports: [StatisticsService],
})
export class StatisticsModule {}
