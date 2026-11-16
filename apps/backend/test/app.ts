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
  private offsetMs = 0;

  override now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  reset(): void {
    this.offsetMs = 0;
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
  readonly close: () => Promise<void>;
}

export interface TestAppOptions {
  readonly env?: Record<string, string>;
  readonly engines?: readonly AnyGameEngine[];
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
    ...options.env,
  });
  const clock = new TestClock();

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
