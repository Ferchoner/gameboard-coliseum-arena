import { z } from 'zod';
import type { Command, CommandType, ProtocolVersion } from './realtime.js';

/**
 * Constantes y esquemas del protocolo de tiempo real
 * (`contracts/02-realtime.md`). Los tipos de los mensajes están en
 * `realtime.ts`; aquí está lo que existe en ejecución.
 */

/** Versión del protocolo. Se fija al conectar, en la dirección (decisión T8). */
export const PROTOCOL_VERSION: ProtocolVersion = 1;

/** Ruta del canal de tiempo real en el host de la API. */
export const REALTIME_PATH = '/realtime';

/** Parámetro de la dirección que lleva la versión del protocolo. */
export const PROTOCOL_VERSION_PARAM = 'protocolVersion';

/** Códigos con los que el servidor cierra una conexión (protocolo, sección 2). */
export const CLOSE_CODES = {
  /** El cliente incumplió el protocolo de forma repetida. */
  POLICY_VIOLATION: 1008,
  /** Envió un mensaje demasiado grande. */
  MESSAGE_TOO_BIG: 1009,
  /** El servidor se reinicia. */
  SERVICE_RESTART: 1012,
  /** La sesión de autenticación terminó. */
  SESSION_ENDED: 4001,
  /** Versión del protocolo no admitida. */
  UNSUPPORTED_PROTOCOL_VERSION: 4002,
  /** Demasiadas conexiones abiertas para el mismo jugador. */
  TOO_MANY_CONNECTIONS: 4003,
} as const;

export type CloseCode = (typeof CLOSE_CODES)[keyof typeof CLOSE_CODES];

/** Cierres tras los que el cliente no reconecta por su cuenta. */
export const CLOSE_CODES_WITHOUT_RECONNECT: readonly number[] = [
  CLOSE_CODES.POLICY_VIOLATION,
  CLOSE_CODES.MESSAGE_TOO_BIG,
  CLOSE_CODES.SESSION_ENDED,
  CLOSE_CODES.UNSUPPORTED_PROTOCOL_VERSION,
  CLOSE_CODES.TOO_MANY_CONNECTIONS,
];

export const COMMAND_TYPES = [
  'SUBSCRIBE_ROOM',
  'UNSUBSCRIBE_ROOM',
  'SUBSCRIBE_MATCH',
  'UNSUBSCRIBE_MATCH',
  'SUBMIT_ACTION',
  'RESIGN_MATCH',
] as const satisfies readonly CommandType[];

// Si falta algún tipo de orden en la lista, esta línea no compila.
null as unknown as CommandType satisfies (typeof COMMAND_TYPES)[number];

const requestId = z.uuid();
const roomId = z.uuid();
const matchId = z.uuid();

/** Una orden del cliente, con su sobre (protocolo, secciones 3 y 4). */
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('SUBSCRIBE_ROOM'), requestId, roomId }),
  z.strictObject({ type: z.literal('UNSUBSCRIBE_ROOM'), requestId, roomId }),
  z.strictObject({ type: z.literal('SUBSCRIBE_MATCH'), requestId, matchId }),
  z.strictObject({ type: z.literal('UNSUBSCRIBE_MATCH'), requestId, matchId }),
  z.strictObject({
    type: z.literal('SUBMIT_ACTION'),
    requestId,
    matchId,
    payload: z.strictObject({
      stateVersion: z.int().min(0),
      action: z.unknown(),
    }),
  }),
  z.strictObject({ type: z.literal('RESIGN_MATCH'), requestId, matchId }),
]) satisfies z.ZodType<Command>;

export interface ParsedCommand {
  readonly ok: true;
  readonly command: Command;
}

export interface UnreadableCommand {
  readonly ok: false;
  /** El `requestId` del mensaje, si pudo leerse. */
  readonly requestId: string | null;
  /** El tipo de la orden, si es uno de los del protocolo. */
  readonly commandType: CommandType | null;
}

const KNOWN_TYPES: ReadonlySet<string> = new Set(COMMAND_TYPES);

/**
 * Lee un mensaje del cliente. Si no es una orden válida, devuelve lo que
 * se pudo leer de él, para responder con `COMMAND_REJECTED` e
 * `INVALID_MESSAGE` al mismo `requestId` cuando lo trae.
 */
export function parseCommand(text: string): ParsedCommand | UnreadableCommand {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, requestId: null, commandType: null };
  }

  const parsed = commandSchema.safeParse(json);
  if (parsed.success) return { ok: true, command: parsed.data };

  const fields = typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : {};
  const id = requestId.safeParse(fields.requestId);
  return {
    ok: false,
    requestId: id.success ? id.data : null,
    commandType:
      typeof fields.type === 'string' && KNOWN_TYPES.has(fields.type)
        ? (fields.type as CommandType)
        : null,
  };
}
