# Catálogo único de errores, versión 1

| Campo | Valor |
|---|---|
| **Estado** | Versión 1, aceptada el 2026-11-16 por Fernando Hernandez Argueta |
| **Reúne** | Los códigos de [`01-rest-api.yaml`](01-rest-api.yaml), [`02-realtime.ts`](02-realtime.ts) y [`03-game-engine.ts`](03-game-engine.ts) |
| **Aplica** | ADR-011 (convención 9.1), ADR-009 (reglas de dominio), ADR-010 (reglas 8.11 y 8.12) |
| **Resuelve** | Vacío G-04 (catálogo de errores unificado) |

**Cómo leer este documento.** Las secciones 3 a 8 listan cada código una sola vez, con el canal en el que aparece. Casi todo sale de los tres contratos y no cambia nada. Lo que este catálogo añadió está en dos sitios: la [sección 10](#10-ajustes-hechos-a-los-contratos), con cinco ajustes a la API, y la [sección 11](#11-decisiones-de-diseño-propias-de-este-entregable), con las decisiones de diseño propias del entregable.

---

## 1. Reglas del catálogo

| Regla | Detalle |
|---|---|
| Un código, un significado | Un código significa lo mismo en la API, en el canal de tiempo real y en el motor. Si la misma situación puede darse en dos canales, usa el mismo código en los dos |
| Formato | Inglés, mayúsculas y guion bajo (9.1). El nombre dice qué pasa y a qué, por ejemplo `ROOM_FULL`. No lleva prefijo de canal ni de módulo |
| Lista cerrada | El servidor solo emite los códigos de este catálogo |
| Estado HTTP fijo | En la API, cada código va siempre con el mismo estado HTTP |
| El cliente decide por el código | Nunca por el texto de `message`, que está en inglés y es para quien desarrolla. El texto que ve el usuario lo pone el frontend, en español, a partir del código |
| Compatibilidad | Añadir un código no rompe a nadie. Cambiar el nombre o el significado de uno exige una versión nueva de la API o del protocolo. El cliente trata un código que no conoce como un fallo genérico |
| Sin datos internos | Ningún error expone trazas, consultas ni nombres internos. Para investigar un fallo se usa la cabecera `X-Request-Id` de la API, o el `requestId` de la orden en tiempo real |

### Dónde aparece un error

| Canal | Forma |
|---|---|
| API | Respuesta con `success: false` y `error: { code, message, details }` |
| Tiempo real | Notificación `COMMAND_REJECTED`, con `code` en su contenido. Va solo a quien envió la orden |
| Motor | Respuesta rechazada, con `code` y un `reason` opcional propio del juego. El cliente nunca habla con el motor: la plataforma traduce estos códigos según la [sección 9](#9-cómo-se-traducen-los-códigos-del-motor) |

### Qué hace el cliente

Cada código lleva una de estas seis reacciones.

| Reacción | Qué significa |
|---|---|
| **Corregir** | El usuario puede arreglarlo. El cliente le muestra qué falló y le deja intentarlo de nuevo |
| **Iniciar sesión** | No hay sesión válida. El cliente lleva a la pantalla de inicio de sesión |
| **Actualizar** | Lo que el cliente tenía en pantalla ya no es cierto. Vuelve a pedir la sala o la partida y muestra el estado nuevo |
| **Informar** | No se puede hacer y repetirlo no servirá. El cliente lo explica |
| **Esperar** | Puede funcionar más tarde. El cliente espera antes de reintentar |
| **Defecto** | Con un cliente correcto no debería ocurrir. El cliente muestra un fallo genérico y lo registra |

---

## 2. Resumen

| Grupo | Códigos |
|---|---|
| Generales | 10 |
| Autenticación y cuenta | 6 |
| Jugadores y catálogo | 2 |
| Salas | 8 |
| Partidas y juego | 9 |
| Administración | 6 |
| **Total** | **41** |

De los 41, cuatro los añadió este catálogo (sección 10). Los otros 37 ya estaban en los contratos.

En las tablas, la columna **API** da el estado HTTP, **TR** indica si el código puede llegar en un `COMMAND_REJECTED` del canal de tiempo real y **Motor** si lo emite el motor de juego.

---

## 3. Generales

| Código | Significado | API | TR | Motor | Reacción |
|---|---|---|---|---|---|
| `VALIDATION_ERROR` | Un dato de la petición falta o no cumple su formato. También cuando el cuerpo no es JSON válido | 400 | | | Corregir |
| `INVALID_MESSAGE` | El mensaje no es JSON, le falta un campo obligatorio o su tipo no existe | | Sí | | Defecto |
| `UNAUTHENTICATED` | No hay sesión, o la sesión caducó o fue cerrada | 401 | | | Iniciar sesión |
| `FORBIDDEN` | La cuenta no tiene el rol que la operación exige | 403 | | | Informar |
| `ORIGIN_NOT_ALLOWED` | La petición no viene del origen del frontend | 403 | | | Defecto |
| `ROUTE_NOT_FOUND` | La ruta no existe en la API | 404 | | | Defecto |
| `METHOD_NOT_ALLOWED` | La ruta existe, pero no admite ese método | 405 | | | Defecto |
| `PAYLOAD_TOO_LARGE` | El cuerpo de la petición supera el tamaño admitido | 413 | | | Defecto |
| `RATE_LIMITED` | Demasiadas peticiones u órdenes en poco tiempo | 429 | Sí | | Esperar |
| `INTERNAL_ERROR` | Fallo del servidor. La operación no se aplicó | 500 | Sí | | Esperar |

En el canal de tiempo real no existe un código para "sin sesión": si la sesión termina, el servidor cierra la conexión con el código de cierre 4001 ([sección 12](#12-cierres-de-la-conexión-de-tiempo-real)).

---

## 4. Autenticación y cuenta

| Código | Significado | API | TR | Motor | Reacción |
|---|---|---|---|---|---|
| `EMAIL_TAKEN` | Ya existe una cuenta con ese correo | 409 | | | Corregir |
| `USERNAME_TAKEN` | Ya existe una cuenta con ese nombre de usuario | 409 | | | Corregir |
| `INVALID_CREDENTIALS` | El nombre de usuario o la contraseña no son correctos. No se dice cuál | 401 | | | Corregir |
| `ACCOUNT_SUSPENDED` | La cuenta está suspendida. Solo aparece al iniciar sesión | 403 | | | Informar |
| `INVALID_RESET_TOKEN` | El enlace de recuperación no existe, caducó o ya se usó | 400 | | | Informar |
| `INVALID_CURRENT_PASSWORD` | La contraseña actual no es correcta | 400 | | | Corregir |

---

## 5. Jugadores y catálogo

| Código | Significado | API | TR | Motor | Reacción |
|---|---|---|---|---|---|
| `PLAYER_NOT_FOUND` | No existe ningún jugador con ese nombre de usuario | 404 | | | Informar |
| `GAME_NOT_FOUND` | El juego no existe. Fuera de administración, también si no está activo | 404 | | | Informar |

---

## 6. Salas

| Código | Significado | API | TR | Motor | Reacción |
|---|---|---|---|---|---|
| `ROOM_NOT_FOUND` | La sala no existe. Al suscribirse en tiempo real, también si ya está cerrada | 404 | Sí | | Informar |
| `PLAYER_NOT_IN_ROOM` | Quien lo pide no es miembro de la sala | 403 | Sí | | Actualizar |
| `ROOM_NOT_WAITING` | La sala tiene una partida en curso o está cerrada | 409 | | | Actualizar |
| `ROOM_FULL` | La sala no tiene plazas libres | 409 | | | Actualizar |
| `ROOM_IN_MATCH` | Hay una partida en curso. Para dejarla hay que rendirse (7.13) | 409 | | | Informar |
| `MATCH_LIMIT_REACHED` | El jugador ya tiene el máximo de partidas simultáneas de esa modalidad (7.30) | 409 | | | Informar |
| `UNSUPPORTED_ROOM_OPTIONS` | El juego no admite esa modalidad, ese control de tiempo o esa capacidad | 400 | | | Corregir |
| `INVALID_SETTINGS` | El motor rechazó las opciones propias del juego | 400 | | Sí | Corregir |

---

## 7. Partidas y juego

| Código | Significado | API | TR | Motor | Reacción |
|---|---|---|---|---|---|
| `MATCH_NOT_FOUND` | La partida no existe | 404 | Sí | | Informar |
| `PLAYER_NOT_IN_MATCH` | Quien lo pide no es participante de la partida | 403 | Sí | | Informar |
| `MATCH_NOT_IN_PROGRESS` | La partida no está en curso: terminó o se anuló | 409 | Sí | | Actualizar |
| `STALE_STATE_VERSION` | La jugada se hizo sobre un estado que ya cambió (8.11) | | Sí | | Actualizar |
| `CLOCK_EXPIRED` | El reloj del jugador se agotó antes de que llegara la jugada (7.5) | | Sí | | Actualizar |
| `NOT_YOUR_TURN` | Quien envía no puede jugar ahora | | Sí | Sí | Actualizar |
| `INVALID_ACTION` | La acción está mal formada o las reglas del juego no la permiten | | Sí | Sí | Corregir |
| `GAME_ALREADY_FINISHED` | El juego ya terminó. No llega al cliente | | | Sí | |
| `INVALID_GAME_STATE` | El estado guardado no es válido para ese motor. No llega al cliente | | | Sí | |

Una jugada repetida con el mismo `requestId` no es un error: el servidor responde con el estado actual y no aplica nada (8.12).

---

## 8. Administración

Códigos que solo aparecen en las operaciones de administración. Estas operaciones responden además `FORBIDDEN` a quien no tiene el rol.

| Código | Significado | API | TR | Motor | Reacción |
|---|---|---|---|---|---|
| `USER_NOT_FOUND` | La cuenta no existe | 404 | | | Informar |
| `CANNOT_CHANGE_OWN_STATUS` | Un administrador no puede suspender su propia cuenta | 409 | | | Informar |
| `GAME_VERSION_NOT_FOUND` | La versión no existe | 404 | | | Informar |
| `ENGINE_NOT_REGISTERED` | No se puede activar una versión cuyo motor no está en el servidor | 409 | | | Informar |
| `GAME_VERSION_IS_CURRENT` | No se puede desactivar la versión vigente de un juego | 409 | | | Informar |
| `GAME_VERSION_NOT_ACTIVE` | No se puede elegir como vigente una versión que no está activa | 409 | | | Informar |

---

## 9. Cómo se traducen los códigos del motor

El motor emite cinco códigos. La plataforma decide cuáles llegan al cliente.

| Código del motor | Cuándo lo emite | Qué recibe el cliente |
|---|---|---|
| `INVALID_SETTINGS` | Al crear una sala con opciones que el juego no admite | El mismo código, por la API, con el motivo del juego si lo hay |
| `INVALID_ACTION` | Al enviar una jugada que las reglas no permiten | El mismo código, por tiempo real, con el motivo del juego si lo hay |
| `NOT_YOUR_TURN` | Al enviar una jugada desde un asiento que no puede jugar ahora | El mismo código, por tiempo real |
| `GAME_ALREADY_FINISHED` | Al enviar una jugada a un juego terminado | `INTERNAL_ERROR`. La plataforma ya comprueba antes que la partida esté en curso, así que este caso indica un defecto del servidor y se registra |
| `INVALID_GAME_STATE` | Al recuperar un estado guardado que el motor no reconoce | `INTERNAL_ERROR`. Se registra. Si no puede recuperarse, la partida se anula por fallo técnico (7.20) |

**Motivos propios de cada juego.** El `reason` que acompaña a `INVALID_ACTION` o a `INVALID_SETTINGS`, como `COLUMN_FULL` en Cuatro en raya, no forma parte de este catálogo. Cada juego documenta los suyos junto a su motor, con el mismo formato que los códigos. El cliente del juego los conoce; el resto de la aplicación trata uno desconocido como una jugada no permitida.

---

## 10. Ajustes hechos a los contratos

Al reunir los tres contratos aparecieron cinco puntos por ajustar. Se aceptaron el 2026-11-16 y están aplicados. El protocolo de tiempo real y el contrato del motor no cambiaron, salvo una frase en las notas del protocolo.

| ID | Ajuste | Contrato | Motivo |
|---|---|---|---|
| J1 | Añadir `ORIGIN_NOT_ALLOWED` para las peticiones rechazadas por su origen. Antes respondían `FORBIDDEN`, que queda solo para la falta de rol | API | Son dos situaciones distintas. Una es un usuario sin permiso; la otra es un fallo de configuración o un intento de ataque, y conviene poder distinguirla al primer vistazo |
| J2 | Añadir `ROUTE_NOT_FOUND`, `METHOD_NOT_ALLOWED` y `PAYLOAD_TOO_LARGE` para los fallos que no pertenecen a ninguna operación | API | El servidor ya tiene que responder algo en esos casos. Así responde con el mismo sobre y con un código de la lista cerrada |
| J3 | Declarar `error.code` como lista cerrada en el archivo OpenAPI, con los códigos de este catálogo, y describir `details` para los códigos que lo usan | API | Antes `code` era un texto libre con un ejemplo. Con la lista, las herramientas pueden comprobar que el cliente y el servidor usan los mismos códigos |
| J4 | Igualar la descripción de `MATCH_NOT_IN_PROGRESS` en la API ("ya terminó") con la del protocolo ("terminó o se anuló") | API | El mismo código debe describirse igual en los dos canales |
| J5 | Sustituir en las notas de la API y del protocolo la frase que llama provisionales a los códigos por un enlace a este catálogo | API y protocolo, solo notas | Dejan de ser provisionales |

---

## 11. Decisiones de diseño propias de este entregable

Estas decisiones no derivan de un ADR: se tomaron al escribir el catálogo. Fueron **aceptadas el 2026-11-16** por Fernando Hernandez Argueta.

| ID | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| E1 | **Un solo espacio de nombres para los tres canales**, sin prefijos | Códigos con prefijo por canal o por módulo, como `ROOMS.FULL` | El cliente maneja un solo diccionario de textos. Hoy siete códigos ya se comparten entre la API y el tiempo real |
| E2 | **`VALIDATION_ERROR` en la API e `INVALID_MESSAGE` en tiempo real siguen siendo dos códigos** | Unificarlos en uno | No son la misma situación. El primero suele ser un dato que el usuario escribió mal y puede corregir. El segundo solo ocurre si el cliente está mal programado |
| E3 | **Dos códigos del motor no llegan nunca al cliente** y se convierten en `INTERNAL_ERROR` (sección 9) | Enviarlos tal cual | Al cliente no le sirven: no puede hacer nada distinto con ellos, y revelan detalles internos |
| E4 | **Los motivos propios de cada juego quedan fuera del catálogo** | Registrar aquí los de todos los juegos | Añadir un juego no debe obligar a tocar el catálogo de la plataforma |
| E5 | **El catálogo dice qué hace el cliente con cada código**, con seis reacciones | Dejarlo a criterio del frontend | Da un comportamiento uniforme y deja claro qué errores merecen un texto propio y cuáles un aviso genérico |
| E6 | **No se oculta que una sala o una partida existe.** A quien no es miembro o participante se le responde con `403`, no con `404` | Responder `404` para no revelar su existencia | Las salas son públicas y los identificadores no se pueden adivinar. Un mensaje claro ayuda más que uno ambiguo |
| E7 | **Forma de `details`**, por código (tabla siguiente) | Dejarla libre | El cliente necesita saber qué campos puede leer |
| E8 | **Los cinco ajustes de la sección 10** | No tocar los contratos aceptados | Ver el motivo de cada uno |

### Datos adicionales por código (E7)

Solo estos códigos llevan datos adicionales. En la API van en `error.details`; en tiempo real, en el contenido de `COMMAND_REJECTED`.

| Código | Datos | Canal |
|---|---|---|
| `VALIDATION_ERROR` | `fields`: lista de `{ field, rule }`. `field` es el nombre del campo. `rule` es uno de `REQUIRED`, `INVALID_FORMAT`, `TOO_SHORT`, `TOO_LONG` u `OUT_OF_RANGE` | API |
| `UNSUPPORTED_ROOM_OPTIONS` | `option`: cuál no se admite, `mode`, `timeControl` o `maxPlayers` | API |
| `INVALID_SETTINGS` | `reason`: el motivo del juego, si lo hay | API |
| `MATCH_LIMIT_REACHED` | `mode` y `limit`: la modalidad y su máximo | API |
| `RATE_LIMITED` | Ninguno en el cuerpo. La espera va en la cabecera `Retry-After` | API |
| `STALE_STATE_VERSION` | `currentStateVersion`: la versión actual del estado | Tiempo real |
| `INVALID_ACTION` | `reason`: el motivo del juego, si lo hay | Tiempo real |

---

## 12. Cierres de la conexión de tiempo real

No son códigos de error del catálogo, pero el cliente también reacciona a ellos. Están definidos en el protocolo (decisión T14) y se repiten aquí para tener todo en un sitio.

| Código de cierre | Motivo | Reacción |
|---|---|---|
| 1008 | El cliente incumplió el protocolo de forma repetida | Defecto. No reconecta solo |
| 1009 | Envió un mensaje demasiado grande | Defecto. No reconecta solo |
| 1012 | El servidor se reinicia | Esperar. Reconecta con espera progresiva |
| 4001 | La sesión terminó: caducó, se cerró o la cuenta fue suspendida | Iniciar sesión |
| 4002 | Versión del protocolo no admitida | Informar. Pide recargar la aplicación |
| 4003 | Demasiadas conexiones abiertas para el mismo jugador | Informar. No reconecta solo |

Si el servidor rechaza la apertura de la conexión, por falta de sesión o por el origen, el navegador no informa del motivo. El cliente comprueba su sesión con `GET /me` antes de reintentar.

---

## 13. Fallos que no nacen de una petición

El vencimiento de un reloj, el plazo de abandono, el cierre de salas inactivas y la recuperación tras un reinicio los ejecuta el servidor por su cuenta. Si algo falla ahí, no hay a quién responder con un código: el fallo se registra y la operación se reintenta. Si una partida no puede recuperarse, se anula con el motivo `FAILURE` (7.20) y los jugadores lo ven en el estado de la partida, no como un error.

---

## 14. Asuntos abiertos

| Asunto | Estado |
|---|---|
| **Textos en español para cada código.** El catálogo define los códigos, no las frases que ve el usuario | Se escriben con el frontend, en el Hito 1 |
| **Una sola fuente para los códigos.** Hoy la lista vive en este documento y en los contratos | En el Hito 1 pasa al paquete de contratos (ADR-005), del que la leerán el backend y el frontend |
| **Códigos del registro de acciones de administración**, si llega a existir | Depende de un asunto abierto del modelo de datos |
