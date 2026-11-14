# Auditoría de consistencia arquitectónica y plan de cierre técnico

> **Documento histórico de análisis.** Refleja el estado de la documentación el 2026-11-13, antes de tomar las decisiones. Las secciones 1 a 8 no se han reescrito. Las decisiones vigentes están en [`docs/adr/`](../adr/README.md).

**Proyecto:** Plataforma de Juegos de Mesa Online
**Fecha de la auditoría:** 2026-11-13
**Tipo de trabajo:** solo lectura y análisis. No se generó código ni se modificó ningún documento, contrato o repositorio.

**Leyenda de estado** (se usa en todo el documento):

- **[APROBADA]** decisión vigente, respaldada por las instrucciones del proyecto.
- **[ACORDADA SIN ADR]** figura como "acordado conceptualmente" en la documentación, pero no tiene registro formal ni confirmación explícita en este proyecto.
- **[PENDIENTE]** sin decisión.
- **[RECOMENDACIÓN]** propuesta de quien hizo la auditoría; no tiene validez hasta su aprobación.

---

## Qué se decidió después

Todas las decisiones siguientes se tomaron el 2026-11-14, después de esta auditoría.

| Paso del plan | Asunto | Resultado | Registro |
|---|---|---|---|
| 0 | Línea base de acuerdos B1 a B12 | Ratificada, con B6 reescrito | [ADR-007](../adr/0007-linea-base.md) |
| 1 | D1. Backend | NestJS sobre Node.js y TypeScript | [ADR-001](../adr/0001-backend-nestjs.md) |
| 2 | D2. ORM | Drizzle | [ADR-002](../adr/0002-orm-drizzle.md). Análisis en [`comparacion-orm.md`](comparacion-orm.md), que sustituye el de la sección 6 |
| 3 | D3. Transporte de tiempo real | WebSocket nativo con protocolo propio | [ADR-003](../adr/0003-realtime-websocket-nativo.md). Análisis en [`comparacion-realtime.md`](comparacion-realtime.md), que sustituye el de la sección 6 |
| 4 | D4. Autenticación | Sesión de servidor con cookie | [ADR-004](../adr/0004-autenticacion-sesion-cookie.md). Análisis en [`comparacion-autenticacion.md`](comparacion-autenticacion.md), que sustituye el de la sección 6 |
| 5 | Despliegue y requisitos no funcionales | Organización del repositorio y renderizado del frontend, decididos. Alojamiento, **aplazado** hasta tener algo construido | [ADR-005](../adr/0005-organizacion-del-repositorio.md), [ADR-006](../adr/0006-renderizado-del-frontend.md), [`despliegue-y-requisitos.md`](despliegue-y-requisitos.md) |
| 6 | Alcance del MVP | Aprobado | [ADR-008](../adr/0008-alcance-del-mvp.md) |
| 7 | Reglas de dominio | Aprobadas, 30 reglas | [ADR-009](../adr/0009-reglas-de-dominio.md) |
| 8 | Persistencia de partida | Aprobada, 20 reglas | [ADR-010](../adr/0010-persistencia-de-partida.md) |
| 9 | Identificadores, versiones y glosario | Aprobados, 20 convenciones | [ADR-011](../adr/0011-convenciones-y-glosario.md) |
| 10 | Formalización de contratos | En curso: versión 1 del modelo de datos, del contrato del motor, del protocolo y de la API | `docs/03-dominio-datos.md` y `contracts/` |

Las secciones siguientes reflejan el estado en la fecha de la auditoría y no se han reescrito.

---

## 1. Resumen ejecutivo

1. La documentación es coherente en sus principios de fondo (monolito modular, servidor autoritativo, motor puro y desacoplado). No encontré ninguna contradicción que obligue a replantear la arquitectura.
2. Solo cuatro decisiones pueden considerarse **aprobadas** en sentido estricto. Otras doce están **acordadas conceptualmente** pero sin ADR, y dos de ellas tienen redacción ambigua (PostgreSQL aparece como "acordado" y como "propuesto" a la vez).
3. Hay **15 pendientes** ya registrados y detecté **10 vacíos adicionales** que no figuran en la lista, entre ellos uno que condiciona la primera decisión: el lenguaje y runtime del backend nunca se declara, aunque todos los contratos lo presuponen (TypeScript sobre Node.js).
4. Detecté **22 inconsistencias**: 5 de severidad alta, 13 media y 4 baja. Las altas son de alcance (ranking y administración dentro o fuera del MVP), de contrato (`/auth/refresh` presupone tokens; ingreso a sala duplicado en REST y WebSocket) y de identificadores (`gameId` como slug o como UUID).
5. El repositorio `Ferchoner/gameboard-coliseum-arena` contiene únicamente `LICENSE`. La documentación no está versionada y no existe ningún ADR.
6. Propongo cerrar la arquitectura en **11 pasos**, uno por decisión, comenzando por backend, ORM, WebSocket y autenticación como pediste. Mis recomendaciones preliminares para esos cuatro son: **NestJS sobre Node.js y TypeScript**, **Drizzle** (con Prisma como alternativa segura), **WebSocket nativo con protocolo propio** y **sesiones de servidor con cookie HttpOnly**. Ninguna está aprobada.

---

## 2. Fuentes revisadas

| Fuente | Contenido | Observación |
|---|---|---|
| Carpeta del proyecto `gameboard-coliseum-arena/` | `README.md`, 4 documentos en `docs/`, 3 contratos en `contracts/`, 2 documentos en `planning/` | Revisados completos. Es la referencia de esta auditoría. |
| Repositorio GitHub `Ferchoner/gameboard-coliseum-arena` | Solo `LICENSE`, un commit ("Initial commit"), rama `main`, sin PRs ni issues | La documentación no está en el repositorio. |
| Carpeta `uploads/` | Vacía | Sin documentos adicionales. |
| Instrucciones del proyecto | 10 reglas de trabajo | Usadas como criterio para clasificar lo aprobado. |

