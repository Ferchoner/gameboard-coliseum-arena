import { readFileSync } from 'node:fs';
import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { REQUEST_ID_HEADER, requestContext } from './common/http/request-context.js';
import type { AppConfig } from './config/config.js';

const LOG_LEVELS: readonly LogLevel[] = ['error', 'warn', 'log', 'debug'];

function createLogger(config: AppConfig): ConsoleLogger {
  const upTo = LOG_LEVELS.indexOf(config.logging.level);
  return new ConsoleLogger({
    json: config.logging.format === 'json',
    logLevels: LOG_LEVELS.slice(0, upTo + 1),
  });
}

/**
 * Opciones con las que hay que crear la aplicación para que `configureApp`
 * funcione. El intérprete del cuerpo se registra allí, con su límite de tamaño.
 */
export const APP_CREATE_OPTIONS = { bodyParser: false } as const;

/**
 * Configura todo lo que afecta a cómo responde la aplicación: el orden de
 * los pasos de entrada, las cabeceras de seguridad, CORS, la protección
 * contra peticiones de otro origen y el tamaño máximo del cuerpo. Lo usan
 * el arranque real y las pruebas, para que prueben lo mismo que se ejecuta.
 *
 * Orden en que se comprueba una petición (matriz de permisos, sección 7):
 * origen, sesión, forma de los datos y, ya en cada módulo, existencia,
 * relación y estado.
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  // 1. Identificador de la petición y registro de actividad.
  app.use(requestContext);

  // 2. Cabeceras de seguridad. La API solo responde JSON, así que no carga
  //    ningún recurso. El frontend está en otro origen del mismo sitio.
  app.useSecurityHeaders({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    xFrameOptions: { action: 'deny' },
    // Solo en producción. En local, el navegador recordaría la orden de usar
    // HTTPS para todo `localhost`, también para otros proyectos.
    strictTransportSecurity: config.environment === 'production',
  });

  // 3. CORS: solo el origen exacto del frontend, con credenciales (ADR-004, condición 5.4).
  app.enableCors({
    origin: config.http.frontendOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    exposedHeaders: [REQUEST_ID_HEADER],
    maxAge: 600,
  });

  // 4. Las peticiones que cambian algo solo se admiten desde el origen del
  //    frontend (ADR-004, condición 5.3). El rechazo sale como `ORIGIN_NOT_ALLOWED`.
  app.enableCsrfProtection({ trustedOrigins: [config.http.frontendOrigin] });

  // 5. Cuerpo JSON, con un tamaño máximo.
  app.useBodyParser('json', { limit: config.http.maxBodyBytes });

  app.enableShutdownHooks();
}

/** Crea la aplicación tal como se ejecuta. */
export async function createApp(config: AppConfig): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    ...APP_CREATE_OPTIONS,
    logger: createLogger(config),
    ...(config.http.tls
      ? {
          httpsOptions: {
            cert: readFileSync(config.http.tls.certFile),
            key: readFileSync(config.http.tls.keyFile),
          },
        }
      : {}),
  });
  configureApp(app, config);
  return app;
}
