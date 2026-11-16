import type { AddressInfo } from 'node:net';
import type { AnyGameEngine } from '@gameboard/game-engine';
import { createGameEngineRegistry } from '@gameboard/game-engine';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import supertest from 'supertest';
import { AppModule } from '../src/app.module.js';
import { APP_CREATE_OPTIONS, configureApp } from '../src/app.setup.js';
import { Clock } from '../src/common/clock.js';
import { type AppConfig, loadConfig } from '../src/config/config.js';
import { GAME_ENGINE_REGISTRY } from '../src/modules/games/games.service.js';
import { TEST_DATABASE_URL } from './database.js';

export const FRONTEND_ORIGIN = 'http://localhost:3001';
export const API = '/api/v1';

/** Un reloj que las pruebas pueden adelantar. */
export class TestClock extends Clock {
  private offsetMs: number;

  /** `initialOffsetMs`: cuánto va adelantado desde el principio. */
  constructor(private readonly initialOffsetMs = 0) {
    super();
    this.offsetMs = initialOffsetMs;
  }

  override now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  /** Vuelve a la hora con la que se creó la aplicación. */
  reset(): void {
    this.offsetMs = this.initialOffsetMs;
  }
}

export interface TestApp {
  readonly app: NestExpressApplication;
  readonly config: AppConfig;
  readonly clock: TestClock;
  /** Hace peticiones a la aplicación sin abrir un puerto. */
  readonly request: () => ReturnType<typeof supertest>;
  /** Como `request`, pero conserva las cookies entre peticiones, igual que un navegador. */
  readonly agent: () => ReturnType<typeof supertest.agent>;
  /**
   * Abre un puerto libre y devuelve la dirección del servidor para el
   * canal de tiempo real, por ejemplo `ws://127.0.0.1:54321`.
   */
  readonly listen: () => Promise<string>;
  readonly close: () => Promise<void>;
}

export interface TestAppOptions {
  readonly env?: Record<string, string>;
  readonly engines?: readonly AnyGameEngine[];
  /**
   * Cuánto adelanta el reloj desde el arranque. Sirve para simular que el
   * servidor estuvo parado ese tiempo antes de arrancar.
   */
  readonly clockOffsetMs?: number;
}

/**
 * Crea la aplicación completa contra la base de datos de pruebas, con la
 * misma configuración de entrada que la aplicación real.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    FRONTEND_ORIGIN,
    SESSION_COOKIE_SECURE: 'false',
    // Sin margen, una desconexión se ve en cuanto se cierra la conexión (ADR-015, decisión V3).
    REALTIME_DISCONNECT_GRACE_SECONDS: '0',
    ...options.env,
  });
  const clock = new TestClock(options.clockOffsetMs);

  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(GAME_ENGINE_REGISTRY)
    .useValue(createGameEngineRegistry(options.engines ?? []))
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    ...APP_CREATE_OPTIONS,
    logger: false,
  });
  configureApp(app, config);
  await app.init();

  return {
    app,
    config,
    clock,
    request: () => supertest(app.getHttpServer()),
    agent: () => supertest.agent(app.getHttpServer()),
    listen: async () => {
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address() as AddressInfo;
      return `ws://127.0.0.1:${address.port}`;
    },
    close: () => app.close(),
  };
}

/** Datos de registro válidos, distintos en cada llamada. */
let counter = 0;
export function newAccount(overrides: Record<string, unknown> = {}) {
  counter += 1;
  return {
    email: `persona${counter}@example.com`,
    username: `persona_${counter}`,
    password: 'una-clave-larga',
    ...overrides,
  };
}