No existen: `prompts/CLAUDE-CODE.md`, `prompts/CLAUDE-WEB.md`, ADRs, diagramas C4 ni diagrama ER (ver C-20).

---

## 3. Estado de las decisiones

### 3.1 Aprobadas

Las considero aprobadas porque son reglas vigentes en las instrucciones del proyecto y la documentación las repite sin contradicción.

| # | Decisión | Respaldo |
|---|---|---|
| A1 | Monolito modular para el MVP; cambiarlo exige justificación técnica aprobada | Instrucciones, regla 3. `docs/01` § Principios. `planning/decisiones-y-pendientes.md` § Acordado |
| A2 | Modelo server-authoritative en partidas multijugador: el cliente envía intenciones, el servidor valida y aplica | Instrucciones, regla 4. `docs/01` § Principios. `docs/02` § Dependencias y límites |
| A3 | Separación entre plataforma, comunicación en tiempo real, gestión de sesiones y motores de juego | Instrucciones, regla 2. `docs/02` § Módulos backend y § Dependencias y límites |
| A4 | Proyecto independiente de otros desarrollos (no comparte repositorios, bases de datos ni servicios) | Instrucciones, Contexto. `README.md` § Advertencias |

### 3.2 Acordadas conceptualmente, sin ADR

Aparecen en `planning/decisiones-y-pendientes.md` § "Acordado conceptualmente" o como principios en `docs/`. Por la regla 7 no las trato como aprobadas hasta que las ratifiques. Propongo ratificarlas en bloque en el Paso 0.

| # | Acuerdo | Fuente | Nota |
|---|---|---|---|
| B1 | API REST más canal realtime por WebSocket | decisiones § Acordado; `docs/02` | El reparto de responsabilidades entre ambos tiene un solapamiento (C-04) |
| B2 | Motor desacoplado de red, UI y persistencia | decisiones § Acordado; `docs/02` § Dependencias; cabecera de `contracts/03` | Consistente en todos los documentos |
| B3 | Juegos registrados por ID y versión | decisiones § Acordado; `docs/02` § Dependencias | El significado de "ID" no es uniforme (C-05, C-06) |
| B4 | Room, Match y GameSession son conceptos distintos | decisiones § Acordado; `docs/03` | Consistente |
| B5 | PostgreSQL como almacenamiento persistente | decisiones § Acordado; `docs/04` § Persistencia propuesta | **Redacción ambigua**: figura bajo "Acordado" pero con la palabra "propuesto" (C-22) |
| B6 | Estado activo en memoria de proceso y snapshots transaccionales | decisiones § Acordado; `docs/04` | Implica una sola instancia en el MVP |
| B7 | Redis opcional, no dependencia inicial | decisiones § Acordado; `docs/04` | Consistente |
| B8 | Connect Four como primer vertical slice, multijugador por turnos de dos personas | decisiones § Acordado; `docs/01` § Objetivo; `docs/04` | Ver nota de marca en el Paso 6 |
| B9 | Frontend Nuxt, Vue y TypeScript; Phaser opcional según el juego | decisiones § Acordado; `docs/01` § Frontend | Redactado como "opción preferida", no como decisión (C-22) |
| B10 | Backend/API primero; el frontend consume contratos | `docs/01` § Principios | Consistente con el backlog |
| B11 | La identidad del jugador se deriva de la autenticación, nunca de un `playerId` enviado por el cliente | `docs/02` § Dependencias; `contracts/02` § Seguridad; `docs/04` § Jugada confirmada | Consistente en los tres documentos |
| B12 | Snapshot por jugada confirmada; log de eventos opcional; event sourcing no aprobado | decisiones § Inconsistencias (5); `docs/04` § Precauciones | El modelo de datos no lo refleja todavía (C-08, C-10) |

### 3.3 Pendientes

**Ya registrados** en `planning/decisiones-y-pendientes.md` § "Pendientes de decisión formal". Indico en qué paso del plan se cierra cada uno.

| # | Pendiente | Paso |
|---|---|---|
| P1 | Framework backend | 1 |
| P2 | ORM o query builder | 2 |
| P3 | Autenticación (cookies/sesiones o tokens, CSRF, rotación, WebSocket) | 4 |
| P4 | Transporte realtime y semántica de ACK y reconexión | 3 (transporte) y 10 (semántica) |
| P5 | Modelo de despliegue inicial | 5 |
| P6 | Reutilización de Room y rematches | 7 |
| P7 | Estados y permisos exactos de salas, partidas y sesiones | 7 y 10 |
| P8 | Eventos persistidos, retención y replay | 8 |
| P9 | Timeout, abandono, desconexión y recuperación | 7 |
| P10 | Ranking: si entra al MVP y con qué algoritmo | 6 |
| P11 | Bots y juego solitario | 6 |
| P12 | Licencias, derechos de arte y juegos distribuibles | 6 |
| P13 | Seguridad de acciones, rate limits, trampas, información oculta | 10 |
| P14 | Consistencia de proyecciones estadísticas bajo reintentos | 8 |
| P15 | Requisitos no funcionales medibles | 5 |

**Vacíos detectados en esta auditoría** (no figuran en la lista anterior).

