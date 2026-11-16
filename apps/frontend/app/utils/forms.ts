import { es } from '../i18n/es';
import type { FieldTexts } from './errors';

/** Señala como obligatorio cada campo de texto que se dejó vacío. */
export function requiredTexts(form: Readonly<Record<string, string>>): FieldTexts {
  return Object.fromEntries(
    Object.entries(form)
      .filter(([, value]) => value === '')
      .map(([field]) => [field, es.validation.REQUIRED]),
  );
}
