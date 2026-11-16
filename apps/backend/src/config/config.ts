import { z } from 'zod';

/**
 * Configuración del servidor, leída de las variables de entorno y validada
 * al arrancar (ADR-012, decisión S21). Si falta algo o algo no es válido,
 * el servidor no arranca y dice qué variable es.
 */

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Un origen tal como lo envía el navegador: esquema, host y puerto, sin ruta. */
const origin = z.url().refine((value) => new URL(value).origin === value, {
  message: 'debe ser un origen sin ruta, por ejemplo http://localhost:3001',
});

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('localhost'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    DATABASE_URL: z.url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    /** El único origen desde el que el navegador puede llamar a la API (ADR-004). */
    FRONTEND_ORIGIN: origin,

    /**
     * La cookie de sesión lleva `Secure` y el prefijo `__Host-`. Solo puede
     * desactivarse en local, para trabajar sin HTTPS (ADR-012, decisión S13).
     */
    SESSION_COOKIE_SECURE: booleanFlag.default(true),
    SESSION_IDLE_DAYS: z.coerce.number().int().min(1).default(30),
    SESSION_ABSOLUTE_DAYS: z.coerce.number().int().min(1).default(90),

    /** Certificado y clave para servir por HTTPS en local (ADR-012, decisión S14). */
    TLS_CERT_FILE: z.string().min(1).optional(),
    TLS_KEY_FILE: z.string().min(1).optional(),

    LOG_FORMAT: z.enum(['json', 'text']).default('json'),
    LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug']).default('log'),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && !env.SESSION_COOKIE_SECURE) {
      context.addIssue({
        code: 'custom',
        path: ['SESSION_COOKIE_SECURE'],
        message: 'no puede desactivarse en producción',
      });
    }
    if (Boolean(env.TLS_CERT_FILE) !== Boolean(env.TLS_KEY_FILE)) {
      context.addIssue({
        code: 'custom',
        path: ['TLS_CERT_FILE'],
        message: 'TLS_CERT_FILE y TLS_KEY_FILE van juntas: o las dos o ninguna',
      });
    }
    if (env.SESSION_ABSOLUTE_DAYS < env.SESSION_IDLE_DAYS) {
      context.addIssue({
        code: 'custom',
        path: ['SESSION_ABSOLUTE_DAYS'],
        message: 'no puede ser menor que SESSION_IDLE_DAYS',
      });
    }
  });

const DAY_MS = 24 * 60 * 60 * 1000;

export interface AppConfig {
  readonly environment: 'development' | 'test' | 'production';
  readonly http: {
    readonly host: string;
    readonly port: number;
    readonly frontendOrigin: string;
    /** Tamaño máximo del cuerpo de una petición, en bytes. */
    readonly maxBodyBytes: number;
    readonly tls: { readonly certFile: string; readonly keyFile: string } | null;
  };
  readonly database: {
    readonly url: string;
    readonly poolMax: number;
  };
  readonly session: {
    readonly cookieName: string;
    readonly cookieSecure: boolean;
    /** Caducidad por inactividad (ADR-004, condición 5.6). */
    readonly idleMs: number;
    /** Tope que la renovación no puede superar. */
    readonly absoluteMs: number;
  };
  readonly logging: {
    readonly format: 'json' | 'text';
    readonly level: 'error' | 'warn' | 'log' | 'debug';
  };
}

export class InvalidConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Configuración no válida:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'InvalidConfigError';
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  // Una variable vacía cuenta como ausente, como en `VARIABLE=` dentro de un archivo `.env`.
  const defined = Object.fromEntries(Object.entries(env).filter(([, value]) => value !== ''));
  const parsed = envSchema.safeParse(defined);
  if (!parsed.success) {
    throw new InvalidConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || 'entorno'}: ${issue.message}`),
    );
  }
  const value = parsed.data;

  return {
    environment: value.NODE_ENV,
    http: {
      host: value.HOST,
      port: value.PORT,
      frontendOrigin: value.FRONTEND_ORIGIN,
      maxBodyBytes: 64 * 1024,
      tls:
        value.TLS_CERT_FILE && value.TLS_KEY_FILE
          ? { certFile: value.TLS_CERT_FILE, keyFile: value.TLS_KEY_FILE }
          : null,
    },
    database: {
      url: value.DATABASE_URL,
      poolMax: value.DATABASE_POOL_MAX,
    },
    session: {
      // El prefijo `__Host-` hace que el navegador rechace la cookie si no es
      // `Secure`, si lleva `Domain` o si su ruta no es `/`.
      cookieName: value.SESSION_COOKIE_SECURE ? '__Host-session' : 'session',
      cookieSecure: value.SESSION_COOKIE_SECURE,
      idleMs: value.SESSION_IDLE_DAYS * DAY_MS,
      absoluteMs: value.SESSION_ABSOLUTE_DAYS * DAY_MS,
    },
    logging: {
      format: value.LOG_FORMAT,
      level: value.LOG_LEVEL,
    },
  };
}