| # | Vacío | Dónde se nota | Paso |
|---|---|---|---|
| G-01 | Lenguaje y runtime del backend sin declarar. `contracts/03-game-engine.ts` y los candidatos (NestJS, Fastify, Prisma, Drizzle, TypeORM) presuponen TypeScript sobre Node.js | `contracts/03`; decisiones § Pendientes 1 y 2 | 1 |
| G-02 | Verificación de email, recuperación de contraseña y política de contraseñas. `users.password_hash` asume credenciales locales pero no hay endpoints ni flujo | `docs/03` tabla `users`; `contracts/01` | 4 y 6 |
| G-03 | Modelo de roles y permisos. No hay campo de rol en `users` ni tabla de permisos | `docs/03`; `docs/02` módulo `admin` | 6 y 10 |
| G-04 | Catálogo de errores unificado entre REST, realtime y motor. Faltan códigos para versión de estado obsoleta, petición duplicada y error de validación | `contracts/01` § Respuestas; `contracts/02` § Errores iniciales; `contracts/03` (`code: string`) | 10 |
| G-05 | Presencia frente a membresía: qué ocurre si un miembro pierde la conexión WebSocket sin llamar a "salir" | `docs/02`; `contracts/02` | 7 |
| G-06 | Aleatoriedad: `seed` es opcional en `getInitialState` y no hay dónde persistirla; no se define el azar posterior al estado inicial | `contracts/03`; `docs/03` tabla `game_sessions` | 10 |
| G-07 | Capacidad: `games.min_players/max_players`, `rooms.max_players` y `maxPlayers` enviado por el cliente, sin regla de validación ni decisión sobre si pertenece al juego o a la versión | `docs/03`; `contracts/01` § Ejemplo crear sala | 9 |
| G-08 | Las decisiones de stack se van a tomar sin requisitos no funcionales cuantificados (P15) | decisiones § Pendientes 15 | 1 y 5 |
| G-09 | Organización del repositorio: monorepo o no, cómo se comparten tipos entre backend y frontend, gestor de paquetes, framework de pruebas | `docs/02` § Estructura orientativa | 1 y 5 |
| G-10 | Trigger del inicio de partida y validación de `settings` por juego (detallados en C-13 y C-15) | `docs/04`; `contracts/03` | 7 y 10 |

### 3.4 Seguimiento de las "inconsistencias a normalizar" ya registradas

`planning/decisiones-y-pendientes.md` lista cinco inconsistencias heredadas. Su estado real frente a los contratos actuales es:

| # | Inconsistencia registrada | Estado real |
|---|---|---|
| 1 | `playerId` en mensajes entrantes | **Resuelta en el contrato.** El sobre de `contracts/02` ya no lo incluye y lo prohíbe de forma explícita. Falta solo cerrar la nota. |
| 2 | `version` y `gameVersion` con significados distintos | **Abierta.** `contracts/02` sigue usando `version: 1` sin calificar (C-07). |
| 3 | `GameState` muestra datos internos completos | **Resuelta en el contrato del motor** con `getPlayerView`. Falta definir el payload de `GAME_STATE_UPDATED` (C-16). |
| 4 | El motor incluye `initialize/getState` | **Obsoleta.** `contracts/03` ya no tiene esos métodos (C-14). |
| 5 | Persistir cada jugada frente a eventos selectivos | **Resuelta en el texto, no en el modelo** (C-08, C-10). |

---

## 4. Contradicciones e inconsistencias

Severidad: **Alta** bloquea un contrato o una de las cuatro primeras decisiones. **Media** debe resolverse antes de cerrar el Hito 0. **Baja** es editorial.

### Severidad alta

| ID | Hallazgo | Referencias |
|---|---|---|
| C-01 | **Ranking y estadísticas: dentro o fuera del MVP.** El alcance los sitúa después del MVP y la decisión sigue abierta, pero el contrato REST, el modelo de datos, la lista de módulos y el flujo del vertical slice ya los incluyen. El backlog no tiene ninguna tarea para ellos. | Fuera: `docs/01` § Posterior al MVP; decisiones § Pendientes 10. Dentro: `contracts/01` (`/players/me/statistics`, `/players/me/rankings`, `/games/:gameId/ranking`); `docs/03` (`game_statistics`, `game_ratings`); `docs/02` (módulos `statistics`, `rankings`); `docs/04` paso 12 |
| C-02 | **Administración: declarada en el MVP y ausente en todo lo demás.** El MVP incluye "administración básica" y existe un módulo `admin`, pero no hay endpoints, roles, permisos ni tarea de backlog. | Dentro: `docs/01` § MVP propuesto; `docs/02` § Módulos y línea "REST: ... administración". Ausente: `contracts/01`; `docs/03`; `planning/backlog-mvp.md` |
| C-03 | **`/auth/refresh` presupone una decisión pendiente.** El endpoint solo tiene sentido con tokens de acceso y refresco, pero el mecanismo está sin decidir. El modelo de datos tampoco tiene tablas para sesiones ni tokens. | `contracts/01` tabla de endpoints frente a § Seguridad; decisiones § Pendientes 3; `docs/03` |
| C-04 | **Ingreso y salida de sala duplicados.** REST define `POST /rooms/:roomId/join` y `/leave`; realtime define `JOIN_ROOM` y `LEAVE_ROOM`. La arquitectura asigna "ingreso/salida" a REST y "suscripciones" a WebSocket, de modo que no queda claro si el mensaje realtime es membresía o suscripción. | `contracts/01`; `contracts/02` § Eventos; `docs/02` líneas REST y WebSocket; `docs/04` paso 5 |
| C-05 | **`gameId` significa cosas distintas.** En la API es un slug (`"gameId":"connect-four"`), en la base de datos es un UUID con `slug` aparte, y en el motor es un `string` usado como clave del registro. | `contracts/01` § Ejemplo crear sala y ruta `/games/:gameId`; `docs/03` tabla `games` y § Convenciones ("UUID para IDs"); `contracts/03` (`GameId`); `docs/02` § Dependencias |

### Severidad media

