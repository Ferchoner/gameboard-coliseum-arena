# Contrato REST preliminar — `/api/v1`

## Respuestas
Éxito: `{"success":true,"data":{}}`. Error: `{"success":false,"error":{"code":"ROOM_NOT_FOUND","message":"The requested room does not exist."}}`. Definir metadatos de paginación y correlationId en formalización OpenAPI.

## Endpoints propuestos
| Método | Ruta | Uso |
|---|---|---|
| POST | /auth/register | Registro |
| POST | /auth/login | Login |
| POST | /auth/logout | Logout |
| POST | /auth/refresh | Renovación |
| GET | /auth/me | Identidad autenticada |
| GET/PATCH | /users/me | Cuenta |
| GET | /players/me | Perfil jugador |
| GET | /players/me/statistics | Estadísticas |
| GET | /players/me/rankings | Ratings |
| GET | /games | Catálogo |
| GET | /games/:gameId | Juego |
| GET | /games/:gameId/versions | Versiones |
| GET/POST | /rooms | Listar/crear |
| GET | /rooms/:roomId | Sala |
| POST | /rooms/:roomId/join | Entrar |
| POST | /rooms/:roomId/leave | Salir |
| GET | /matches | Historial |
| GET | /matches/:matchId | Detalle |
| GET | /games/:gameId/ranking | Ranking |

## Ejemplo crear sala
```json
{"gameId":"connect-four","maxPlayers":2,"visibility":"PUBLIC","settings":{}}
```

## Seguridad
Autenticación y refresh por mecanismo aún por decidir (sesión/cookies/JWT). No exponer refresh tokens en JSON como decisión implícita; preferir evaluar cookies HttpOnly seguras y CSRF cuando aplique. Validar autorización por operación, no solo autenticación.

## Pendiente para OpenAPI
DTOs formales, HTTP status codes, paginación/filtros, esquema de validación, errores por endpoint, permisos, rate limits y política de versionado.
