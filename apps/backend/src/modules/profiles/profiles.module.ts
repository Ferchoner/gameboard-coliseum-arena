import { Module } from '@nestjs/common';
import { ProfilesRepository } from './profiles.repository.js';
import { ProfilesService } from './profiles.service.js';

@Module({
  providers: [ProfilesRepository, ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