| ID | Hallazgo | Referencias |
|---|---|---|
| C-06 | **Versión del juego: quién la fija y cuándo.** `matches` tiene `game_version_id` pero `rooms` no, y el ejemplo de creación de sala no envía versión. El flujo habla de "versión fija del juego" al iniciar sin decir cómo se elige. En el motor la versión es un `string`; en la base de datos es un UUID. | `docs/03` tablas `rooms`, `matches`, `game_versions`; `docs/04` paso 7; `contracts/01` § Ejemplo; `contracts/03` (`GameVersion`) |
| C-07 | **Cuatro conceptos llamados "versión".** Versión de API (`/api/v1`), de protocolo (`version: 1`), de juego (`gameVersion`, `game_versions.version`) y de estado (`state_version`, `stateVersion`). La normalización pedida sigue abierta. | `contracts/01`; `contracts/02` § Sobre común; `docs/03` § Convenciones; decisiones § Inconsistencias (2) |
| C-08 | **`game_events` existe en el modelo aunque el log de eventos es opcional.** La tabla está definida con su restricción única mientras la decisión sobre eventos persistidos sigue pendiente y el event sourcing no está aprobado. | `docs/03` tabla `game_events`; `docs/04` § Precauciones; decisiones § Pendientes 8 y § Inconsistencias (5) |
| C-09 | **La idempotencia no tiene soporte en el modelo de datos.** Se exige deduplicar por `(sessionId, playerId, requestId)` y conservar el resultado de las acciones confirmadas, y además restaurar tras un reinicio, pero ninguna tabla guarda `requestId`. Tampoco está definida su expiración. | `docs/04` § Jugada confirmada; `planning/backlog-mvp.md` § Criterios de aceptación; `docs/03`; `contracts/02` § Semántica a fijar |
| C-10 | **Un snapshot o un historial de snapshots.** Se habla de "snapshot por jugada confirmada" y de "retención de snapshots", pero el modelo solo tiene un campo `game_sessions.state` que se sobrescribe. | `docs/04` paso 11 y § Persistencia propuesta; `docs/03` tabla `game_sessions` y § Reglas de integridad |
| C-11 | **Eventos de pausa para un estado opcional.** El protocolo define `MATCH_PAUSED` y `MATCH_RESUMED`; el dominio marca `PAUSED` como opcional. | `contracts/02` § Eventos; `docs/03` § Estados orientativos |
| C-12 | **Resultados que no nacen del motor.** `GameResult.status` solo admite `'FINISHED'`, pero un Match puede terminar `ABORTED` por abandono o timeout, que gestiona la capa de aplicación. No está definido quién construye ese resultado ni el dominio de `match_results.status`. Además `outcome: 'OTHER'` no tiene significado y `winnerPlayerIds` duplica lo que ya dice `players[].outcome`. | `contracts/03` (`GameResult`); `docs/03` § Estados y tablas `match_results`, `player_results`; decisiones § Pendientes 9 |
| C-13 | **No está definido qué dispara el inicio de la partida.** Existe el estado `READY` de sala y un "inicio atómico", pero ningún comando de inicio en REST ni en realtime, y no se dice si arranca sola cuando todos están listos o si la inicia el anfitrión (`room_players.role` sugiere lo segundo). | `docs/04` pasos 6 y 7; `docs/03` § Estados; `contracts/02` § Eventos |
| C-14 | **Nota obsoleta sobre el motor.** La lista de inconsistencias dice que la interfaz incluye `initialize/getState`; el contrato vigente ya usa `getInitialState` y funciones puras. Hay que confirmar el estilo puro y retirar la nota. | decisiones § Inconsistencias (4) frente a `contracts/03` |
| C-15 | **Redundancias en el contrato del motor.** `validateAction` y `applyAction` devuelven el mismo fallo con formas distintas; `isFinished` y `getResult` repiten lo que ya trae `ApplyResult.result`; el motor recibe `PlayerId[]` sin asientos aunque `match_players` tiene `seat` y `team`; `settings` es `unknown` y nadie lo valida. | `contracts/03`; `docs/03` tabla `match_players` |
| C-16 | **Mensajes realtime redundantes o sin dirección.** `GAME_FINISHED` frente a `MATCH_FINISHED`; `TURN_CHANGED` frente a `GAME_STATE_UPDATED`; `PLAYER_READY` como comando y como notificación (ya señalado por el propio contrato); `CONNECT` y `AUTHENTICATE` mezclan transporte y aplicación. El sobre lleva `sessionId` pero los mensajes de sala necesitan `roomId`, y no incluye `stateVersion`. | `contracts/02` § Sobre común, § Eventos y § Semántica a fijar |
| C-21 | **Tres nombres públicos y un módulo sin endpoints.** `users.username`, `profiles.display_name` y `players.nickname` coexisten sin regla sobre cuál se muestra. Existe el módulo `profiles` pero ningún endpoint de perfil, y `/players/me` se describe como "Perfil jugador". Además `players.user_id` único impediría modelar bots (P11). | `docs/03` tablas `users`, `profiles`, `players`; `docs/02` § Módulos; `contracts/01` |
| C-22 | **Redacción ambigua de dos acuerdos.** PostgreSQL figura bajo "Acordado" con la palabra "propuesto" y como "Persistencia propuesta". Nuxt figura como "opción preferida". Conviene dejar ambos como decisión o como propuesta, no las dos cosas. | decisiones § Acordado; `docs/04` § Persistencia propuesta; `docs/01` § Frontend |

### Severidad baja

