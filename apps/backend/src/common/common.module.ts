import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { Clock } from './clock.js';
import { ApiExceptionFilter } from './errors/api-exception.filter.js';
import { EnvelopeInterceptor } from './http/envelope.interceptor.js';
import { RouteTable } from './http/route-table.js';

/** Infraestructura compartida: sobre de respuesta, errores del catálogo y reloj. */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    Clock,
    RouteTable,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
  ],
  exports: [Clock],
})
export class CommonModule {}
