/**
 * Todas las tablas, reunidas para la herramienta que genera las migraciones.
 * Cada tabla pertenece a un único módulo, que es el único que la lee y la
 * escribe (arquitectura, decisión D3). Ningún otro código debe importar
 * este archivo.
 */
export { authSessions } from '../modules/auth/auth.schema.js';
export {
  gameSessions,
  matchActions,
  serverLiveness,
} from '../modules/game-sessions/game-sessions.schema.js';
export { gameVersions, games } from '../modules/games/games.schema.js';
export {
  matches,
  matchPlayers,
  matchResults,
  playerResults,
} from '../modules/matches/matches.schema.js';
export { players } from '../modules/players/players.schema.js';
export { profiles } from '../modules/profiles/profiles.schema.js';
export { roomPlayers, rooms } from '../modules/rooms/rooms.schema.js';
export { users } from '../modules/users/users.schema.js';