| ID | Hallazgo | Referencias |
|---|---|---|
| C-17 | **Términos con varios significados.** "Sesión" designa la sesión de autenticación, la GameSession y a veces la conexión. "Evento" designa mensajes WebSocket, eventos del motor y filas de `game_events`. "Ranking" y "rating" se usan como sinónimos. | `docs/02`; `docs/04`; `contracts/01`; `contracts/02`; `contracts/03` |
| C-18 | **Formato de identificadores en los ejemplos.** `session_456` y `req_002` no siguen la convención UUID. | `contracts/02` § Sobre común frente a `docs/03` § Convenciones |
| C-19 | **El diagrama dibuja la persistencia debajo del motor.** Visualmente sugiere que el motor depende de PostgreSQL, lo que contradice la regla de que no importa ORM ni repositorios. | `docs/02` diagrama frente a § Dependencias y límites |
| C-20 | **Referencias a material inexistente.** El README remite a `prompts/CLAUDE-CODE.md` y `prompts/CLAUDE-WEB.md`; el backlog pide "diagramas C4 y ER revisados" que no existen; la documentación no está en el repositorio. | `README.md` § Orden de lectura y § Uso rápido; `planning/backlog-mvp.md` Hito 0 |

---

## 5. Plan incremental de cierre

**Mecánica de cada paso.** Presento opciones, ventajas, desventajas y recomendación. Tú validas o corriges. Con la decisión tomada redacto el borrador de ADR. Solo con tu autorización explícita se escribe el ADR en el repositorio o se toca un contrato. No avanzo al paso siguiente sin tu validación.

| Paso | Decisión | Depende de | Cierra | Entregable |
|---|---|---|---|---|
| 0 | Ratificar la línea base (B1 a B12), formato y ubicación de ADRs, y versionar la documentación en el repositorio | Nada | C-20, C-22 | Lista ratificada; convención de ADR |
| 1 | **Backend: lenguaje, runtime y framework** | Supuestos de escala | P1, G-01, parte de G-09 | ADR-001 |
| 2 | **ORM o query builder y migraciones** | Paso 1 | P2 | ADR-002 |
| 3 | **Transporte realtime** | Paso 1 | P4 (transporte) | ADR-003 |
| 4 | **Autenticación y sesión, incluida la del WebSocket** | Pasos 1 y 3 | P3, C-03, parte de G-02 | ADR-004 |
| 5 | Despliegue inicial y requisitos no funcionales mínimos | Pasos 1 a 4 | P5, P15, G-08, G-09 | ADR-005 |
| 6 | Alcance exacto del MVP: ranking, administración, bots y solitario, email, licencias | Nada técnico | P10, P11, P12, C-01, C-02, G-02, G-03 | ADR-006; alcance actualizado |
| 7 | Semántica de dominio: máquinas de estados, inicio de partida, reutilización de sala, timeout, abandono y reconexión | Paso 6 | P6, P7, P9, C-11, C-12, C-13, G-05 | ADR-007; diagramas de estados |
| 8 | Persistencia de partida: snapshots, eventos, idempotencia, retención y proyecciones | Pasos 2 y 7 | P8, P14, C-08, C-09, C-10 | ADR-008 |
| 9 | Normalización de identificadores, versiones y glosario | Pasos 6 a 8 | C-05, C-06, C-07, C-17, C-18, C-21, G-07 | Glosario; convención de nombres |
| 10 | Formalización de contratos: GameEngine v1, protocolo realtime v1, OpenAPI v1, catálogo de errores, matriz de permisos, diagrama ER | Todos los anteriores | P13, C-04, C-14, C-15, C-16, C-19, G-04, G-06, G-10 | Contratos v1 para tu aprobación |
| 11 | Revisión de cierre del Hito 0 y solicitud de autorización para implementar | Paso 10 | Hito 0 completo | Lista de verificación de coherencia |

**Sobre el orden.** Lo habitual es fijar los requisitos no funcionales antes de elegir stack. Respeto el orden que pediste porque, a la escala de un MVP en una sola instancia, cualquiera de las candidatas es suficiente. Para que las cuatro primeras decisiones no queden en el aire, las evalúo con estos **supuestos de trabajo**, que te pido corregir si no encajan:

- Una sola instancia de backend durante el MVP (consecuencia directa de B6).
- Clientes únicamente en navegador (`docs/01` § No objetivos: sin aplicaciones nativas).
- Escala inicial del orden de cientos de conexiones simultáneas, no decenas de miles.
- Equipo pequeño, con experiencia previa en Nuxt, Vue y TypeScript (`docs/01` § Frontend).
- Frontend y API servidos bajo el mismo sitio (mismo dominio registrable).

---

## 6. Las cuatro primeras decisiones: opciones y recomendación

**Criterios de evaluación**, derivados de las reglas del proyecto: encaje con el monolito modular y la separación de responsabilidades (reglas 2 y 3), que el motor permanezca sin dependencias de infraestructura (A2, B2), facilidad de pruebas automatizadas (regla 8), mínimo de dependencias nuevas (regla 5), extensibilidad a varios juegos (regla 8) y coste de reversión si la elección resulta equivocada.

Antes de redactar cada ADR verificaré la versión estable y el estado de mantenimiento actuales de cada candidata. Las valoraciones de abajo son de arquitectura, no de versión.

### D1. Backend: lenguaje, runtime y framework

**Decisión previa implícita.** Todo el paquete presupone TypeScript sobre Node.js (G-01). Lo considero razonable: comparte lenguaje con el frontend, permite compartir tipos de contrato y mantiene el motor como TypeScript puro. Conviene declararlo de forma explícita en el ADR.

