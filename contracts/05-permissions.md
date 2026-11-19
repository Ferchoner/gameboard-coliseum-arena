# Matriz de permisos, versión 1

| Campo | Valor |
|---|---|
| **Estado** | Versión 1, aceptada el 2026-11-16 por Fernando Hernandez Argueta. Enmendada el 2026-11-19 con precisiones de ADR-017 y de la decisión del catálogo |
| **Cubre** | Las 28 operaciones de [`01-rest-api.yaml`](01-rest-api.yaml) y las 6 órdenes de [`02-realtime.md`](02-realtime.md) |
| **Aplica** | ADR-004 (sesión con cookie), ADR-008 (punto 15, administración mínima), ADR-009 (reglas de dominio), ADR-011 (convenciones 9.11 a 9.15) |
| **Resuelve** | Vacío G-03 (roles y permisos) y pendiente P7 en la parte de permisos |

**Cómo leer este documento.** Las matrices de las secciones 2 a 5 reúnen lo que la API y el protocolo ya dicen, operación por operación. No añaden ni quitan permisos. Las decisiones de diseño propias del entregable están en la [sección 8](#8-decisiones-de-diseño-propias-de-este-entregable).

---

## 1. Quién es quién

Hay dos roles guardados y cuatro situaciones que se calculan.

| Nombre | Qué es | De dónde sale |
|---|---|---|
| **Anónimo** | Quien no tiene sesión | No hay cookie de sesión válida |
| **Jugador** | Quien tiene sesión, con cualquier rol | Sesión de una cuenta activa. Toda cuenta tiene un jugador (9.11) |
| **Administrador** | Jugador cuya cuenta tiene el rol `ADMIN` | Campo `role` de la cuenta (9.15) |
| **Miembro** | Jugador que pertenece a una sala | Tabla `room_players` |
| **Anfitrión** | El miembro que creó la sala | Tabla `rooms` |
| **Participante** | Jugador con un asiento en una partida | Tabla `match_players` |

Los únicos roles son `USER` y `ADMIN`. Miembro, anfitrión y participante no son roles: dependen de la sala o de la partida de la que se hable, y se comprueban contra los datos en cada petición.

Una cuenta suspendida no tiene sesión, así que a todos los efectos es un anónimo. Al intentar iniciar sesión recibe `ACCOUNT_SUSPENDED`.

En las matrices, **Sí** significa que puede y **No** que no. Cuando no puede, se indica el código con el que se le responde. Una celda vacía significa que la operación no tiene sentido para esa columna.

---

## 2. Cuenta, jugadores y catálogo

| Operación | Anónimo | Jugador |
|---|---|---|
| Registrarse: `POST /auth/register` | Sí | Sí |
| Iniciar sesión: `POST /auth/login` | Sí | Sí |
| Cerrar sesión: `POST /auth/logout` | Sí, sin efecto | Sí |
| Pedir la recuperación de contraseña: `POST /auth/password-reset/request` | Sí | Sí |
| Confirmar la recuperación: `POST /auth/password-reset/confirm` | Sí, con un enlace válido | Sí, con un enlace válido |
| Ver el catálogo: `GET /games`, `GET /games/{gameSlug}` | Sí | Sí |
| Ver su propia cuenta: `GET /me` | No, `UNAUTHENTICATED` | Sí |
| Cambiar su nombre visible o su biografía: `PATCH /me` | No, `UNAUTHENTICATED` | Sí |
| Cambiar su contraseña: `PUT /me/password` | No, `UNAUTHENTICATED` | Sí |
| Ver el perfil público de otro jugador: `GET /players/{username}` | No, `UNAUTHENTICATED` | Sí |
| Ver las estadísticas de otro jugador: `GET /players/{username}/statistics` | No, `UNAUTHENTICATED` | Sí |
| Abrir la conexión de tiempo real | No. El servidor rechaza la apertura | Sí |

Las rutas `/me` actúan siempre sobre la cuenta de la sesión. No existe ninguna ruta para cambiar los datos de otra persona.

---

## 3. Salas

| Operación | Jugador que no es miembro | Miembro | Anfitrión |
|---|---|---|---|
| Listar las salas en espera: `GET /rooms` | Sí | Sí | Sí |
| Crear una sala: `POST /rooms` | Sí, dentro de su límite de partidas simultáneas (7.30). Pasa a ser el anfitrión de la sala nueva | Sí, igual | Sí, igual |
| Ver una sala: `GET /rooms/{roomId}` | Sí | Sí | Sí |
| Entrar: `PUT /rooms/{roomId}/members/me` | Sí, si la sala está en espera, tiene plaza y él no ha llegado a su límite | Sí, sin efecto | Sí, sin efecto |
| Salir: `DELETE /rooms/{roomId}/members/me` | Sí, sin efecto | Sí, si no hay partida en curso. Libera su plaza | Sí, si no hay partida en curso. La sala se cierra (7.12) |
| Marcarse listo: `PUT /rooms/{roomId}/members/me/ready` | No, `PLAYER_NOT_IN_ROOM` | Sí, si la sala está en espera | Sí, si la sala está en espera |
| Suscribirse a la sala: `SUBSCRIBE_ROOM` | No, `PLAYER_NOT_IN_ROOM` | Sí | Sí |
| Dejar de estar suscrito: `UNSUBSCRIBE_ROOM` | | Sí | Sí |
| Elegir juego, modalidad, control de tiempo, capacidad, revancha y opciones | | No | Solo al crear la sala |
| Cambiar esas opciones después | | No. No existe | No. No existe |
| Expulsar a un miembro | | No. No existe | No. No existe |
| Ceder el papel de anfitrión | | | No. No existe |

Un anónimo no puede hacer ninguna de estas operaciones: recibe `UNAUTHENTICATED`.

Nadie inicia una partida a mano. Empieza sola cuando se cumplen las condiciones de las reglas 7.9, 7.10 y 7.31.

---

## 4. Partidas

| Operación | Jugador que no es participante | Participante |
|---|---|---|
| Listar sus propias partidas: `GET /me/matches` | Sí. Solo ve las suyas | Sí. Solo ve las suyas |
| Ver una partida: `GET /matches/{matchId}` | No, `PLAYER_NOT_IN_MATCH` | Sí. Recibe la vista de su asiento |
| Suscribirse a la partida: `SUBSCRIBE_MATCH` | No, `PLAYER_NOT_IN_MATCH` | Sí |
| Dejar de estar suscrito: `UNSUBSCRIBE_MATCH` | | Sí |
| Jugar: `SUBMIT_ACTION` | No, `PLAYER_NOT_IN_MATCH` | Sí, si la partida está en curso. Si le toca lo decide el motor del juego |
| Rendirse: `RESIGN_MATCH` | No, `PLAYER_NOT_IN_MATCH` | Sí, si la partida está en curso, sea o no su turno (7.19) |
| Recibir el aviso personal de sus partidas: `PLAYER_MATCH_UPDATED` | | Sí, en todas sus conexiones, sin suscribirse |
| Ver una partida como espectador | No. Posterior al MVP | |
| Ver el registro de jugadas | No. No existe en la versión 1 | No. No existe en la versión 1 |
| Ofrecer tablas | | No. No existe (7.21) |

Un anónimo no puede hacer ninguna de estas operaciones.

---

## 5. Administración

Todas exigen el rol `ADMIN`. Un jugador sin ese rol recibe `FORBIDDEN`, y un anónimo, `UNAUTHENTICATED`.

| Operación | Administrador | Límite |
|---|---|---|
| Buscar cuentas: `GET /admin/users` | Sí | Ve el correo, el rol y el estado de cada cuenta |
| Suspender o reactivar una cuenta: `PUT /admin/users/{userId}/status` | Sí | No puede suspender la suya, `CANNOT_CHANGE_OWN_STATUS` |
| Cerrar una sala: `POST /admin/rooms/{roomId}/close` | Sí | Si tenía una partida en curso, la anula |
| Anular una partida: `POST /admin/matches/{matchId}/abort` | Sí | Solo si está en curso |
| Listar todos los juegos y versiones: `GET /admin/games` | Sí | |
| Activar o desactivar un juego: `PUT /admin/games/{gameSlug}/status` | Sí | |
| Activar o desactivar una versión: `PUT /admin/games/{gameSlug}/versions/{gameVersion}/status` | Sí | No puede desactivar la vigente ni activar una sin motor |
| Elegir la versión vigente: `PUT /admin/games/{gameSlug}/current-version` | Sí | Tiene que estar activa |
| Conceder o retirar el rol de administrador | No por la API | Se hace con la orden `pnpm admin:role` (decisión A5, precisada el 2026-11-19 por ADR-017, U3) |
| Crear juegos y versiones | No por la API | Se dan de alta al desplegar su motor, inactivos, y se activan desde aquí (decisión A5; decisión del 2026-11-16 sobre el catálogo) |
| Cambiar el perfil o la contraseña de otra cuenta | No. No existe | |
| Cambiar el resultado de una partida terminada | No. No existe | |

Un administrador es además un jugador como cualquier otro. En las secciones 2 a 4 tiene exactamente los mismos permisos que un jugador: el rol no le añade nada fuera de esta sección.

---

## 6. Qué datos ve cada uno

| Dato | Quién lo ve |
|---|---|
| Correo, rol y fecha de alta de una cuenta | Su dueño y los administradores |
| Estado de una cuenta, activa o suspendida | Los administradores |
| Contraseña e identificador de sesión | Nadie. El servidor solo guarda un hash de cada uno (ADR-004) |
| Nombre de usuario, nombre visible, avatar y biografía | Cualquier jugador, salvo los de una cuenta suspendida, que responden como si no existiera. Su nombre sigue en las partidas pasadas (ADR-017, U15) |
| Estadísticas por juego | Cualquier jugador, salvo las de una cuenta suspendida (ADR-017, U15) |
| Lista de salas en espera y estado de una sala, con sus miembros y si están conectados | Cualquier jugador |
| Estado de una partida: tablero, relojes, turno y resultado | Sus participantes. Cada uno recibe la vista de su asiento, de modo que un juego con información oculta no la revela |
| Lista de partidas de un jugador | Solo ese jugador |
| Juegos activos | Todos, también los anónimos |
| Juegos y versiones inactivos | Los administradores |

---

## 7. Cómo se comprueba

### Orden de las comprobaciones

Toda petición pasa por las mismas comprobaciones, en este orden. Se responde con el primer fallo.

| # | Comprobación | Si falla, en la API | En tiempo real |
|---|---|---|---|
| 1 | Origen permitido | `403 ORIGIN_NOT_ALLOWED` | Se rechaza la apertura de la conexión |
| 2 | Límite de frecuencia. *Previsto para el Hito 7: hoy no se aplica, salvo el límite de suscripciones por conexión del canal* | `429 RATE_LIMITED` | `RATE_LIMITED` |
| 3 | Sesión válida | `401 UNAUTHENTICATED` | Se rechaza la apertura. Si la sesión termina después, cierre con el código 4001 |
| 4 | Rol, solo en administración | `403 FORBIDDEN` | No aplica |
| 5 | Forma de los datos | `400 VALIDATION_ERROR` | `INVALID_MESSAGE` |
| 6 | Lo pedido existe | `404`, con el código de lo que falta | `ROOM_NOT_FOUND` o `MATCH_NOT_FOUND` |
| 7 | Relación: miembro o participante | `403`, con `PLAYER_NOT_IN_ROOM` o `PLAYER_NOT_IN_MATCH` | Los mismos códigos |
| 8 | Estado: sala en espera, partida en curso, plazas, límites | `409`, con el código del motivo | El código del motivo |
| 9 | Reglas del juego, solo al jugar | No aplica | `NOT_YOUR_TURN` o `INVALID_ACTION`, que decide el motor |

Este orden es compatible con el que el protocolo fija para `SUBMIT_ACTION`, cuyos pasos de jugada repetida, versión del estado y reloj corresponden aquí al paso 8.

### Dónde vive cada comprobación

| Comprobación | Dónde | Motivo |
|---|---|---|
| Origen, frecuencia, sesión y rol | En la entrada del servidor, en un único sitio que usan la API y el canal de tiempo real | Ninguna operación puede olvidarse de comprobarlo |
| Relación y estado | En el módulo dueño de la sala o de la partida, dentro de la misma transacción que hace el cambio | Evita que dos peticiones simultáneas se cuelen entre la comprobación y el cambio (7.15) |
| Turno y reglas del juego | En el motor | El motor no sabe de cuentas ni de roles: solo de asientos (contrato del motor) |
| Qué botones se muestran | En el frontend | Es comodidad para el usuario. El servidor nunca se fía de ello |

---

## 8. Decisiones de diseño propias de este entregable

Estas decisiones no derivan de un ADR: se tomaron al escribir la matriz. Fueron **aceptadas el 2026-11-16** por Fernando Hernandez Argueta.

| ID | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| P1 | **El administrador no puede ver las partidas de otros.** Para verla necesita ser participante, como cualquiera. Sí puede anularla o cerrar su sala | Dejar que el administrador vea cualquier partida | No hay espectadores en el MVP, y la administración aprobada es mínima (ADR-008, punto 15). Añadirlo después es compatible |
| P2 | **El anfitrión no tiene poderes propios una vez creada la sala.** No puede expulsar a nadie, cambiar las opciones ni ceder su papel. Lo único que lo distingue es que, si sale, la sala se cierra | Permitirle expulsar o cambiar opciones | Con salas públicas que empiezan solas, esos poderes aportan poco y añaden casos que programar y probar. Quien no esté conforme con una sala crea otra |
| P3 | **Un administrador puede suspender a otro administrador**, pero no a sí mismo | Impedir que los administradores se suspendan entre sí | El rol solo se concede en la base de datos, a muy pocas personas. Impedirlo dejaría sin remedio rápido una cuenta de administrador comprometida |
| P4 | **Solo dos roles guardados.** Miembro, anfitrión y participante se calculan de los datos | Guardar más roles o una tabla de permisos | Sigue la convención 9.15. Una relación con una sala concreta no es un rol de la cuenta |
| P5 | **El rol de administrador solo añade las operaciones de `/admin`.** No da ningún permiso extra en salas ni en partidas, y no existe ninguna orden de administración por el canal de tiempo real | Que el rol abra también las operaciones normales | Mantiene la administración en un solo sitio, fácil de auditar |
| P6 | **Un orden único de comprobaciones** para todas las operaciones (sección 7) | Dejar el orden a cada operación | La misma petición recibe siempre el mismo error, y las pruebas pueden contar con ello |
| P7 | **Nadie cambia los datos de otra persona.** Ni siquiera un administrador puede editar un perfil ajeno o fijar una contraseña ajena | Darle esas operaciones al administrador | No están en el alcance aprobado. La suspensión cubre el caso de un perfil inaceptable |

---

## 9. Asuntos abiertos

| Asunto | Estado |
|---|---|
| **Jugador retirado en una partida de más de dos que continúa.** Hay que decidir si sigue viendo la partida y si recibe sus avisos | *Cerrado el 2026-11-19 (ADR-020, DO19 a DO21):* sigue viendo la partida hasta el final como participante, no recibe aviso de turno porque nunca vuelve a estar activo, y no puede rendirse otra vez |
| **Registro de acciones de administración.** Quién suspendió una cuenta o anuló una partida no queda guardado | Ya anotado en el modelo de datos. Conviene valorarlo antes del lanzamiento público |
| **Espectadores y salas privadas** | Posteriores al MVP. Añadirán una situación nueva, la de invitado o espectador, sin cambiar las actuales |
