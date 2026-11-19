/**
 * Cómo se elige qué tablero muestra un juego: por su nombre corto y su
 * versión mayor (ADR-018, decisión Z5). Una versión nueva de un motor que
 * cambie su vista sube la versión mayor y necesita su propio tablero.
 */
export function gameUiKey(gameSlug: string, gameVersion: string): string {
  const major = gameVersion.split('.')[0] ?? gameVersion;
  return `${gameSlug}@${major}`;
}