| Opción | Ventajas | Desventajas |
|---|---|---|
| **A. NestJS** | Sus módulos se corresponden uno a uno con la lista de `docs/02`. La inyección de dependencias hace explícitos los límites entre módulos y simplifica las pruebas. Trae gateways WebSocket, guards de autorización comunes a HTTP y WebSocket, validación y generación de OpenAPI. Convenciones fuertes y muy documentadas, lo que reduce la deriva de estilo. | Más código ceremonial. Decoradores y curva de aprendizaje. Riesgo de que el framework se filtre al dominio si no se vigila. Más pesado de lo que el MVP necesita en tiempo de ejecución. |
| **B. Fastify directo** | Ligero y rápido. Orientado a esquemas, con buena generación de OpenAPI. Menos abstracciones y menos "magia". | La estructura modular, la inyección de dependencias y las convenciones hay que diseñarlas y mantenerlas a mano. La separación entre módulos depende solo de la disciplina. El soporte WebSocket es una capa fina y exige más código propio. |
| **C. Otro** (AdonisJS, Hono, Express) | AdonisJS es cohesivo y trae ORM, autenticación y sesiones integrados. Hono y Express son mínimos. | AdonisJS acopla la elección de ORM y tiene un ecosistema menor. Hono y Express comparten las desventajas de B con menos soporte de esquemas. |

**[RECOMENDACIÓN] Opción A, NestJS sobre Node.js LTS y TypeScript.** Es la que mejor sostiene las reglas 2, 3 y 8 con menos decisiones propias que mantener. Condición que propongo dejar escrita en el ADR: el módulo `game-engine` no importa nada de NestJS, de modo que el motor siga siendo TypeScript puro y portable. La elección del adaptador HTTP interno (Express o Fastify) quedaría como subdecisión reversible; propongo empezar con el adaptador por defecto.

**Coste de reversión:** medio. Si el dominio y el motor se mantienen libres del framework, migrar afectaría a controladores, gateways y cableado, no a las reglas de negocio.

### D2. ORM o query builder

**Lo que exige la documentación:** PostgreSQL, JSONB para `state` y `settings`, transacciones (creación atómica de Match, MatchPlayers y GameSession; snapshot más resultado), bloqueo optimista por `state_version`, control de capacidad de sala bajo concurrencia, restricciones únicas compuestas y migraciones versionadas.

| Opción | Ventajas | Desventajas |
|---|---|---|
| **A. Drizzle** | Esquema definido en TypeScript, sin paso de generación. Consultas cercanas a SQL con control directo de `UPDATE ... WHERE state_version = n`, `RETURNING` y bloqueos de fila. JSONB tipado. Capa fina y fácil de aislar tras repositorios. | Más joven y con API menos estable históricamente. Menos convenciones. Herramienta de migraciones menos madura que la de Prisma. Exige más soltura con SQL. |
| **B. Prisma** | Experiencia de desarrollo muy buena. Esquema único como fuente de verdad. Migraciones maduras. Comunidad amplia e integración conocida con NestJS. | Lenguaje de esquema propio y cliente generado. Menos control del SQL: los bloqueos de fila requieren consultas en crudo. Tipado débil de JSONB. |
| **C. TypeORM** | Integración clásica con NestJS. Bloqueo optimista incorporado. | Tipado más débil, mantenimiento irregular y comportamientos sorprendentes. No lo recomiendo para un proyecto nuevo. |
| **D. Otro** (MikroORM, Kysely) | MikroORM encaja bien con diseño orientado a dominio y trae bloqueo optimista. Kysely es un query builder tipado muy sólido. | MikroORM tiene comunidad menor. Kysely no incluye una solución de esquema y migraciones tan completa. |

**[RECOMENDACIÓN] Opción A, Drizzle, con Prisma como alternativa segura.** La ruta crítica del sistema es una transacción pequeña con bloqueo optimista y snapshot JSONB, y ahí el control directo del SQL pesa más que la comodidad. Es la decisión con menor distancia entre las dos primeras opciones: si prefieres priorizar madurez de migraciones y comodidad sobre control, Prisma es igual de defendible. En ambos casos el ORM queda detrás de repositorios por módulo y nunca llega al motor.

**Coste de reversión:** medio-bajo si se respeta el patrón de repositorios.

### D3. Transporte realtime

**Punto de partida:** `contracts/02` ya define un sobre propio (`type`, `version`, `requestId`, `payload`) y exige semántica de aplicación para deduplicación, orden por `stateVersion` y resincronización.

| Opción | Ventajas | Desventajas |
|---|---|---|
| **A. WebSocket nativo con protocolo propio** | Encaja directamente con el sobre ya definido. Protocolo estándar: sirve el cliente nativo del navegador y cualquier cliente futuro (bots, herramientas de prueba). Sin dependencia de un protocolo de terceros. Control total sobre ACK, deduplicación y resincronización, que de todos modos hay que definir. | Hay que implementar heartbeats, reconexión con espera progresiva en el cliente y el registro de suscripciones. Sin transporte alternativo si un proxy bloquea WebSocket (hoy poco frecuente). |
| **B. Socket.IO** | Trae reconexión, heartbeats, salas, acuses de recibo y transporte alternativo por HTTP. Adaptador para Redis si algún día hay varias instancias. Es el gateway por defecto de NestJS. | Protocolo propio sobre WebSocket que obliga a usar su cliente. Sus acuses y sus salas se solapan con el sobre y la semántica del contrato, lo que deja dos capas con la misma responsabilidad. Su recuperación de conexión no sustituye la resincronización por `stateVersion`. Más peso. |
| **C. Otro** (SSE más REST, Colyseus, uWebSockets.js) | SSE más REST usa solo HTTP. Colyseus trae salas y sincronización de estado. uWebSockets.js da el máximo rendimiento. | SSE separa el canal en dos. Colyseus impone su propio modelo de sala y estado, que choca con Room, Match, GameSession y el contrato del motor. uWebSockets.js es innecesario a esta escala. |

