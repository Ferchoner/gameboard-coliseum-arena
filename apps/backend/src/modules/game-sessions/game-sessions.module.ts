import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module.js';
import { MatchesModule } from '../matches/matches.module.js';
import { PlayersModule } from '../players/players.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { StatisticsModule } from '../statistics/statistics.module.js';
import { AbandonmentWatch } from './abandonment-watch.js';
import { ClockSweeper } from './clock-sweeper.js';
import { GameSessionsRepository } from './game-sessions.repository.js';
import { GameSessionsService } from './game-sessions.service.js';
import { GameSessionsStartup } from './game-sessions.startup.js';
import { MatchesController } from './matches.controller.js';
import { Randomness } from './randomness.js';
import { ServerLiveness } from './server-liveness.js';
import { TurnTimers } from './turn-timers.js';

/**
 * La sesión de juego: dirige las partidas. Conoce a `rooms`, a `matches`, a
 * `games`, a `players` y a `statistics`, y ninguno de ellos la conoce a
 * ella: se registra en `rooms` como quien inicia las partidas (ADR-014,
 * decisión K1).
 */
@Module({
  imports: [GamesModule, MatchesModule, PlayersModule, RoomsModule, StatisticsModule],
  controllers: [MatchesController],
  providers: [
    GameSessionsRepository,
    GameSessionsService,
    TurnTimers,
    AbandonmentWatch,
    Randomness,
    ClockSweeper,
    ServerLiveness,
    GameSessionsStartup,
  ],
  exports: [GameSessionsService],
})
export class GameSessionsModule {}
