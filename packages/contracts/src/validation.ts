import type { z } from 'zod';
import type { ValidationField, ValidationRule } from './errors.js';

type Issue = z.core.$ZodIssue;

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let current = input;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

function ruleOf(issue: Issue, input: unknown): ValidationRule {
  switch (issue.code) {
    case 'invalid_type':
      return valueAt(input, issue.path) === undefined ? 'REQUIRED' : 'INVALID_FORMAT';
    case 'too_small':
      return issue.origin === 'string' || issue.origin === 'array' ? 'TOO_SHORT' : 'OUT_OF_RANGE';
    case 'too_big':
      return issue.origin === 'string' || issue.origin === 'array' ? 'TOO_LONG' : 'OUT_OF_RANGE';
    default:
      return 'INVALID_FORMAT';
  }
}

/**
 * Convierte los fallos de un esquema en la lista `fields` de un
 * `VALIDATION_ERROR` (catálogo de errores, decisión E7).
 *
 * `field` es la ruta del campo, con puntos si está anidado. Un fallo que
 * afecta al cuerpo entero, por ejemplo porque no es un objeto, se anota
 * con el nombre `body`. Cada campo aparece una sola vez, con su primer fallo.
 */
export function toValidationFields(error: z.ZodError, input: unknown): ValidationField[] {
  const fields = new Map<string, ValidationRule>();
  const add = (field: string, rule: ValidationRule) => {
    if (!fields.has(field)) fields.set(field, rule);
  };

  for (const issue of error.issues) {
    const base = issue.path.map(String).join('.');
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        add(base === '' ? key : `${base}.${key}`, 'INVALID_FORMAT');
      }
      continue;
    }
    add(base === '' ? 'body' : base, ruleOf(issue, input));
  }

  return [...fields].map(([field, rule]) => ({ field, rule }));
}
