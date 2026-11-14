# Dominio y modelo relacional preliminar

## Entidades
| Tabla | Campos representativos | Restricciones clave |
|---|---|---|
| users | id, email, username, password_hash, status, created_at, updated_at | email y username normalizados únicos |
| profiles | id, user_id, display_name, avatar_url, biography, preferences | user_id único |
| players | id, user_id, nickname, status | user_id único |
| games | id, slug, name, description, status, min_players, max_players | slug único |
| game_versions | id, game_id, version, status, released_at | (game_id, version) único |
| rooms | id, game_id, owner_player_id, status, visibility, max_players, settings, created_at | FKs válidas |
| room_players | id, room_id, player_id, role, status, is_ready, joined_at | (room_id, player_id) único |
| matches | id, room_id, game_id, game_version_id, status, started_at, finished_at | FKs válidas |
| match_players | id, match_id, player_id, seat, team, status | (match_id, player_id) único |
| game_sessions | id, match_id, status, state, state_version, last_activity_at | match_id único |
| game_events | id, session_id, sequence, event_type, payload, created_at | (session_id, sequence) único |
| match_results | id, match_id, status, reason, completed_at | match_id único |
| player_results | id, match_result_id, player_id, outcome, score | (match_result_id, player_id) único |
| game_statistics | id, player_id, game_id, played, wins, losses, draws, updated_at | (player_id, game_id) único |
| game_ratings | id, player_id, game_id, rating, updated_at | (player_id, game_id) único |

## Relaciones
User 1:1 Profile; User 1:1 Player (MVP). Game 1:N GameVersion y Room. Room N:M Player vía RoomPlayer. Room 1:N Match (sujeto a política de reutilización). Match N:M Player vía MatchPlayer. Match 1:1 GameSession y 0..1 MatchResult. GameSession 1:N GameEvent. MatchResult 1:N PlayerResult. Player y Game 1:N Statistics/Rating.

## Convenciones
UUID para IDs, `timestamptz` para fechas, `JSONB` para configuración y snapshots específicos del juego; validar su esquema. `state_version` es contador de concurrencia, no versión del juego. Índices para búsqueda de salas `(game_id,status,visibility)`, historial `(game_id,started_at)` y `(player_id,match_id)`.

## Estados orientativos
Room: WAITING, READY, PLAYING, CLOSED; admite transiciones de regreso READY→WAITING y cierre anticipado. Match: CREATED, STARTING, PLAYING, FINISHED, ABORTED (PAUSED opcional). Session: INITIALIZING, ACTIVE, RECOVERING, CLOSED. Formalizar máquinas de estados y transiciones antes de codificar.

## Reglas de integridad a definir
Un asiento por jugador/partida; evitar exceso de capacidad con concurrencia; política de reutilización de salas; retención de eventos y snapshots; eliminación/anonimización de cuentas; coherencia entre GameVersion y Game.
