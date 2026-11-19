import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import type { Response } from 'supertest';
import { expect } from 'vitest';
import { parse } from 'yaml';

/**
 * Comprueba respuestas reales de la API contra el archivo OpenAPI, que es
 * el contrato aceptado (ADR-012, decisión S7). Toda petición que hacen las
 * pruebas pasa por `checkAgainstContract`, desde `test/app.ts`, así que
 * ninguna respuesta se queda sin comprobar (análisis del 2026-11-19, T-02).
 */

type JsonObject = Record<string, unknown>;

/** Lo mínimo de una respuesta que hace falta para comprobarla. */
interface ContractResponse {
  readonly status: number;
  readonly body: unknown;
  readonly text: string;
}

const openapiPath = fileURLToPath(new URL('../../../contracts/01-rest-api.yaml', import.meta.url));
const openapi = parse(readFileSync(openapiPath, 'utf8')) as {
  paths: Record<string, Record<string, { responses: Record<string, JsonObject> }>>;
  components: { responses: Record<string, JsonObject> };
};

/** Prefijo de la API versionada, que es lo que describe el contrato. */
const API_PREFIX = '/api/v1';

/** Rutas fuera de la API versionada, que el contrato no describe a propósito. */
const OUTSIDE_CONTRACT = new Set(['/health']);

/**
 * Errores que cualquier operación puede dar y que el contrato describe una
 * sola vez, en "Errores comunes", con el estado de cada uno.
 */
