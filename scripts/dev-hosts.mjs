/**
 * Nombres con los que se sirve el entorno local (ADR-021).
 *
 * Sin dominio, la API y el frontend usan `localhost`. Con `--dominio`, cada
 * uno tiene su propio nombre del mismo dominio, como en producción:
 * `api.<dominio>` y `app.<dominio>`. Esos nombres tienen que apuntar al
 * equipo en el archivo `hosts` (la guía está en `docs/guia-despliegue-local.md`).
 */
import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { CERT_FILE, KEY_FILE } from './dev-paths.mjs';

/** El dominio elegido para las pruebas en local (ADR-021, decisión DL2). */
export const DEFAULT_DOMAIN = 'boardgame-coliseum.test';

const HOSTNAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * El dominio pedido: `--dominio` toma el de por defecto y `--dominio=<nombre>`
 * otro. Sin la opción, vale la variable `DEV_DOMAIN`. Si no hay ninguno, `null`.
 */
export function domainFrom(argv = process.argv.slice(2), env = process.env) {
  const option = argv.find((arg) => arg === '--dominio' || arg.startsWith('--dominio='));
  const raw =
    option === undefined
      ? env.DEV_DOMAIN || null
      : option === '--dominio'
        ? DEFAULT_DOMAIN
        : option.slice('--dominio='.length);
  if (raw === null) return null;
  const domain = raw.trim().toLowerCase();
  if (!HOSTNAME.test(domain)) {
    throw new Error(
      `El dominio "${raw}" no es válido. Usa un nombre como ${DEFAULT_DOMAIN}, con al menos un punto.`,
    );
  }
  return domain;
}

/** Nombre de la API y del frontend para un dominio, o `localhost` para los dos. */
export function hostsFor(domain) {
  return domain
    ? { api: `api.${domain}`, frontend: `app.${domain}` }
    : { api: 'localhost', frontend: 'localhost' };
}

/**
 * Termina con un mensaje si falta el certificado local o si no vale para
 * alguno de los nombres. Así el fallo se ve al arrancar y no como un aviso
 * del navegador.
 */
export function requireCertificateFor(names, domain) {
  const createCommand = domain ? `pnpm dev:cert --dominio=${domain}` : 'pnpm dev:cert';
  if (!(existsSync(CERT_FILE) && existsSync(KEY_FILE))) {
    console.error(`Falta el certificado local. Créalo una vez con: ${createCommand}`);
    process.exit(1);
  }
  const certificate = new X509Certificate(readFileSync(CERT_FILE));
  const missing = names.filter((name) => certificate.checkHost(name) === undefined);
  if (missing.length > 0) {
    console.error(`El certificado local no vale para: ${missing.join(', ')}.`);
    console.error(`Créalo de nuevo con: ${createCommand} --force`);
    process.exit(1);
  }
}
