import { Module } from '@nestjs/common';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { StatisticsModule } from '../statistics/statistics.module.js';
import { UsersModule } from '../users/users.module.js';
import { PlayersController } from './players.controller.js';
import { PlayersRepository } from './players.repository.js';
import { PlayersService } from './players.service.js';

@Module({
  imports: [UsersModule, ProfilesModule, StatisticsModule],
  controllers: [PlayersController],
  providers: [PlayersRepository, PlayersService],
  exports: [PlayersService],
})
export class PlayersModule {}
