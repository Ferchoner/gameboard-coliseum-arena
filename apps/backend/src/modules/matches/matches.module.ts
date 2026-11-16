import { Module } from '@nestjs/common';
import { MatchesRepository } from './matches.repository.js';
import { MatchesService } from './matches.service.js';

/**
 * El registro de las partidas. No conoce las salas ni la sesión de juego:
 * `game-sessions` lo usa para anotar lo que ocurre (ADR-014, decisión K1).
 */
@Module({
  providers: [MatchesRepository, MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
