import { Module } from '@nestjs/common';
import { PlayersRepository } from './players.repository.js';
import { PlayersService } from './players.service.js';

@Module({
  providers: [PlayersRepository, PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
