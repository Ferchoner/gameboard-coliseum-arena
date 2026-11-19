/**
 * El token del enlace de recuperación, que va tras `#` como `#token=…`
 * (ADR-017, U7). Nulo si la dirección no lo trae.
 */
export function readResetToken(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return token && token.length > 0 ? token : null;
}