**[RECOMENDACIÓN] Opción A, WebSocket nativo con el protocolo de `contracts/02`.** La documentación ya obliga a definir a nivel de aplicación casi todo lo que Socket.IO aportaría, así que añadirlo duplicaría responsabilidades. El módulo `realtime` queda como un gateway fino que autentica, enruta y difunde. Para una evolución a varias instancias bastaría una interfaz de difusión con Redis detrás, coherente con B7.

**Coste de reversión:** bajo, siempre que los handlers deleguen en servicios de aplicación como ya exige `docs/02`.

### D4. Autenticación

**Contexto:** clientes solo en navegador, REST más WebSocket en el mismo backend, sin aplicaciones nativas en el horizonte inmediato.

| Opción | Ventajas | Desventajas |
|---|---|---|
| **A. Sesión de servidor con identificador opaco en cookie HttpOnly, Secure y SameSite** (sesiones guardadas en PostgreSQL) | Revocación inmediata al cerrar sesión o suspender una cuenta. Ningún token accesible desde JavaScript. Modelo simple, sin ciclo de refresco. El navegador envía la cookie en el handshake del WebSocket, de modo que la conexión se autentica sin token en la URL ni mensaje adicional. | Requiere protección CSRF en REST y validación de `Origin` en el handshake WebSocket. Frontend y API deben estar bajo el mismo sitio. Una consulta de sesión por petición (despreciable a esta escala). Menos cómodo si más adelante hay clientes nativos o de terceros. |
| **B. JWT de acceso de vida corta más refresh token rotatorio en cookie HttpOnly** | Verificación sin estado. Estándar y cómodo para clientes nativos o varios servicios. | La revocación exige listas de bloqueo o vidas muy cortas. La rotación con detección de reutilización añade estado y complejidad. Los navegadores no permiten cabeceras de autorización en WebSocket, lo que obliga a pasar el token por URL o por un primer mensaje. El token puede caducar durante una conexión larga. |
| **C. Identidad delegada** (OAuth/OIDC con un proveedor externo o servicio gestionado) | Sin almacenamiento de contraseñas. Login social y MFA disponibles. | Dependencia y posible coste externos. Sigue haciendo falta una sesión local y resolver el WebSocket. El modelo de datos actual asume `password_hash`. Excesivo para el MVP. |

**[RECOMENDACIÓN] Opción A, sesiones de servidor con cookie.** Para un monolito con clientes web es la opción más simple y la más fácil de asegurar, y resuelve de paso la autenticación del WebSocket, que es el punto más delicado de la opción B. La opción C podría añadirse después como método de acceso adicional sin cambiar el modelo de sesión.

**Consecuencias sobre los contratos si la apruebas** (no las aplico sin tu autorización): `/auth/refresh` desaparecería (cierra C-03); se añadiría una tabla de sesiones de autenticación; habría que fijar la política CSRF; y el mensaje `AUTHENTICATE` del protocolo realtime dejaría de ser necesario. Quedaría por decidir en el Paso 6 si la verificación de email y la recuperación de contraseña entran en el MVP, porque implican envío de correo.

**Coste de reversión:** medio. Añadir tokens más adelante para otros clientes es posible sin retirar las sesiones.

---

## 7. Nota adelantada para el Paso 6

"Connect Four" es una marca registrada de un fabricante de juguetes, mientras que la mecánica de alinear cuatro fichas es genérica. Sugiero revisar, dentro del pendiente P12, si el nombre público del juego debería ser genérico ("Cuatro en raya"). No es asesoría legal; lo señalo para que no quede fuera del análisis de licencias.

---

## 8. Siguiente paso

Validar la primera decisión (D1) y, si te parece, ratificar o corregir la línea base de la sección 3.2 y los supuestos de trabajo de la sección 5. Con D1 validada preparo el borrador de ADR-001 y paso a D2.

---

## 9. Requisito nuevo recibido el 2026-11-14: partidas por turnos con plazo largo

**Origen:** mensaje de Fernando en el hilo del proyecto. No figuraba en la documentación.
**Enunciado inicial:** además del juego en vivo, las salas admitirán una modalidad por turnos con tiempos de entre 5 y 24 horas. Ver las aclaraciones posteriores, que lo precisan.
**Estado:** requisito declarado por el usuario. Su entrada en el MVP y sus reglas concretas están [PENDIENTE].

**Lectura inicial**, corregida más abajo por el usuario: las dos modalidades conviven; los jugadores no necesitan estar conectados a la vez. El plazo resultó ser un tiempo total por jugador y no un plazo por jugada.

### Aclaración del usuario (2026-11-14, segundo mensaje)

Habrá **dos tipos de partida**: por turnos, que "pueden demorar unas pocas horas o casi medio día", y en tiempo real. No todas las partidas tendrán la misma modalidad. Esto confirma la lectura anterior de que ambas conviven.

**Consecuencia de diseño [RECOMENDACIÓN]:** la modalidad es una propiedad de cada partida, fijada al crear la sala, y no de la plataforma ni del juego. Ningún módulo debe suponer que los jugadores están conectados a la vez, ni lo contrario.

**Ambigüedad resuelta por el usuario (2026-11-14, tercer mensaje):** el límite **no es por jugada**. Cada jugador tiene un **tiempo total para todas sus jugadas**, al estilo del reloj de ajedrez.

| Modalidad | Tiempo total por jugador | Estado |
|---|---|---|
| Tiempo real | Como máximo 30 minutos | Declarado por el usuario |
| Por turnos | 12, 24 o 36 horas | Declarado como tentativo |

El usuario añadió que en algunos juegos el funcionamiento del tiempo podrá ser distinto.

**Qué implica [RECOMENDACIÓN], a validar en el Paso 7:**

