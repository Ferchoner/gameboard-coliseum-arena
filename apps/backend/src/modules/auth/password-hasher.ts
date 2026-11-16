import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';

const argon2Async = promisify(argon2);

/**
 * Parámetros de Argon2id: la configuración mínima que recomienda OWASP
 * (ADR-012, decisión S15). La memoria va en KiB.
 */
const PARAMETERS = { memory: 19_456, passes: 2, parallelism: 1 } as const;
const SALT_BYTES = 16;
const HASH_BYTES = 32;
const ARGON2_VERSION = 19;

const ENCODED_HASH =
  /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

interface ParsedHash {
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

function derive(
  password: string,
  salt: Buffer,
  parameters: { readonly memory: number; readonly passes: number; readonly parallelism: number },
  tagLength: number,
): Promise<Buffer> {
  return argon2Async('argon2id', {
    message: Buffer.from(password, 'utf8'),
    nonce: salt,
    memory: parameters.memory,
    passes: parameters.passes,
    parallelism: parameters.parallelism,
    tagLength,
  });
}

function encode(value: Buffer): string {
  return value.toString('base64').replace(/=+$/, '');
}

/** Lee un hash en el formato de texto estándar de Argon2. */
function parse(encoded: string): ParsedHash | null {
  const match = ENCODED_HASH.exec(encoded);
  if (!match || Number(match[1]) !== ARGON2_VERSION) return null;
  return {
    memory: Number(match[2]),
    passes: Number(match[3]),
    parallelism: Number(match[4]),
    salt: Buffer.from(match[5] ?? '', 'base64'),
    hash: Buffer.from(match[6] ?? '', 'base64'),
  };
}

/**
 * Hash de contraseñas con el Argon2id incorporado en Node.js (ADR-004,
 * condición 5.9). El resultado se guarda en el formato de texto estándar
 * de Argon2, que incluye la sal y los parámetros.
 */
@Injectable()
export class PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const hash = await derive(password, salt, PARAMETERS, HASH_BYTES);
    const parameters = `m=${PARAMETERS.memory},t=${PARAMETERS.passes},p=${PARAMETERS.parallelism}`;
    return ['', 'argon2id', `v=${ARGON2_VERSION}`, parameters, encode(salt), encode(hash)].join(
      '$',
    );
  }

  /** Comprueba una contraseña contra un hash guardado. */
  async verify(encoded: string, password: string): Promise<boolean> {
    const parsed = parse(encoded);
    if (!parsed) return false;
    const candidate = await derive(password, parsed.salt, parsed, parsed.hash.length);
    return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
  }

  /**
   * Hace el mismo trabajo que `verify` y responde siempre que no. Se usa
   * cuando la cuenta no existe, para que la respuesta tarde lo mismo que
   * con una cuenta que sí existe y no se pueda averiguar cuál es el caso.
   */
  async verifyAgainstNothing(password: string): Promise<false> {
    this.dummyHash ??= this.hash(randomBytes(16).toString('hex'));
    await this.verify(await this.dummyHash, password);
    return false;
  }

  /** El hash se calculó con parámetros distintos de los actuales y conviene renovarlo. */
  needsRehash(encoded: string): boolean {
    const parsed = parse(encoded);
    return (
      !parsed ||
      parsed.memory !== PARAMETERS.memory ||
      parsed.passes !== PARAMETERS.passes ||
      parsed.parallelism !== PARAMETERS.parallelism ||
      parsed.hash.length !== HASH_BYTES
    );
  }
}
