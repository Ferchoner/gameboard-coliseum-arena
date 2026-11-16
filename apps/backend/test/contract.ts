import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import type { Response } from 'supertest';
import { expect } from 'vitest';
import { parse } from 'yaml';

/**
 * Comprueba respuestas reales de la API contra el archivo OpenAPI, que es
 * el contrato aceptado (ADR-012, decisión S7).
 */

type JsonObject = Record<string, unknown>;

const openapiPath = fileURLToPath(new URL('../../../contracts/01-rest-api.yaml', import.meta.url));
const openapi = parse(readFileSync(openapiPath, 'utf8')) as {
  paths: Record<string, Record<string, { responses: Record<string, JsonObject> }>>;
  components: { responses: Record<string, JsonObject> };
};

const DOCUMENT_ID = 'https://gameboard.invalid/openapi';
const addFormats = addFormatsModule as unknown as (ajv: Ajv2020) => void;

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
// El documento entero se registra para que las referencias internas se resuelvan.
ajv.addSchema({ $id: DOCUMENT_ID, ...openapi });

function pointerSegment(value: string): string {
  return encodeURIComponent(value.replace(/~/g, '~0').replace(/\//g, '~1'));
}

/** Ruta, dentro del documento, de la respuesta de una operación para un estado. */
function responsePointer(method: string, path: string, status: number): string {
  const operation = openapi.paths[path]?.[method.toLowerCase()];
  if (!operation) throw new Error(`El contrato no tiene la operación ${method} ${path}`);
  const response = operation.responses[String(status)];
  if (!response) {
    throw new Error(`El contrato no prevé el estado ${status} en ${method} ${path}`);
  }
  const reference = response['$ref'];
  if (typeof reference === 'string') return reference.replace(/^#/, '');
  return `/paths/${pointerSegment(path)}/${method.toLowerCase()}/responses/${status}`;
}

function at(pointer: string): JsonObject | undefined {
  let current: unknown = openapi;
  for (const segment of pointer.split('/').slice(1)) {
    const key = decodeURIComponent(segment).replace(/~1/g, '/').replace(/~0/g, '~');
    current = (current as JsonObject | undefined)?.[key];
  }
  return current as JsonObject | undefined;
}

/**
 * Comprueba que la respuesta es una de las que el contrato prevé para esa
 * operación: el estado existe y el cuerpo cumple su esquema. `path` es la
 * ruta tal como figura en el contrato, por ejemplo `/games/{gameSlug}`.
 */
export function expectMatchesContract(method: string, path: string, response: Response): void {
  const pointer = responsePointer(method, path, response.status);
  const content = at(pointer)?.['content'] as JsonObject | undefined;

  if (!content) {
    expect(response.text, `${method} ${path} ${response.status} no debe tener cuerpo`).toBe('');
    return;
  }

  const validate = ajv.getSchema(`${DOCUMENT_ID}#${pointer}/content/application~1json/schema`);
  if (!validate)
    throw new Error(`No se encontró el esquema de ${method} ${path} ${response.status}`);

  const valid = validate(response.body);
  expect(
    valid,
    `${method} ${path} ${response.status} no cumple el contrato: ${ajv.errorsText(validate.errors)}\n` +
      JSON.stringify(response.body, null, 2),
  ).toBe(true);
}

/**
 * Comprueba un error común a toda la API, de los que el contrato describe
 * una sola vez y no repite en cada operación: cumple la forma de toda
 * respuesta de error.
 */
export function expectErrorEnvelope(response: Response): void {
  const validate = ajv.getSchema(`${DOCUMENT_ID}#/components/schemas/ErrorResponse`);
  if (!validate) throw new Error('No se encontró el esquema ErrorResponse');
  expect(validate(response.body), ajv.errorsText(validate.errors)).toBe(true);
}
