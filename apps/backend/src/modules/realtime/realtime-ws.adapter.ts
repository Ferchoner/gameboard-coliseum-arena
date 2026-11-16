import type { IncomingMessage } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import type { RealtimeHandshake } from './realtime-handshake.js';

/** Nombre con el que el adaptador entrega cada mensaje recibido al canal. */
export const FRAME_EVENT = 'frame';

type CreateOptions = Parameters<WsAdapter['create']>[1];
type VerifyClientCallback = (accepted: boolean, status?: number) => void;

/**
 * El adaptador oficial de NestJS sobre `ws` (ADR-003, condición 5.1), con
 * lo que el protocolo pide y el adaptador no trae por defecto (ADR-013,
 * decisión H4):
 *
 * - El origen y la sesión se comprueban antes de aceptar la conexión.
 * - Un mensaje mayor que el máximo cierra la conexión con el código 1009.
 * - Los mensajes llevan el sobre del protocolo, no el de NestJS: todos se
 *   entregan enteros al canal, que es quien los interpreta.
 */
export class RealtimeWsAdapter extends WsAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly handshake: RealtimeHandshake,
    maxMessageBytes: number,
  ) {
    super(app, {
      maxPayload: maxMessageBytes,
      // Un mensaje binario no es del protocolo: llega como `null` y se rechaza.
      messageParser: (data) => ({
        event: FRAME_EVENT,
        data: typeof data === 'string' ? data : null,
      }),
    });
  }

  override create(port: number, options?: CreateOptions): unknown {
    const verifyClient = (info: { req: IncomingMessage }, callback: VerifyClientCallback): void => {
      this.handshake.verify(info.req).then(
        (rejection) => (rejection === null ? callback(true) : callback(false, rejection)),
        (error: unknown) => {
          this.logger.error(`Falló la comprobación de una apertura: ${String(error)}`);
          callback(false, 500);
        },
      );
    };
    return super.create(port, { ...options, verifyClient });
  }
}
