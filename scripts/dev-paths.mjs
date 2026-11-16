import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Raíz del repositorio. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Certificado local para el modo HTTPS. La carpeta no se guarda en el repositorio. */
export const CERT_DIR = resolve(ROOT, '.certs');
export const CERT_FILE = resolve(CERT_DIR, 'localhost.pem');
export const KEY_FILE = resolve(CERT_DIR, 'localhost-key.pem');