const COMMON_ERRORS: Readonly<Record<string, number>> = {
  ORIGIN_NOT_ALLOWED: 403,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  ROUTE_NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  VALIDATION_ERROR: 400,
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
export function expectMatchesContract(
  method: string,
  path: string,
  response: Response | ContractResponse,
): void {
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
export function expectErrorEnvelope(response: Response | ContractResponse): void {
  const validate = ajv.getSchema(`${DOCUMENT_ID}#/components/schemas/ErrorResponse`);
  if (!validate) throw new Error('No se encontró el esquema ErrorResponse');
  expect(validate(response.body), ajv.errorsText(validate.errors)).toBe(true);
}

// --- Comprobación de todas las respuestas ---------------------------------

interface PathTemplate {
  readonly path: string;
  readonly segments: readonly string[];
  readonly literals: number;
}

const templates: readonly PathTemplate[] = Object.keys(openapi.paths).map((path) => {
  const segments = path.split('/').slice(1);
  return { path, segments, literals: segments.filter((s) => !s.startsWith('{')).length };
});

/** La ruta del contrato que corresponde a una ruta real, como `/rooms/{roomId}`. */
function templateFor(path: string): string | undefined {
  const segments = path.split('/').slice(1);
  const candidates = templates.filter(
    (template) =>
      template.segments.length === segments.length &&
      template.segments.every((s, i) => s.startsWith('{') || s === segments[i]),
  );
  // Si dos encajan, gana la que tiene más partes fijas.
  return candidates.sort((a, b) => b.literals - a.literals)[0]?.path;
}

/** Los códigos que el contrato enumera para una respuesta, en su descripción. */
function documentedCodes(pointer: string): Set<string> {
  const description = at(pointer)?.['description'];
  if (typeof description !== 'string') return new Set();
  return new Set([...description.matchAll(/^- `([A-Z_]+)`:/gm)].map((match) => match[1] ?? ''));
}

function errorCode(body: unknown): string | undefined {
  const error = (body as { error?: { code?: unknown } } | undefined)?.error;
  return typeof error?.code === 'string' ? error.code : undefined;
}

/** Pares de operación y estado vistos en este archivo de pruebas. */
const seen = new Set<string>();

function expectCommonError(label: string, response: ContractResponse): void {
  expectErrorEnvelope(response);
  const code = errorCode(response.body);
  expect(
    code !== undefined && COMMON_ERRORS[code] === response.status,
    `${label} respondió ${response.status} con ${code ?? 'un cuerpo sin código'}, ` +
      'que el contrato no prevé para esta operación ni entre los errores comunes',
  ).toBe(true);
}

/**
 * Comprueba una respuesta real contra el contrato. `url` es la ruta tal
 * como se pidió, por ejemplo `/api/v1/rooms/0190...?limit=5`.
 *
 * - Si la operación prevé ese estado, el cuerpo debe cumplir su esquema y,
 *   si es un error, su código debe ser uno de los que enumera la operación
 *   o el error común de ese estado.
 * - Si no lo prevé, solo vale un error común con su estado.
 * - Una ruta que el contrato no tiene solo puede responder `ROUTE_NOT_FOUND`
 *   o `METHOD_NOT_ALLOWED`.
 * - Las consultas previas del navegador (`OPTIONS`) y las rutas de
 *   `OUTSIDE_CONTRACT` no se comprueban: el contrato no las describe.
 */
export function checkAgainstContract(
  method: string,
  url: string,
  response: ContractResponse,
): void {
  const verb = method.toUpperCase();
  if (verb === 'OPTIONS') return;

  const pathname = new URL(url, 'http://localhost').pathname;
  if (OUTSIDE_CONTRACT.has(pathname)) return;
  if (!pathname.startsWith(`${API_PREFIX}/`)) {
    throw new Error(
      `${verb} ${pathname} está fuera de la API versionada. Si es a propósito, añádela a OUTSIDE_CONTRACT`,
    );
  }

  const template = templateFor(pathname.slice(API_PREFIX.length));
  const operation = template ? openapi.paths[template]?.[verb.toLowerCase()] : undefined;
  const label = `${verb} ${template ?? pathname}`;

  if (!template || !operation) {
    expectCommonError(label, response);
    expect(['ROUTE_NOT_FOUND', 'METHOD_NOT_ALLOWED'], `${label} no está en el contrato`).toContain(
      errorCode(response.body),
    );
    return;
  }

  if (!operation.responses[String(response.status)]) {
    expectCommonError(label, response);
    return;
  }

  expectMatchesContract(verb, template, response);

  const code = errorCode(response.body);
  if (code !== undefined && COMMON_ERRORS[code] !== response.status) {
    const codes = documentedCodes(responsePointer(verb, template, response.status));
    expect(
      [...codes],
      `${label} ${response.status} respondió ${code}, que el contrato no enumera para esta respuesta`,
    ).toContain(code);
  }
  seen.add(`${verb} ${template} ${response.status}`);
}

// --- Informe de lo que no se ha probado -----------------------------------

const reportDir = fileURLToPath(new URL('../test-results/contrato/', import.meta.url));

/** Vacía las anotaciones de una ejecución anterior. Se llama antes de empezar. */
export function resetContractReport(): void {
  rmSync(reportDir, { recursive: true, force: true });
}

/** Guarda lo que ha visto un archivo de pruebas. Se llama al terminar cada uno. */
export function saveSeenResponses(): void {
  if (seen.size === 0) return;
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    `${reportDir}${process.pid}-${Date.now()}-${Math.random()}.json`,
    JSON.stringify([...seen]),
  );
}

/**
 * Las respuestas que el contrato prevé y que ninguna prueba ha visto. De
 * momento solo se informa de ellas; no hacen fallar nada.
 */
export function unseenResponses(): string[] {
  const all = new Set<string>();
  const files = existsSync(reportDir) ? readdirSync(reportDir, { withFileTypes: true }) : [];
  for (const file of files) {
    if (!file.isFile()) continue;
    for (const entry of JSON.parse(readFileSync(`${reportDir}${file.name}`, 'utf8')) as string[]) {
      all.add(entry);
    }
  }
  const unseen: string[] = [];
  for (const [path, operations] of Object.entries(openapi.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      for (const status of Object.keys(operation.responses)) {
        const key = `${method.toUpperCase()} ${path} ${status}`;
        if (!all.has(key)) unseen.push(key);
      }
    }
  }
  return unseen;
}
