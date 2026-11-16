import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeHandshake } from './realtime-handshake.js';

/**
 * Canal de tiempo real. Es el único módulo que conoce el WebSocket
 * (arquitectura, regla 6): los demás avisan de sus cambios por `broadcast`
 * y este decide a qué conexiones se los envía (ADR-013, decisión H5).
 */
@Module({
  imports: [AuthModule, RoomsModule],
  providers: [RealtimeGateway, RealtimeHandshake],
  exports: [RealtimeHandshake],
})
export class RealtimeModule {}
