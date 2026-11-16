import { describe, expect, it } from 'vitest';
import { PasswordHasher } from './password-hasher.js';

describe('hash de contraseñas', () => {
  const hasher = new PasswordHasher();

  it('guarda el hash en el formato estándar de Argon2id, con los parámetros de OWASP', async () => {
    const hash = await hasher.hash('una-clave-larga');
    const parts = hash.split('$');

    expect(parts.slice(0, 4)).toEqual(['', 'argon2id', 'v=19', 'm=19456,t=2,p=1']);
    expect(Buffer.from(parts[4] ?? '', 'base64')).toHaveLength(16);
    expect(Buffer.from(parts[5] ?? '', 'base64')).toHaveLength(32);
  });

  it('acepta la contraseña correcta y rechaza las demás', async () => {
    const hash = await hasher.hash('una-clave-larga');

    expect(await hasher.verify(hash, 'una-clave-larga')).toBe(true);
    expect(await hasher.verify(hash, 'una-clave-largA')).toBe(false);
    expect(await hasher.verify(hash, '')).toBe(false);
  });

  it('usa una sal distinta cada vez', async () => {
    const first = await hasher.hash('una-clave-larga');
    const second = await hasher.hash('una-clave-larga');

    expect(first).not.toBe(second);
  });

  it('comprueba un hash calculado con otros parámetros y pide renovarlo', async () => {
    // Hash de "password" con la sal "somesalt", m=65536, t=2, p=1 y 32 bytes,
    // calculado con la implementación de referencia de Argon2.
    const reference = [
      '',
      'argon2id',
      'v=19',
      'm=65536,t=2,p=1',
      'c29tZXNhbHQ',
      'CTFhFdXPJO1aFaMaO6Mm5c8y7cJHAph8ArZWb2GRPPc',
    ].join('$');

    expect(await hasher.verify(reference, 'password')).toBe(true);
    expect(await hasher.verify(reference, 'passwork')).toBe(false);
    expect(hasher.needsRehash(reference)).toBe(true);
  });

  it('rechaza un hash con un formato que no reconoce', async () => {
    const otherVariant = ['', 'argon2i', 'v=19', 'm=19456,t=2,p=1', 'c2FsdA', 'aGFzaA'].join('$');

    expect(await hasher.verify('no-es-un-hash', 'x')).toBe(false);
    expect(await hasher.verify(otherVariant, 'x')).toBe(false);
    expect(hasher.needsRehash('no-es-un-hash')).toBe(true);
  });

  it('no pide renovar un hash calculado con los parámetros actuales', async () => {
    expect(hasher.needsRehash(await hasher.hash('una-clave-larga'))).toBe(false);
  });

  it('la comprobación sin cuenta responde siempre que no', async () => {
    expect(await hasher.verifyAgainstNothing('lo-que-sea')).toBe(false);
  });
});
