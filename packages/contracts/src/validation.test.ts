import { describe, expect, it } from 'vitest';
import { registerRequestSchema, timeControlSchema } from './api.js';
import { toValidationFields } from './validation.js';

function fieldsOf(schema: typeof registerRequestSchema | typeof timeControlSchema, input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('Se esperaba un fallo de validación');
  return toValidationFields(result.error, input);
}

describe('traducción de fallos de validación', () => {
  const valid = { email: 'ana@example.com', username: 'ana_1', password: 'una-clave-larga' };

  it('acepta un registro correcto, con y sin nombre visible', () => {
    expect(registerRequestSchema.safeParse(valid).success).toBe(true);
    expect(registerRequestSchema.safeParse({ ...valid, displayName: 'Ana' }).success).toBe(true);
  });

  it('distingue un campo que falta de uno con mal formato', () => {
    expect(fieldsOf(registerRequestSchema, { username: 'ana_1', password: 'una-clave-larga' })).toEqual([
      { field: 'email', rule: 'REQUIRED' },
    ]);
    expect(fieldsOf(registerRequestSchema, { ...valid, email: 'no-es-un-correo' })).toEqual([
      { field: 'email', rule: 'INVALID_FORMAT' },
    ]);
    expect(fieldsOf(registerRequestSchema, { ...valid, username: 42 })).toEqual([
      { field: 'username', rule: 'INVALID_FORMAT' },
    ]);
  });

  it('indica si un texto es demasiado corto o demasiado largo', () => {
    expect(fieldsOf(registerRequestSchema, { ...valid, password: 'corta' })).toEqual([
      { field: 'password', rule: 'TOO_SHORT' },
    ]);
    expect(fieldsOf(registerRequestSchema, { ...valid, username: 'x'.repeat(21) })).toEqual([
      { field: 'username', rule: 'TOO_LONG' },
    ]);
  });

  it('rechaza los caracteres no admitidos en el nombre de usuario', () => {
    expect(fieldsOf(registerRequestSchema, { ...valid, username: 'ana maría' })).toEqual([
      { field: 'username', rule: 'INVALID_FORMAT' },
    ]);
  });

  it('rechaza los campos que el contrato no conoce', () => {
    expect(fieldsOf(registerRequestSchema, { ...valid, role: 'ADMIN' })).toEqual([
      { field: 'role', rule: 'INVALID_FORMAT' },
    ]);
  });

  it('anota varios campos a la vez, cada uno una sola vez', () => {
    expect(fieldsOf(registerRequestSchema, { email: 'x', username: 'a', password: 'b' })).toEqual([
      { field: 'email', rule: 'INVALID_FORMAT' },
      { field: 'username', rule: 'TOO_SHORT' },
      { field: 'password', rule: 'TOO_SHORT' },
    ]);
  });

  it('indica un número fuera de rango', () => {
    expect(fieldsOf(timeControlSchema, { type: 'TOTAL_PER_PLAYER', totalMs: 0 })).toEqual([
      { field: 'totalMs', rule: 'OUT_OF_RANGE' },
    ]);
  });

  it('anota como "body" un cuerpo que no es un objeto', () => {
    expect(fieldsOf(registerRequestSchema, 'texto')).toEqual([{ field: 'body', rule: 'INVALID_FORMAT' }]);
    expect(fieldsOf(registerRequestSchema, undefined)).toEqual([{ field: 'body', rule: 'REQUIRED' }]);
  });
});
