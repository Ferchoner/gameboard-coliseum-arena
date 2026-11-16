import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import { OPENAPI_SCHEMAS } from './api.js';

/**
 * Compara cada esquema de este paquete con el del archivo OpenAPI, que es
 * el contrato aceptado de la API (ADR-012, decisión S7).
 *
 * Se comparan las dos definiciones reducidas a lo que importa: tipos,
 * valores admitidos, campos, cuáles son obligatorios, si se admiten campos
 * de más, formatos y límites. Las descripciones y los ejemplos no cuentan.
 */

type JsonSchema = Record<string, unknown>;

interface Shape {
  types: string[];
  enum?: unknown[];
  const?: unknown;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  properties?: Record<string, Shape>;
  required?: string[];
  closed?: boolean;
  items?: Shape;
}

const COMPARED_FORMATS = new Set(['uuid', 'email', 'date-time', 'uri']);

const openapiPath = fileURLToPath(new URL('../../../contracts/01-rest-api.yaml', import.meta.url));
const openapi = parse(readFileSync(openapiPath, 'utf8')) as {
  components: { schemas: Record<string, JsonSchema> };
};

function resolve(schema: JsonSchema, root: JsonSchema): JsonSchema {
  const ref = schema['$ref'];
  if (typeof ref !== 'string') return schema;
  let target: unknown = root;
  for (const part of ref.replace(/^#\//, '').split('/')) {
    target = (target as Record<string, unknown>)[part];
  }
  return resolve(target as JsonSchema, root);
}

function shapeOf(input: JsonSchema, root: JsonSchema): Shape {
  const schema = resolve(input, root);

  const alternatives = (schema['anyOf'] ?? schema['oneOf']) as JsonSchema[] | undefined;
  if (alternatives) {
    const resolved = alternatives.map((alternative) => resolve(alternative, root));
    const rest = resolved.filter((alternative) => alternative['type'] !== 'null');
    if (rest.length !== 1 || rest.length === resolved.length) {
      throw new Error('Solo se admite la unión de un esquema con null');
    }
    const shape = shapeOf(rest[0] as JsonSchema, root);
    shape.types = [...shape.types, 'null'].sort();
    return shape;
  }

  const type = schema['type'];
  const shape: Shape = {
    types: (Array.isArray(type) ? (type as string[]) : type ? [type as string] : []).slice().sort(),
  };

  if (Array.isArray(schema['enum'])) shape.enum = [...(schema['enum'] as unknown[])].sort();
  if ('const' in schema) shape.const = schema['const'];

  const format = schema['format'];
  if (typeof format === 'string' && COMPARED_FORMATS.has(format)) shape.format = format;
  // Zod añade su propio patrón a los formatos conocidos. Solo se comparan los patrones propios.
  if (typeof schema['pattern'] === 'string' && !shape.format) shape.pattern = schema['pattern'];

  for (const key of ['minLength', 'maxLength', 'minimum', 'maximum'] as const) {
    const value = schema[key];
    // Zod anota en los enteros los límites de un entero seguro. No son límites del contrato.
    if (typeof value === 'number' && Math.abs(value) !== Number.MAX_SAFE_INTEGER) shape[key] = value;
  }

  if (shape.types.includes('object')) {
    const properties = (schema['properties'] ?? {}) as Record<string, JsonSchema>;
    shape.properties = Object.fromEntries(
      Object.keys(properties)
        .sort()
        .map((name) => [name, shapeOf(properties[name] as JsonSchema, root)]),
    );
    shape.required = [...((schema['required'] ?? []) as string[])].sort();
    shape.closed = schema['additionalProperties'] === false;
  }

  if (shape.types.includes('array')) {
    shape.items = shapeOf((schema['items'] ?? {}) as JsonSchema, root);
  }

  return shape;
}

describe('esquemas de la API frente al archivo OpenAPI', () => {
  it('hay un esquema por cada uno del archivo, y ninguno de más', () => {
    expect(Object.keys(OPENAPI_SCHEMAS).sort()).toEqual(Object.keys(openapi.components.schemas).sort());
  });

  it.each(Object.keys(OPENAPI_SCHEMAS) as (keyof typeof OPENAPI_SCHEMAS)[])('%s coincide', (name) => {
    const fromCode = z.toJSONSchema(OPENAPI_SCHEMAS[name], { io: 'input' }) as JsonSchema;
    const fromContract = openapi.components.schemas[name] as JsonSchema;

    expect(shapeOf(fromCode, fromCode)).toEqual(shapeOf(fromContract, openapi as unknown as JsonSchema));
  });
});
