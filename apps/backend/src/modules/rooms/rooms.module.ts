import { Module } from '@nestjs/common';
import { GamesModule } from '../games/games.module.js';
import { PlayersModule } from '../players/players.module.js';
import { IdleRoomsCloser } from './idle-rooms.closer.js';
import { MatchStarterSlot } from './match-starter.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsRepository } from './rooms.repository.js';
import { RoomsService } from './rooms.service.js';

/**
 * Salas. No conoce el canal de tiempo real: avisa de sus cambios y
 * pregunta por la presencia a través de `broadcast` (ADR-013, decisión
 * H5). Tampoco conoce las partidas: quien las inicia se registra en
 * `MatchStarterSlot` (decisión H1).
 */
@Module({
  imports: [GamesModule, PlayersModule],
  controllers: [RoomsController],
  providers: [RoomsRepository, RoomsService, MatchStarterSlot, IdleRoomsCloser],
  exports: [RoomsService, MatchStarterSlot],
})
export class RoomsModule {}
