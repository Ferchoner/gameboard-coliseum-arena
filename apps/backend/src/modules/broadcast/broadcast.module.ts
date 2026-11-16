import { Global, Module } from '@nestjs/common';
import { Presence } from './presence.js';
import { RealtimeEvents } from './realtime-events.js';

/**
 * Interfaz neutral de difusión y presencia (ADR-013, decisión H5). Permite
 * que `rooms` y `auth` avisen de sus cambios y pregunten quién está
 * conectado sin importar `realtime`, que es quien la atiende.
 */
@Global()
@Module({
  providers: [RealtimeEvents, Presence],
  exports: [RealtimeEvents, Presence],
})
export class BroadcastModule {}
