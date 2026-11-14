# ADR-011: Convenciones de nombres, identificadores y glosario

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-14 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | Hallazgos C-05, C-06, C-07, C-17, C-18 y C-21; vacíos G-03 y G-07 |
| **Relacionados** | ADR-009 (reglas de dominio), ADR-010 (persistencia de partida) |

## Contexto

La documentación inicial usaba varios nombres para una misma cosa y un mismo nombre para cosas distintas: el juego se identificaba de tres formas, "versión" tenía cuatro significados, "sesión" tres y una persona tenía tres nombres públicos. Este ADR fija los nombres y las convenciones para que en los contratos, los datos y el código cada cosa se llame de una sola manera. No añade funcionalidad. Son 20 convenciones en 5 bloques, más un glosario.

---

## 1. Convención general de idioma y formato

| ID | Convención |
|---|---|
| 9.1 | **Documentación en español; código en inglés.** Nombres de campos, tipos de mensaje, códigos de error, estados y nombres de tablas van en inglés, como ya hacen los contratos actuales. Los textos que ve el usuario van en español |
| 9.2 | Campos en `camelCase` en la API y en el protocolo; `snake_case` en la base de datos |
| 9.3 | Fechas como texto ISO 8601 en UTC en la API y el protocolo. Duraciones y relojes como enteros en milisegundos |
| 9.4 | Todos los identificadores internos son UUID generados por el servidor. Los identificadores de petición son UUID generados por el cliente. Los ejemplos de los contratos dejan de usar formas como `session_456` |

## 2. Juegos y versiones

| ID | Convención |
|---|---|
| 9.5 | **Un juego se identifica hacia fuera por un nombre corto estable** (`gameSlug`) y dentro de la base de datos por su UUID (`gameId`). La API, el protocolo y el motor usan el nombre corto. Las claves entre tablas usan el UUID |
| 9.6 | El nombre corto del primer juego es `four-in-a-row` y su nombre visible es "Cuatro en raya" |
| 9.7 | La versión de un juego es un texto con formato de versión semántica, por ejemplo `1.0.0`. El motor y la API usan ese texto; las claves entre tablas usan el UUID de la versión |
| 9.8 | Cada juego tiene **una versión vigente**. La sala no guarda versión: la partida toma la versión vigente en el momento de empezar y la conserva hasta terminar |
| 9.9 | El número mínimo y máximo de jugadores pertenece a la **versión** del juego, no al juego, porque depende de las reglas. El motor lo declara y la plataforma valida contra ello la capacidad de la sala |
| 9.10 | **Cuatro nombres distintos para las cuatro "versiones"**, y nunca la palabra sola: `apiVersion` (la de la ruta `/api/v1`), `protocolVersion` (la del protocolo de tiempo real), `gameVersion` (la de las reglas) y `stateVersion` (el contador de cambios de una partida) |

## 3. Personas

| ID | Convención |
|---|---|
| 9.11 | Se mantienen tres entidades con un papel cada una: **cuenta** (`users`: credenciales, estado y rol), **perfil** (`profiles`: cómo se presenta la persona) y **jugador** (`players`: la identidad que participa en salas y partidas) |
| 9.12 | **Dos nombres en lugar de tres.** `username`: único, sirve para iniciar sesión y como identificador público. `displayName`: el que se muestra, no único. Desaparece `players.nickname` |
| 9.13 | Salas, partidas, resultados y estadísticas hacen referencia siempre al **jugador**, nunca a la cuenta. La identidad se obtiene siguiendo la cadena sesión, cuenta, jugador |
| 9.14 | El jugador puede existir sin cuenta. En el MVP todos los jugadores tienen una, pero el modelo no lo exige, para no cerrar la puerta a los bots |
| 9.15 | Un solo campo de rol en la cuenta, con dos valores: `USER` y `ADMIN`. Sin tabla de permisos en el MVP |

## 4. Partidas y mensajes

| ID | Convención |
|---|---|
| 9.16 | **Hacia los clientes solo existe la partida** (`matchId`). La sesión de juego es un concepto interno del servidor y su identificador no aparece en la API ni en el protocolo |
| 9.17 | Los mensajes de sala llevan `roomId` y los de partida llevan `matchId`, ambos en el sobre |
| 9.18 | **Los mensajes del cliente son órdenes y se nombran en imperativo; los del servidor son notificaciones y se nombran como hechos ocurridos.** Ningún nombre se usa en las dos direcciones |
| 9.19 | Los asientos los asigna la plataforma al empezar la partida, al azar. En una revancha dentro de la misma sala se alternan. El motor recibe los asientos ya asignados y no interviene en el sorteo |

## 5. Estados en el código

| ID | Convención |
|---|---|
| 9.20 | Nombres en inglés para los estados de ADR-009. Sala: `WAITING`, `IN_MATCH`, `CLOSED`. Partida: `IN_PROGRESS`, `FINISHED`, `ABORTED`. Sesión de juego: `ACTIVE`, `CLOSED`. Modalidad: `REALTIME`, `TURN_BASED`. Motivo de fin: `COMPLETED`, `TIMEOUT`, `RESIGNATION`, `ABANDONMENT` |

---

## 6. Glosario

Un término, un significado. Las palabras de la columna "Evitar" no se usan solas en la documentación.

