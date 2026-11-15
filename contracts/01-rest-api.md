# API REST, versión 1: notas

| Campo | Valor |
|---|---|
| **Estado** | Versión 1, en revisión |
| **Contrato** | [`01-rest-api.yaml`](01-rest-api.yaml), en formato OpenAPI 3.1 |
| **Sustituye a** | El contrato REST preliminar |
| **Aplica** | ADR-004 (sesión con cookie), ADR-008 (alcance del MVP), ADR-009 (reglas de dominio), ADR-011 (convenciones), el modelo de datos y el protocolo de tiempo real (decisiones T1 y T2) |
| **Resuelve** | Hallazgos C-01, C-02, C-03, C-04 y C-05 en la parte de la API |

**Cómo leer este documento.** El contrato es el archivo OpenAPI, que define cada operación con sus datos de entrada, de salida y sus errores. Este documento resume las operaciones, explica las reglas comunes y reúne las decisiones de diseño propias del entregable en la [sección 7](#7-puntos-a-revisar), marcadas como recomendación. No deben darse por aprobadas hasta que se confirmen.

Los códigos de error son provisionales en su redacción: el catálogo único de errores, que es el entregable siguiente, los reúne con los del protocolo y los del motor. El detalle de quién puede hacer cada operación irá en la matriz de permisos.

---

## 1. Reglas comunes

| Asunto | Regla | Origen |
|---|---|---|
| Ruta base | `/api/v1`. El número es la `apiVersion` | 9.10 |
| Formato | JSON, con los campos en `camelCase`. Fechas en ISO 8601 y UTC; duraciones en milisegundos | 9.2, 9.3 |
| Identificadores | UUID, salvo dos que son legibles: el juego se identifica por su nombre corto (`gameSlug`) y un jugador, en las rutas públicas, por su nombre de usuario | 9.4, 9.5, 9.12 |
| Identidad | Cookie de sesión. La API nunca acepta un identificador de jugador como prueba de identidad: "yo" es siempre quien tiene la sesión | Acuerdo B11 |
| Respuesta correcta | `{ "success": true, "data": ... }` | |
| Respuesta de error | `{ "success": false, "error": { "code", "message", "details" } }`. El cliente decide por `code`. El texto que ve el usuario lo pone el frontend, en español | 9.1 |
| Listas largas | Paginación por cursor: la respuesta trae `items` y `nextCursor`. Por defecto 20 elementos, como máximo 50 | |
| Seguimiento | Toda respuesta lleva la cabecera `X-Request-Id`, para poder localizar una petición en los registros del servidor | |

### Sesión, CORS y CSRF

| Asunto | Regla | Origen |
|---|---|---|
| Cookie | `HttpOnly`, `Secure` y `SameSite=Lax`. Su valor es un identificador opaco | ADR-004, condiciones 5.1 y 5.2 |
| Alcance de la cookie | **Propuesta pendiente de confirmación:** ligada solo al host de la API | ADR-004, sección 5 |
| Duración | 30 días de inactividad, con un tope de 90 días | ADR-004, condición 5.6 |
| CORS | Solo se admite el origen exacto del frontend, con credenciales. El frontend envía sus peticiones con las credenciales incluidas | ADR-004, condición 5.4 |
| CSRF | El servidor rechaza con `403` las peticiones que cambian algo y no vienen del origen del frontend | ADR-004, condición 5.3 |
| Ya no existe | `POST /auth/refresh`. Con sesión de servidor no hay nada que renovar | ADR-004. Resuelve C-03 |

### Códigos de estado

| Estado | Cuándo |
|---|---|
| `200` | Correcto, con datos |
| `201` | Se creó algo |
| `202` | Petición aceptada, sin indicar su resultado. Solo en la recuperación de contraseña |
| `204` | Correcto, sin datos |
| `400` | La petición no es válida |
| `401` | No hay sesión |
| `403` | Hay sesión, pero no permiso |
| `404` | Lo pedido no existe |
| `409` | La operación choca con el estado actual: sala llena, partida en curso, nombre ya usado |
| `429` | Demasiadas peticiones |
| `500` | Fallo del servidor |

---

## 2. Operaciones

Son 28. "Sesión" significa que hace falta haber iniciado sesión.

### Autenticación

| Método y ruta | Qué hace | Requiere |
|---|---|---|
| `POST /auth/register` | Crea la cuenta, el perfil y el jugador, e inicia sesión | Nada |
| `POST /auth/login` | Inicia sesión con nombre de usuario y contraseña | Nada |
| `POST /auth/logout` | Cierra la sesión en el servidor y sus conexiones de tiempo real | Nada |
| `POST /auth/password-reset/request` | Envía por correo un enlace de recuperación | Nada |
| `POST /auth/password-reset/confirm` | Fija una contraseña nueva con ese enlace y cierra todas las sesiones | Nada |

### Cuenta

| Método y ruta | Qué hace | Requiere |
|---|---|---|
| `GET /me` | Devuelve la cuenta, el perfil y el jugador propios | Sesión |
| `PATCH /me` | Cambia el nombre visible o la biografía | Sesión |
| `PUT /me/password` | Cambia la contraseña y cierra las demás sesiones | Sesión |

### Jugadores

| Método y ruta | Qué hace | Requiere |
|---|---|---|
| `GET /players/{username}` | Perfil público de un jugador | Sesión |
| `GET /players/{username}/statistics` | Sus estadísticas por juego: jugadas, ganadas, perdidas y empatadas | Sesión |

### Catálogo

| Método y ruta | Qué hace | Requiere |
|---|---|---|
| `GET /games` | Lista los juegos activos, con lo que declara su motor: jugadores y controles de tiempo admitidos | Nada |
| `GET /games/{gameSlug}` | Un juego | Nada |

### Salas

| Método y ruta | Qué hace | Requiere |
|---|---|---|
| `GET /rooms` | Lista las salas en espera, con filtros por juego y modalidad | Sesión |
| `POST /rooms` | Crea una sala. Quien la crea es su anfitrión | Sesión |
| `GET /rooms/{roomId}` | Estado completo de una sala | Sesión |
| `PUT /rooms/{roomId}/members/me` | Entrar a la sala | Sesión |
| `DELETE /rooms/{roomId}/members/me` | Salir de la sala. Si sale el anfitrión, la sala se cierra | Sesión |
| `PUT /rooms/{roomId}/members/me/ready` | Marcarse como listo o dejar de estarlo | Ser miembro |

Entrar y marcarse listo pueden hacer que la partida empiece (7.9, 7.10, 7.31). En ese caso la respuesta ya trae la sala en `IN_MATCH`, con el identificador de la partida.

### Partidas

| Método y ruta | Qué hace | Requiere |
|---|---|---|
| `GET /me/matches` | Las partidas propias. Con `status=IN_PROGRESS` es "mis partidas en curso", que indica en cuáles te toca. Con `status=FINISHED` es el historial | Sesión |
| `GET /matches/{matchId}` | Una partida, desde el asiento de quien la pide | Ser participante |

Jugar y rendirse no están en la API: van por el canal de tiempo real (decisiones T1 y T2 del protocolo).

### Administración

| Método y ruta | Qué hace | Requiere |
|---|---|---|
| `GET /admin/users` | Busca cuentas | Rol de administrador |
| `PUT /admin/users/{userId}/status` | Suspende o reactiva una cuenta. Al suspender, cierra sus sesiones y conexiones de inmediato | Rol de administrador |
| `POST /admin/rooms/{roomId}/close` | Cierra una sala. Si tenía una partida en curso, la anula | Rol de administrador |
| `POST /admin/matches/{matchId}/abort` | Anula una partida | Rol de administrador |
| `GET /admin/games` | Lista todos los juegos y versiones, también los inactivos | Rol de administrador |
| `PUT /admin/games/{gameSlug}/status` | Activa o desactiva un juego | Rol de administrador |
| `PUT /admin/games/{gameSlug}/versions/{gameVersion}/status` | Activa o desactiva una versión | Rol de administrador |
| `PUT /admin/games/{gameSlug}/current-version` | Elige la versión vigente | Rol de administrador |

---

## 3. Ejemplo: crear una sala

Petición a `POST /api/v1/rooms`:

```json
{
  "gameSlug": "four-in-a-row",
  "mode": "TURN_BASED",
  "timeControl": { "type": "TOTAL_PER_PLAYER", "totalMs": 86400000 },
  "maxPlayers": 2,
  "rematchEnabled": true,
  "settings": {}
}
```

Respuesta `201`:

```json
{
  "success": true,
  "data": {
    "roomId": "c4e2a7d6-91b3-4f58-a0c7-2b6d8e9f1a05",
    "gameSlug": "four-in-a-row",
    "mode": "TURN_BASED",
    "timeControl": { "type": "TOTAL_PER_PLAYER", "totalMs": 86400000 },
    "maxPlayers": 2,
    "rematchEnabled": true,
    "settings": {},
    "status": "WAITING",
    "closeReason": null,
    "ownerPlayerId": "1a6f0c3b-8d27-4e19-b5a4-9c0e2d7f6b81",
    "members": [
      {
        "playerId": "1a6f0c3b-8d27-4e19-b5a4-9c0e2d7f6b81",
        "username": "ana",
        "displayName": "Ana",
        "ready": false,
        "connected": true,
        "joinedAt": "2026-11-15T21:30:00.000Z"
      }
    ],
    "currentMatchId": null
  }
}
```

Respuesta `409` si ya tiene veinte partidas por turnos:

```json
{
  "success": false,
  "error": {
    "code": "MATCH_LIMIT_REACHED",
    "message": "The player has reached the limit of simultaneous turn-based matches."
  }
}
```

---

## 4. Límites de frecuencia

Valores iniciales. Todos son configurables y se ajustarán con datos reales.

| Operación | Valor inicial |
|---|---|
| Inicio de sesión | 5 intentos fallidos cada 15 minutos por cuenta y por dirección de red |
| Registro | 5 cada hora por dirección de red |
| Recuperación de contraseña | 3 cada hora por correo y por dirección de red |
| Resto de la API | 120 peticiones por minuto por sesión |

Al superarlos, la API responde `429` con el código `RATE_LIMITED` y la cabecera `Retry-After`.

---

## 5. Lo que no está en la versión 1

| Asunto | Motivo |
|---|---|
| Puntuación y clasificación | Posteriores al MVP (ADR-008, punto 14). Se retiran `/players/me/rankings` y `/games/:gameId/ranking`. Resuelve C-01 |
| Verificación de correo y cambio de correo | Posteriores al MVP (ADR-008, punto 18) |
| Acceso con cuentas externas | Posterior al MVP (ADR-008, punto 19) |
| Subida de avatar | No está en el alcance. El campo `avatarUrl` existe y queda vacío |
| Consulta del registro de jugadas de una partida | Los datos se guardan (8.2), pero ninguna pantalla del MVP los muestra |
| Salas privadas, invitaciones y espectadores | Posteriores al MVP (ADR-008, punto 21) |
| Crear juegos y versiones | No se hace por la API. Un juego y sus versiones se dan de alta al desplegar su motor |
| Conceder el rol de administrador | No se hace por la API. Se asigna directamente en la base de datos |
| Comprobación de salud del servidor | Se define al iniciar el Hito 1 |

---

## 6. Cambios respecto al contrato preliminar

| Antes | Ahora | Motivo |
|---|---|---|
| `POST /auth/refresh` | Desaparece | ADR-004 |
| `GET /auth/me`, `GET/PATCH /users/me`, `GET /players/me` | `GET/PATCH /me` | Eran tres vistas de la misma persona |
| `GET /players/me/statistics` | `GET /players/{username}/statistics` | Sirve para las propias y para las de un rival |
| `GET /players/me/rankings`, `GET /games/:gameId/ranking` | Desaparecen | ADR-008, punto 14 |
| `/games/:gameId` | `/games/{gameSlug}` | 9.5. Resuelve C-05 |
| `GET /games/:gameId/versions` | `GET /admin/games` | Las versiones solo interesan a la administración |
| `POST /rooms/:roomId/join` y `/leave` | `PUT` y `DELETE /rooms/{roomId}/members/me` | Repetir la petición no causa errores. Resuelve C-04 junto con el protocolo |
| Marcarse listo por WebSocket | `PUT /rooms/{roomId}/members/me/ready` | Decisión T1 del protocolo |
| `GET /matches` | `GET /me/matches` | Deja claro que son las partidas propias |
| Al crear una sala: `gameId`, `visibility` | `gameSlug`, `mode`, `timeControl`, `rematchEnabled`. Sin `visibility` | 7.1, 7.2, 7.31 y 9.5. Las salas privadas son posteriores al MVP |
| Sin administración | Ocho operaciones bajo `/admin` | ADR-008, punto 15. Resuelve C-02 |
| Sin recuperación de contraseña | Dos operaciones | ADR-008, punto 17 |

---

## 7. Puntos a revisar

Estas son las decisiones de diseño que este entregable toma por su cuenta. Son **recomendaciones pendientes de confirmación**. Las cinco primeras son las que más pesan.

| ID | Recomendación | Alternativa | Motivo |
|---|---|---|---|
| A1 | **Cambia un contrato ya aceptado.** El resumen de partida gana cuatro campos: tu resultado, el motivo del final, y las fechas de inicio y de final. Ya los añadí también al aviso personal del protocolo de tiempo real, para que los dos usen la misma forma | Dos formas distintas: una para el aviso y otra para el historial | Con una sola forma, el cliente trata igual una partida venga de la lista o de un aviso. El cambio solo añade campos |
| A2 | **Entrar y salir de una sala son `PUT` y `DELETE` sobre la pertenencia propia**, no acciones `POST` | `POST /rooms/{roomId}/join` y `/leave`, como en el contrato preliminar | Si la red falla y el cliente repite la petición, el resultado es el mismo. Con `POST`, repetir podría dar un error |
| A3 | **Una sola ruta, `/me`, para la cuenta propia** | Las tres del contrato preliminar | Cuenta, perfil y jugador son tres tablas, pero para quien usa la aplicación son una sola cosa |
| A4 | **El perfil público y las estadísticas de cualquier jugador son visibles para quien tenga sesión** | Que cada uno vea solo las suyas | Ver el historial del rival es lo habitual en este tipo de sitios. No expone ni el correo ni datos de la cuenta |
| A5 | **Los juegos y sus versiones no se crean por la API, y el rol de administrador no se concede por la API** | Operaciones de administración para ambas cosas | Un juego sin motor desplegado no sirve de nada. Conceder el rol es raro y delicado; hacerlo en la base de datos evita una operación que habría que proteger con mucho cuidado |
| A6 | **Registrarse inicia la sesión directamente** | Obligar a iniciar sesión después | No hay verificación de correo en el MVP, así que el paso extra no aporta nada |
| A7 | **Se inicia sesión solo con el nombre de usuario** | Admitir también el correo | Sigue la convención 9.12. Admitir el correo puede añadirse después |
| A8 | **El catálogo de juegos se consulta sin sesión** | Exigir sesión | Las páginas públicas del frontend se generan de antemano y muestran el catálogo (ADR-006) |
| A9 | **Cualquier jugador con sesión puede consultar una sala** | Solo sus miembros | Las salas son públicas: hay que poder verlas para decidir si entrar |
| A10 | **Solo los participantes pueden consultar una partida** | Cualquier jugador con sesión | Los espectadores son posteriores al MVP. El historial de otro jugador se ve en sus estadísticas, no partida a partida |
| A11 | **Se mantiene el sobre de respuesta con `success`**, y la paginación es por cursor | Responder solo con los datos y apoyarse en el código de estado | Es el formato del contrato preliminar. El cursor no se descuadra cuando aparecen salas nuevas mientras se pagina |
| A12 | **El registro dice si un correo o un nombre de usuario ya están en uso** | Responder siempre lo mismo | Sin verificación de correo no hay forma de ocultarlo sin perjudicar a quien se registra. La recuperación de contraseña sí lo oculta |
| A13 | **Cambiar la contraseña cierra las demás sesiones; recuperarla las cierra todas.** El enlace de recuperación sirve una vez y caduca en 1 hora | No cerrar sesiones | Si alguien cambia la contraseña porque sospecha de un acceso ajeno, ese acceso debe terminar |
| A14 | **Límites de los datos:** nombre de usuario de 3 a 20 caracteres, con letras sin acento, números y guion bajo; nombre visible de 1 a 30; contraseña de 10 a 128; biografía de hasta 280 | Otros valores | Son valores habituales. El tope de la contraseña evita que una contraseña enorme sature el cálculo de su hash |
| A15 | **Valores iniciales de los límites de frecuencia** de la sección 4 | | Son un punto de partida razonable, no el resultado de una medición |
| A16 | **Suspender una cuenta no toca sus partidas.** Al quedarse sin conexión, pierde las de tiempo real por abandono y las de turnos por tiempo agotado | Anular sus partidas o darlas por perdidas al momento | Usa las reglas que ya existen. Un administrador puede además anular una partida concreta |
| A17 | **Cabecera `X-Request-Id` en toda respuesta** | No incluirla | Permite localizar una petición concreta cuando alguien informa de un fallo |

---

## 8. Comprobaciones

- El archivo OpenAPI se validó contra la especificación 3.1 con un validador automático, sin errores.
- Todas las referencias entre esquemas existen y no queda ningún esquema sin usar.
- Las formas de sala, partida y resumen de partida coinciden campo a campo con las del protocolo de tiempo real. Hoy están escritas dos veces, una en cada contrato. Al iniciar el Hito 1 pasarán a definirse una sola vez en el paquete de contratos (ADR-005).
