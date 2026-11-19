import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MailModule } from '../mail/mail.module.js';
import { PlayersModule } from '../players/players.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthCleanup } from './auth-cleanup.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { MeController } from './me.controller.js';
import { PasswordHasher } from './password-hasher.js';
import { PasswordResetTokensRepository } from './password-reset-tokens.repository.js';
import { PasswordResetService } from './password-reset.service.js';
import { SessionCookie } from './session-cookie.js';
import { SessionGuard } from './session.guard.js';
import { SessionsRepository } from './sessions.repository.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [UsersModule, ProfilesModule, PlayersModule, MailModule],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    AuthCleanup,
    PasswordHasher,
    PasswordResetService,
    PasswordResetTokensRepository,
    SessionCookie,
    SessionsRepository,
    SessionsService,
    // Toda operación exige sesión, salvo las marcadas con `@Public()`.
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [SessionsService, SessionCookie],
})
export class AuthModule {}
