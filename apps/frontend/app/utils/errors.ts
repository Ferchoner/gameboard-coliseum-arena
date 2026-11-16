import { VALIDATION_RULES, type ValidationField, type ValidationRule } from '@gameboard/contracts';
import { es } from '../i18n/es';
import type { Failure } from './api';

/** El texto que ve la persona cuando algo falla. */
export function failureText(failure: Failure): string {
  switch (failure.kind) {
    case 'api':
      return es.errors[failure.error.code];
    case 'network':
      return es.client.network;
    case 'unexpected':
      return es.client.unexpected;
  }
}

/** El texto de cada campo, por su nombre. */
export type FieldTexts = Readonly<Record<string, string>>;

const RULES: ReadonlySet<string> = new Set(VALIDATION_RULES);

function isValidationField(value: unknown): value is ValidationField {
  if (typeof value !== 'object' || value === null) return false;
  const { field, rule } = value as Record<string, unknown>;
  return typeof field === 'string' && typeof rule === 'string' && RULES.has(rule);
}

export function validationTexts(fields: readonly ValidationField[]): FieldTexts {
  return Object.fromEntries(
    fields.map(({ field, rule }) => [field, es.validation[rule as ValidationRule]]),
  );
}

/**
 * Los fallos que se pueden señalar en un campo concreto del formulario:
 * los de un `VALIDATION_ERROR` y los dos datos que ya están en uso.
 */
export function fieldTexts(failure: Failure): FieldTexts {
  if (failure.kind !== 'api') return {};
  const { code, details } = failure.error;

  switch (code) {
    case 'EMAIL_TAKEN':
      return { email: es.errors.EMAIL_TAKEN };
    case 'USERNAME_TAKEN':
      return { username: es.errors.USERNAME_TAKEN };
    case 'VALIDATION_ERROR': {
      const fields = Array.isArray(details?.fields) ? details.fields : [];
      return validationTexts(fields.filter(isValidationField));
    }
    default:
      return {};
  }
}
