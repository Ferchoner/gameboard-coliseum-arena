import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GameSessionsModule } from '../game-sessions/game-sessions.module.js';
import { GamesModule } from '../games/games.module.js';
import { PlayersModule } from '../players/players.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminController } from './admin.controller.js';
import { AdminGuard } from './admin.guard.js';
import { AdminService } from './admin.service.js';

/**
 * Administración mínima por la API (ADR-008, punto 15). No tiene datos
 * propios: usa los demás módulos (arquitectura, sección 4).
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    ProfilesModule,
    PlayersModule,
    RoomsModule,
    GameSessionsModule,
    GamesModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
