import { describe, expect, it } from 'vitest';
import { readResetToken } from './password-reset';

describe('enlace de recuperación', () => {
  it('lee el token que va tras #', () => {
    expect(readResetToken('#token=abc_DEF-123')).toBe('abc_DEF-123');
  });

  it('sin token, no hay enlace', () => {
    expect(readResetToken('')).toBeNull();
    expect(readResetToken('#')).toBeNull();
    expect(readResetToken('#token=')).toBeNull();
    expect(readResetToken('#otra=cosa')).toBeNull();
  });
});
