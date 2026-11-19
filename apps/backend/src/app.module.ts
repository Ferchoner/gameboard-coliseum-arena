import { type DynamicModule, Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import type { AppConfig } from './config/config.js';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BroadcastModule } from './modules/broadcast/broadcast.module.js';
import { GameSessionsModule } from './modules/game-sessions/game-sessions.module.js';
import { GamesModule } from './modules/games/games.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { RoomsModule } from './modules/rooms/rooms.module.js';

/**
 * El backend es un monolito modular: un módulo por área, cada uno dueño de
 * sus tablas (`docs/02-arquitectura.md`, sección 4).
 */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        CommonModule,
        DatabaseModule,
        BroadcastModule,
        AuthModule,
        GamesModule,
        RoomsModule,
        GameSessionsModule,
        RealtimeModule,
        AdminModule,
        HealthModule,
      ],
    };
  }
}
