/**
 * Comprueba que las migraciones siguen al esquema de Drizzle (ADR-002,
 * condición 5.3; análisis del 2026-11-19, T-09): genera la migración que
 * faltaría y falla si sale alguna. Necesita el código compilado, porque el
 * esquema importa el paquete de contratos ya construido:
 *
 *   pnpm build && pnpm db:check
 *
 * No toca la base de datos. Si encuentra una migración que falta, la deja
 * escrita en `apps/backend/drizzle` para revisarla.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const backend = join(root, 'apps/backend');
const migrations = 'apps/backend/drizzle';

/** Ejecuta drizzle-kit con su salida a la vista y sin poder preguntar nada. */
function drizzleKit(command) {
  execFileSync('pnpm', ['exec', 'drizzle-kit', command], {
    cwd: backend,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });
}

const changedMigrations = () =>
  execFileSync('git', ['status', '--porcelain', '--', migrations], { cwd: root, encoding: 'utf8' });

const before = changedMigrations();
drizzleKit('check');
drizzleKit('generate');
const after = changedMigrations();

if (after !== before) {
  console.error(
    `\nEl esquema cambió y falta su migración. drizzle-kit la acaba de generar:\n${after}` +
      'Revísala, ponle un nombre que diga qué cambia y súbela con el cambio del esquema.',
  );
  process.exit(1);
}
console.info('Las migraciones siguen al esquema.');
