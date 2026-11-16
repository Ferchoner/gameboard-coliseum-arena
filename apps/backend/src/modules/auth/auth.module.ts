import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlayersModule } from '../players/players.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { MeController } from './me.controller.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionCookie } from './session-cookie.js';
import { SessionGuard } from './session.guard.js';
import { SessionsRepository } from './sessions.repository.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [UsersModule, ProfilesModule, PlayersModule],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    PasswordHasher,
    SessionCookie,
    SessionsRepository,
    SessionsService,
    // Toda operación exige sesión, salvo las marcadas con `@Public()`.
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [SessionsService, SessionCookie],
})
export class AuthModule {}