| Término | Significado | En el código | Evitar |
|---|---|---|---|
| Cuenta | Credenciales, estado y rol de una persona | `User` | |
| Perfil | Cómo se presenta la persona: nombre visible, avatar | `Profile` | |
| Jugador | La identidad que participa en salas y partidas | `Player` | |
| Sala | Lugar donde los jugadores se reúnen antes de jugar y para la revancha | `Room` | |
| Anfitrión | El jugador que creó la sala | `owner` | |
| Partida | Un juego disputado de principio a fin, con su resultado | `Match` | |
| Sesión de juego | El estado vivo de una partida en curso. Concepto interno del servidor | `GameSession` | "Sesión" a secas |
| Sesión de autenticación | La prueba de que una persona inició sesión | `AuthSession` | "Sesión" a secas |
| Conexión | Un WebSocket abierto. Una persona puede tener varias | `connection` | "Sesión" |
| Modalidad | Tiempo real o por turnos | `mode` | |
| Control de tiempo | La regla que gobierna los relojes de una partida | `timeControl` | |
| Reloj | El tiempo que le queda a un jugador | `clock` | |
| Jugada | Una acción de un jugador aceptada y guardada | `action` | "Evento" |
| Mensaje | Lo que viaja por el WebSocket. Es una orden o una notificación | `message` | "Evento" |
| Orden | Mensaje del cliente al servidor pidiendo algo | `command` | |
| Notificación | Mensaje del servidor al cliente informando de algo ocurrido | `notification` | |
| Evento de juego | Lo que el motor emite al aplicar una jugada. No se guarda | `GameEvent` | "Evento" a secas |
| Rendición | El jugador decide perder | `RESIGNATION` | |
| Abandono | El jugador pierde por pasar demasiado tiempo desconectado en tiempo real | `ABANDONMENT` | |
| Anulada | Partida cerrada sin resultado | `ABORTED` | "Abandonada" |
| Estadísticas | Contadores de partidas jugadas, ganadas, perdidas y empatadas | `statistics` | |
| Puntuación | Valor numérico de la fuerza de un jugador en un juego. Posterior al MVP | `rating` | "Ranking" |
| Clasificación | Lista ordenada de jugadores por puntuación. Posterior al MVP | `ranking` | "Rating" |

---

## 7. Alternativas consideradas en las convenciones principales

### 9.1. Idioma del código

| Opción | A favor | En contra |
|---|---|---|
| **Código en inglés, documentación y textos visibles en español** | Coincide con los contratos actuales y con todas las librerías elegidas. Evita mezclar idiomas dentro del código | Hay que mantener la correspondencia entre términos, que es lo que hace el glosario |
| Todo en español | Un solo vocabulario | Choca con el código de las librerías y con lo ya escrito en los contratos |

**Decisión:** código en inglés.

### 9.5. Cómo se identifica un juego

| Opción | A favor | En contra |
|---|---|---|
| **Nombre corto hacia fuera, UUID dentro** | Las rutas y los mensajes son legibles. El motor se registra con un nombre fijo que no depende de la base de datos | Dos identificadores para la misma cosa, que hay que nombrar distinto |
| Solo UUID | Un único identificador | El motor tendría que conocer un valor generado por la base de datos, distinto en cada entorno |
| Solo nombre corto, también como clave | Un único identificador y legible | Cambiar el nombre corto de un juego obligaría a actualizar todas las tablas que lo referencian |

**Decisión:** nombre corto hacia fuera y UUID dentro. Resuelve el hallazgo C-05.

### 9.12. Nombres de una persona

| Opción | A favor | En contra |
|---|---|---|
| **Dos nombres: uno único y uno visible** | Queda claro cuál se usa para identificar y cuál para mostrar. El nombre visible puede cambiarse sin romper nada | Dos personas pueden mostrarse con el mismo nombre visible; el único las distingue |
| Tres, como hoy | Ningún cambio | Nadie sabe cuál se muestra en una partida |
| Uno solo | Lo más simple | Obliga a que el nombre que se muestra sea único e inmutable, o a aceptar que cambie el identificador público |

**Decisión:** dos nombres. Resuelve el hallazgo C-21.

### 9.16. Qué identificador de partida ven los clientes

| Opción | A favor | En contra |
|---|---|---|
| **Solo la partida** | Un concepto menos para el frontend. Partida y sesión de juego son una a una, así que exponer ambas no aporta nada | Si algún día una partida tuviera varias sesiones habría que revisarlo. No está previsto |
| Partida y sesión, como hoy | Ningún cambio | El cliente debe manejar dos identificadores equivalentes y saber cuál va en cada mensaje |

**Decisión:** solo la partida. Simplifica el protocolo y cierra parte del hallazgo C-17.

### 9.18. Nombres de los mensajes

| Opción | A favor | En contra |
|---|---|---|
| **Órdenes en imperativo, notificaciones como hechos** | La dirección se lee en el nombre. Desaparece la ambigüedad de un mismo nombre usado como orden y como aviso | Hay que renombrar varios mensajes del contrato actual |
| Un campo que indique la dirección | Se conservan los nombres actuales | Sigue habiendo nombres con dos significados; es fácil equivocarse al leer un registro |

**Decisión:** órdenes en imperativo y notificaciones como hechos. La lista concreta de mensajes está en `contracts/02-realtime.md`.

---

## 8. Efecto sobre los documentos

Estas convenciones se aplican a todos los documentos de `contracts/` y a `docs/03-dominio-datos.md`.
