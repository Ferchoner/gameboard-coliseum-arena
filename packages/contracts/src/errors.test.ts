import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { API_ERROR_CODES, ERROR_CATALOG, ERROR_CODES, type ErrorReaction } from './errors.js';

const contractsDir = fileURLToPath(new URL('../../../contracts/', import.meta.url));

const REACTIONS: Record<string, ErrorReaction | null> = {
  Corregir: 'FIX',
  'Iniciar sesión': 'SIGN_IN',
  Actualizar: 'REFRESH',
  Informar: 'INFORM',
  Esperar: 'WAIT',
  Defecto: 'BUG',
  '': null,
};

/** Lee las tablas de códigos del documento del catálogo. */
function readCatalogDocument() {
  const text = readFileSync(`${contractsDir}04-error-catalog.md`, 'utf8');
  const rows = new Map<string, unknown>();
  let section = 0;
  for (const line of text.split('\n')) {
    const heading = /^## (\d+)\./.exec(line);
    if (heading) section = Number(heading[1]);
    if (section < 3 || section > 8) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    const code = /^`([A-Z_]+)`$/.exec(cells[1] ?? '');
    if (!code?.[1]) continue;
    rows.set(code[1], {
      httpStatus: cells[3] ? Number(cells[3]) : null,
      realtime: cells[4] === 'Sí',
      engine: cells[5] === 'Sí',
      reaction: REACTIONS[cells[6] ?? ''],
    });
  }
  return rows;
}

describe('catálogo de errores', () => {
  it('coincide con el documento del catálogo, código por código', () => {
    const documented = readCatalogDocument();

    expect([...documented.keys()].sort()).toEqual([...ERROR_CODES].sort());
    for (const code of ERROR_CODES) {
      expect(documented.get(code), code).toEqual(ERROR_CATALOG[code]);
    }
  });

  it('tiene 41 códigos', () => {
    expect(ERROR_CODES).toHaveLength(41);
  });

  it('los códigos de la API son los de la lista cerrada del archivo OpenAPI', () => {
    const openapi = parse(readFileSync(`${contractsDir}01-rest-api.yaml`, 'utf8')) as {
      components: { schemas: { ErrorCode: { enum: string[] } } };
    };

    expect([...API_ERROR_CODES].sort()).toEqual([...openapi.components.schemas.ErrorCode.enum].sort());
  });
});