1. **Un solo mecanismo de reloj para las dos modalidades.** La diferencia entre tiempo real y por turnos pasa a ser de magnitud (minutos frente a horas) y de expectativas de presencia y aviso, no de arquitectura.
2. **El reloj lo lleva el servidor.** Se guarda el tiempo restante de cada jugador y el instante en que empezó el turno en curso. De ahí se deduce la fecha límite. La marca de tiempo del cliente sigue siendo solo informativa, como ya indica `contracts/02` § Seguridad.
3. **El reloj vive en la capa de sesión, no en el motor.** El motor sigue siendo puro y determinista y solo indica a quién le toca. El vencimiento lo detecta la aplicación, que construye el resultado por tiempo agotado (hallazgo C-12).
4. **El control de tiempo es una política intercambiable**, elegida por partida entre las que admita cada juego. Así se cubre que algunos juegos funcionen de otra manera sin tocar el resto.
5. **Precisión distinta según la magnitud.** Con 30 minutos el vencimiento debe detectarse con precisión de segundos; con horas basta una comprobación periódica. En ambos casos la fecha límite guardada es la fuente de verdad.
6. **Una partida por turnos de dos jugadores dura como máximo unas 72 horas** con el valor de 36 horas. Sigue atravesando reinicios y despliegues, así que R-1, R-2 y R-5 se mantienen, pero el horizonte es de días y no de semanas.
7. **La vista del jugador debe incluir los relojes**, para que el cliente muestre la cuenta atrás. Afecta al protocolo (Paso 10).

### Impacto sobre las decisiones ya tomadas o en curso

| Decisión | Impacto | Motivo |
|---|---|---|
| D1. NestJS | Ninguno | |
| D2. Drizzle | Ninguno | Los plazos persistentes se resuelven con una columna de fecha límite y una consulta indexada |
| D3. Transporte realtime | **No cambia la recomendación** | Ningún transporte WebSocket resuelve el aviso a un jugador desconectado; eso es otra capacidad. En esta modalidad cada visita equivale a una reconexión con resincronización desde el estado persistido, que es justo lo que el protocolo propio ya exige |
| D4. Autenticación | Refuerza las sesiones con cookie | La sesión debe durar días con renovación deslizante para que quien vuelve a jugar no tenga que iniciar sesión cada vez |

### Impacto sobre la arquitectura y el plan

| # | Efecto | Qué toca | Paso |
|---|---|---|---|
| R-1 | **El estado en memoria pasa a ser una caché.** Una partida puede durar días o semanas, así que la sesión no puede vivir en memoria toda la partida. Se carga desde el snapshot al necesitarla y se libera cuando queda inactiva. La reconstrucción desde snapshot deja de ser un caso excepcional y pasa a ser el camino normal | Acuerdo B6; `docs/04` § Persistencia propuesta y § Recuperación | 8 |
| R-2 | **Los plazos deben ser persistentes.** Un temporizador en memoria no sobrevive a un reinicio. Hace falta guardar la fecha límite del turno y un proceso periódico que detecte los plazos vencidos | Pendiente P9; `docs/03` tabla `game_sessions` | 7 y 8 |
| R-3 | **Resultado por tiempo agotado.** Hay que definir qué ocurre al vencer el plazo (derrota, turno saltado u otra regla) y quién construye ese resultado, ya que el motor no conoce el reloj | Hallazgo C-12 | 7 |
| R-4 | **Aviso de turno a jugadores desconectados.** Capacidad nueva: notificación push del navegador, correo o solo un indicador al volver a entrar. La primera convertiría la PWA de opcional en necesaria; la segunda exige envío de correo | `docs/01` § Principios (PWA opcional); vacío G-02 | 6 |
| R-5 | **Versiones del motor durante partidas largas.** Una partida puede atravesar varios despliegues, así que la versión del motor con la que empezó debe seguir disponible hasta que termine | Hallazgo C-06; `docs/04` § Recuperación | 7 y 9 |
| R-6 | **Varias partidas simultáneas por jugador** y una lista de "mis partidas en curso" con indicación de a quién le toca | `contracts/01`; `docs/03` § Reglas de integridad | 7 y 10 |
| R-7 | **Presencia distinta de abandono.** En esta modalidad desconectarse es lo normal. El abandono solo puede ser explícito o por plazo vencido | Vacío G-05; estado `READY` de sala | 7 |
| R-8 | **Capacidad medida en partidas activas**, no solo en conexiones simultáneas | Pendiente P15 | 5 |

### Conclusión

El requisito no contradice ninguna decisión aprobada y la arquitectura lo admite, porque ya confirma cada jugada solo tras persistirla. Cambia el énfasis: PostgreSQL es la fuente de verdad en todo momento y la memoria es solo una optimización. Los pasos 6, 7 y 8 ganan alcance.

---

## 10. Corrección de un supuesto de trabajo (2026-11-14): alojamiento separado

**Origen:** mensaje de Fernando en el hilo. **Enunciado:** el backend y el frontend no estarán alojados juntos.

Corrige el supuesto de la sección 5 "Frontend y API servidos bajo el mismo sitio", que queda así: **alojamientos separados; si comparten o no dominio registrable está [PENDIENTE]**.

| Decisión | Impacto |
|---|---|
| D1, D2, D3 | Ninguno |
| D4. Autenticación | **Sí afecta.** La sesión con cookie solo es fiable si frontend y API comparten dominio registrable (subdominios de un dominio propio). Con dominios no relacionados hay que usar tokens y un ticket de un solo uso para el WebSocket. Análisis en la sección 6 de `comparacion-autenticacion.md` |
| Paso 5. Despliegue | Añade CORS con credenciales, orígenes de confianza para CSRF y lista de orígenes del WebSocket. Añade la cuestión de si Nuxt renderiza en servidor páginas con sesión |
