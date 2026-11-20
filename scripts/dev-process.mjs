/**
 * Procesos del entorno local, compartidos por `pnpm dev` y `pnpm local`:
 * cómo se llama a pnpm, los pasos de preparación y los procesos que siguen
 * en marcha, con su nombre delante de cada línea.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { ROOT } from './dev-paths.mjs';

const windows = process.platform === 'win32';

/**
 * Cómo se llama a pnpm. En Windows es un archivo `.cmd` y necesita el
 * intérprete de órdenes, que recibe la orden entera en un solo texto.
 */
function pnpm(args) {
  return windows
    ? { command: `pnpm ${args.join(' ')}`, args: [], shell: true }
    : { command: 'pnpm', args, shell: false };
}

/**
 * Valores de la API cuando no hay `apps/backend/.env`: la base de datos de
 * `docker-compose.yml` y el registro como texto.
 */
export function backendDefaults() {
  return existsSync(resolve(ROOT, 'apps/backend/.env'))
    ? {}
    : {
        DATABASE_URL: 'postgres://gameboard:gameboard@localhost:5432/gameboard',
        LOG_FORMAT: 'text',
      };
}

/** Ejecuta un paso de preparación y se detiene si falla. */
export function prepare(title, args, env = process.env) {
  console.log(`\n> ${title}`);
  const { command, args: commandArgs, shell } = pnpm(args);
  const result = spawnSync(command, commandArgs, { cwd: ROOT, env, stdio: 'inherit', shell });
  if (result.status !== 0) {
    console.error(`\nNo se pudo completar: ${title}.`);
    process.exit(result.status ?? 1);
  }
}

const children = [];
const cleanups = [];
let stopping = false;

/** Detiene un proceso con todos los que haya arrancado. */
function kill(child) {
  if (windows && child.pid !== undefined) {
    // En Windows, la señal solo llega al intérprete de órdenes, no a lo que este arrancó.
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

/** Detiene todo lo arrancado. */
export function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) kill(child);
  for (const cleanup of cleanups) cleanup();
  process.exitCode = code;
}

/** Algo que hay que cerrar al detener el entorno, además de los procesos. */
export function onStop(cleanup) {
  cleanups.push(cleanup);
}

/** Ctrl+C, o la señal de terminar, lo detiene todo. */
export function stopOnSignals() {
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));
}

/** Prefijo de las líneas de un proceso, para saber de cuál vienen. */
export function prefixFor(label) {
  return `[${label}]`.padEnd(11);
}

/** Arranca un proceso que sigue en marcha y antepone su nombre a cada línea que escribe. */
export function run(label, args, env = process.env) {
  const { command, args: commandArgs, shell } = pnpm(args);
  const child = spawn(command, commandArgs, {
    cwd: ROOT,
    env: { ...env, FORCE_COLOR: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell,
  });
  const prefix = prefixFor(label);

  for (const stream of [child.stdout, child.stderr]) {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      const lines = (pending + chunk).split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) console.log(`${prefix}${line}`);
    });
    stream.on('end', () => {
      if (pending !== '') console.log(`${prefix}${pending}`);
    });
  }

  child.on('exit', (code) => {
    if (stopping) return;
    console.error(`\n${prefix}terminó de forma inesperada. Se detiene el entorno.`);
    stop(code ?? 1);
  });
  children.push(child);
}
