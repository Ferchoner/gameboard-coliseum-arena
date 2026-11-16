import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { AppConfig } from './config.js';

/** Con esta clave se inyecta la configuración: `@Inject(APP_CONFIG)`. */
export const APP_CONFIG = Symbol('APP_CONFIG');

@Global()
@Module({})
export class ConfigModule {
  /** La configuración se carga y se valida una sola vez, antes de crear la aplicación. */
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
