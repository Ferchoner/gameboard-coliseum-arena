import { createHash, randomBytes } from 'node:crypto';

/**
 * El identificador opaco de una sesión: 32 bytes aleatorios. Es lo que
 * viaja en la cookie (ADR-004, condición 5.1).
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Lo que se guarda en la base de datos. El identificador ya es aleatorio y
 * largo, así que un hash rápido basta: quien lea la tabla no puede usarlo
 * para suplantar una sesión.
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Tiene la forma de un identificador emitido por `generateSessionToken`. */
export function looksLikeSessionToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
