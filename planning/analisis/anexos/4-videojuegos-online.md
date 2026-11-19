# Revisión 4: el proyecto visto como juego online multijugador

| Campo | Valor |
|---|---|
| Código revisado | `/home/user/gameboard-coliseum-arena`, rama `main` en `d7719b5` (Hito 6 fusionado, PR #8) |
| Método | Solo análisis estático. No se ejecutó nada ni se modificó ningún archivo |
| Ámbito | Autoridad del servidor, relojes, red y tiempo real, escalabilidad, extensibilidad a varios juegos, juego limpio y experiencia |
| Fecha | 2026-11-19 |

Las rutas de la evidencia son relativas a la raíz del repositorio. Los números de línea corresponden a `d7719b5`.

---

## 1. Resumen: qué está bien resuelto

En conjunto, la base es sólida para un juego por turnos con servidor autoritativo. Los mecanismos difíciles (orden de las jugadas, carreras con el reloj, idempotencia, recuperación tras un reinicio) están resueltos con la base de datos y no con memoria, y hay pruebas de concurrencia reales. Lo que falta está casi todo en los bordes: límites de abuso, despliegue, y las piezas que necesitará el segundo juego.

**Autoridad del servidor y atomicidad**

- Quién juega sale de la sesión de la conexión y el asiento sale de la base de datos, nunca del mensaje (`apps/backend/src/modules/realtime/realtime.gateway.ts:316-317`, `game-sessions.service.ts:692-694`). El motor es la única vía para validar (`game-sessions.service.ts:308-309`) y en el registro se guarda la acción tal como la normalizó el motor, no la entrada del cliente (`:337`).
- Cada orden abre una transacción, bloquea la fila de la sesión con `FOR UPDATE` (`game-sessions.repository.ts:69-76`) y guarda con la condición de versión y estado (`:83-101`). Es la doble barrera de las reglas 8.6 y 8.8. El final, las estadísticas y la vuelta de la sala van en esa misma transacción (`game-sessions.service.ts:868-910`), y los avisos salen solo tras confirmarse (`database.service.ts:46-74`).
- La carrera entre una jugada y el vencimiento del reloj se resuelve bajo el bloqueo: la jugada que llega con el reloj vencido aplica el vencimiento y se rechaza con `CLOCK_EXPIRED` (`game-sessions.service.ts:295-300`). La rendición aplica antes los vencimientos pendientes (`:370-376`). El orden de bloqueos sesión → sala (K10) se respeta en todos los caminos que he seguido.
- Hay pruebas de concurrencia contra PostgreSQL real: dos jugadas simultáneas, la misma petición dos veces a la vez, y vencimiento con jugada simultánea (`apps/backend/test/matches.test.ts:466`, `:483`, `:698`).

**Idempotencia y número de secuencia**

- `stateVersion` sube con cada jugada y cada retirada. El cliente la envía y el servidor rechaza con `STALE_STATE_VERSION` (`game-sessions.service.ts:289-293`). El cliente descarta notificaciones más antiguas (`apps/frontend/app/utils/matches.ts:88-91`).
- El `requestId` tiene índice único por partida y jugador (`game-sessions.schema.ts:96`), sobrevive a los reinicios, y la comprobación va antes que las de estado y versión, como fija el protocolo. El cliente reenvía al reconectar las órdenes sin respuesta, con su mismo identificador (`apps/frontend/app/utils/realtime-client.ts:396-397`).

**Relojes**

- La hora la mide siempre el servidor (7.4). Los relojes se guardan como tiempo restante medido en `turnStartedAt`, junto con la fecha límite (`match-clock.ts:21-42`). Son funciones puras y ya admiten varios asientos activos.
- El vencimiento usa un temporizador exacto por partida y una revisión periódica que cubre los perdidos (`turn-timers.ts:34-47`, `clock-sweeper.ts:41-56`). El temporizador solo avisa: la decisión se toma releyendo la fila bloqueada (`game-sessions.service.ts:389-409`). El tope de 24,8 días de `setTimeout` está contemplado (`turn-timers.ts:7`), así que 36 horas no es problema.
- Tras una parada, el arranque desplaza los turnos en curso por el tiempo parado, antes de aceptar conexiones (`server-liveness.ts:40-47`, `game-sessions.repository.ts:195-212`). Usa `greatest(turnStartedAt, lastAliveAt)`, así que no regala tiempo a una jugada confirmada justo antes de la caída.
- El cliente no depende de su propio reloj: cuenta hacia atrás desde el tiempo restante de cada aviso con `performance.now()`, y el plazo de abandono se calcula contra `serverTime` (`matches.ts:18-45`). En las partidas por turnos se muestran horas y minutos, y la hora límite.
- Los valores cumplen la decisión aprobada: 3, 5 y 10 minutos en tiempo real, dentro de "hasta 30 minutos" (regla 7.2 y ADR-014, decisión K6), y 12, 24 y 36 horas por turnos (`packages/game-engine/src/games/four-in-a-row/engine.ts:182-197`). Si la intención del usuario era ofrecer exactamente 30 minutos, eso es una decisión de producto distinta de K6, no un fallo del código.

**Red y tiempo real**

- WebSocket nativo sobre `ws` con el adaptador oficial (ADR-003). El origen y la sesión se comprueban en el handshake (`realtime-handshake.ts:29-39`). La versión del protocolo va en la URL y se cierra con 4002 si no coincide.
- Para detectar conexiones muertas hay ping/pong de WebSocket en el servidor y un latido de aplicación para el cliente (`realtime.gateway.ts:245-255`). La reconexión usa espera exponencial con variación aleatoria (`realtime-client.ts:133-136`) y reintenta en cuanto vuelve la red o la pestaña (V7).
- Al reconectar se envía siempre el estado completo (T3, T7): sin deltas, no puede haber desincronización. Cada conexión recibe solo la vista de su asiento (`match-views.ts:75`). La suscripción se encola por partida, así que ningún cambio se cuela entre la lectura y el alta (`realtime.gateway.ts:393-424`, `:708-718`).
- Hay límite de tamaño, con cierre 1009 (`realtime-ws.adapter.ts:29`), de conexiones por jugador (4003) y de suscripciones. La sesión se revalida cada minuto, y al apagar se cierra con 1012 para que los clientes reconecten.

**Motor y extensibilidad**

- El contrato (`packages/game-engine/src/contract.ts`) es puro y determinista, y conoce asientos, no personas. `activeSeats` es una lista (`:139`), así que admite jugadas simultáneas. `retireSeat` vale para N jugadores (`:263-275`). `getView(state, seat | null)` da una vista por asiento y otra para quien no ocupa ninguno (`:277-282`). La semilla la genera la plataforma (`:179-184`, `randomness.ts:22`), y `restoreState` valida el snapshot en cada carga.
- El registro por `slug@version` (`registry.ts`) permite que convivan versiones de un juego. La partida fija la suya (7.23) y, si el motor falta o no reconoce el estado, se anula por fallo (K12).
- El frontend no ejecuta el motor, solo toma sus tipos (K7). La página de partida es genérica y el tablero se elige por `gameSlug` (`apps/frontend/app/games/index.ts:11-17`).

---

## 2. Hallazgos

Prioridades:
- **Alta**: hay que resolverlo antes de publicar.
- **Media**: riesgo real del MVP, o una pieza que cuesta poco ahora y mucho después.
- **Baja**: mejora o asunto de gran escala.

### GO-1. El canal no limita la frecuencia de las órdenes, y la cola de cada conexión no tiene tope

| Campo | Contenido |
|---|---|
| **Prioridad** | **Alta** antes de publicar, porque un solo usuario registrado puede degradar el servicio para todos. Baja mientras todo sea local |
| **Evidencia** | `apps/backend/src/modules/realtime/realtime.gateway.ts:275-285` (cada mensaje se encadena a `connection.pending` sin límite); `:288-313` (un mensaje inválido se rechaza y la conexión sigue abierta); `:188-192` (hasta 5 conexiones por jugador); `apps/backend/src/config/config.ts:173` (10 conexiones a la base de datos); `packages/contracts/src/protocol.ts:22` (`POLICY_VIOLATION` está definido y no se usa en ningún sitio del backend); `contracts/02-realtime.md:335` |
| **Problema** | Cada `SUBMIT_ACTION` o `RESIGN_MATCH` abre una transacción con `FOR UPDATE` y hace unas ocho consultas, aunque la partida no exista. Las órdenes de una conexión van de una en una, pero con 5 conexiones un mismo jugador mantiene 5 transacciones simultáneas: la mitad del pool. Además, la cola de cada conexión crece sin tope, con hasta 16 KiB por mensaje retenido en memoria. En el MVP, con registro abierto, basta un script para que las jugadas de los demás esperen al pool y sus relojes de 3 minutos sigan corriendo |
| **Propuesta** | (1) Un cubo de fichas por conexión con los valores del protocolo, 20 órdenes cada 10 s, que responda `RATE_LIMITED`. (2) Un tope de órdenes pendientes por conexión, por ejemplo 8, por encima del cual se responde `RATE_LIMITED` sin encolar. (3) Un contador de infracciones (rechazos por frecuencia más `INVALID_MESSAGE`) que cierre con 1008 al superar un umbral. (4) Como mucho una orden de juego en curso por jugador y partida, sumando todas sus conexiones, para que 5 pestañas no multipliquen la carga sobre la base de datos |
| **Impacto** | Elimina el vector de denegación de servicio más barato. Coste: aproximadamente un día con las pruebas. Todo vive en `realtime`, sin tocar el dominio |
| **Relación** | ADR-013, decisión H9 (frecuencia en el Hito 7); protocolo, sección 9 y decisión T14; `planning/decisiones-y-pendientes.md:127` |
| **Clasificación** | **Ya anotado como pendiente** (el cierre 1008 y los límites de frecuencia, en el Hito 7). Lo nuevo es el tope de la cola y el límite por jugador entre conexiones, que el protocolo no menciona |

### GO-2. Con conexiones zombi, el cierre 4003 detiene al cliente y puede costar una partida en tiempo real

| Campo | Contenido |
|---|---|
| **Prioridad** | **Media**. Es un riesgo real en el móvil, que es justo lo pendiente de probar (la PWA en el móvil) |
| **Evidencia** | `realtime.gateway.ts:189-192` (la conexión nueva se cierra con 4003 si ya hay 5 contadas); `:245-255` (una conexión muerta solo se descarta tras dos latidos sin pong, hasta 50 s); `packages/contracts/src/protocol.ts:38-44` (4003 está entre los cierres sin reconexión); `apps/frontend/app/utils/realtime-client.ts:312-320` (pasa a `stopped`); `:251-265` (`reconnectNow` no hace nada en `stopped`) |
| **Problema** | En el móvil, cada cambio de red (wifi a datos, túnel, ascensor) deja en el servidor una conexión medio abierta que sigue contando hasta 50 s. Con varias pestañas o la PWA más el navegador, unos pocos cortes seguidos llenan el cupo de 5. La conexión nueva, la buena, se cierra con 4003 y el cliente deja de reintentar. Cuando el servidor descarta las zombis, el jugador queda ausente, y en tiempo real pierde por abandono a los 2 minutos (7.26) aunque esté mirando la partida. Solo lo salva recargar la página |
| **Propuesta** | En el servidor: al llegar al límite, terminar primero las conexiones del jugador con `alive = false` y, si sigue lleno, cerrar con 4003 la **más antigua** en lugar de la nueva. En el cliente: si llega 4003 con una partida en tiempo real en curso, reintentar con espera larga en vez de pararse. Cualquiera de las dos basta. La primera es la más limpia, pero cambia el significado de 4003 en el protocolo, sección 2 |
| **Impacto** | Evita derrotas por abandono injustas en el móvil. Coste: unas horas, más la enmienda del contrato |
| **Relación** | Protocolo, sección 2 (tabla de cierres) y decisión T14; regla 7.25; ADR-015, decisiones V3 y V11; ADR-016, decisión N5 |
| **Clasificación** | **Recomendación nueva** (toca un contrato aceptado, así que necesita aprobación) |

### GO-3. En una partida de 3 minutos, el cliente tarda hasta 50 s en darse cuenta de que su jugada no llegó

| Campo | Contenido |
|---|---|
| **Prioridad** | **Media**. Afecta directamente al resultado de partidas rápidas |
| **Evidencia** | `realtime-client.ts:360-368` (solo se reconecta tras dos latidos de silencio, 50 s); `:501-509` (la orden espera su respuesta sin plazo); `realtime.gateway.ts:245-255`; ADR-015, decisión V11 (se descartó bajar el latido a 10 s) |
| **Problema** | En una conexión medio abierta, `socket.send` no falla. La jugada se pierde, el tablero queda bloqueado en "enviando" (K20) y el reloj del jugador corre en el servidor. Con 3 minutos por jugador, perder 50 s una sola vez decide la partida |
| **Propuesta** | Un plazo de respuesta por orden de juego en el cliente, por ejemplo 5 s. Si vence, se da la conexión por perdida, se reconecta de inmediato y se reenvía la orden con el mismo `requestId`, que el servidor ya trata como idempotente. No cambia el protocolo ni el latido acordado en V11 |
| **Impacto** | El caso peor pasa de unos 50 s a unos 5 s más la reconexión. Coste: unas horas |
| **Relación** | Protocolo, sección 2 (latidos) y decisión T9; ADR-015, V11; regla 8.12 |
| **Clasificación** | **Recomendación nueva** |

### GO-4. Nada impide que corran dos procesos a la vez, y un despliegue que los solape da derrotas por abandono falsas

| Campo | Contenido |
|---|---|
| **Prioridad** | **Media**. La decisión aprobada es una sola instancia, pero muchos alojamientos despliegan arrancando el nuevo proceso antes de parar el viejo. Es un riesgo del MVP en cuanto haya alojamiento (Hito 7) |
| **Evidencia** | `apps/backend/src/modules/broadcast/presence.ts:15-16` y `game-sessions/abandonment-watch.ts:28` (presencia y ausencias en memoria); `broadcast/realtime-events.ts:39-41` (difusión dentro del proceso); `game-sessions.service.ts:178-188` (al arrancar, todos los participantes en tiempo real quedan ausentes); `:1036` y `:534-542` (al empezar una partida, se marca ausente a quien no esté conectado **a ese proceso**); `server-liveness.ts:40-47` y `game-sessions.schema.ts:114-123` (una sola fila de actividad: cada arranque desplaza todos los turnos y sobrescribe la anotación) |
| **Problema** | Con dos procesos, A y B, y los jugadores repartidos entre ellos: la partida empieza en A, que no ve a quien está conectado a B y lo marca ausente. A los 2 minutos, A ve a un rival conectado (el suyo) y declara perdedor por abandono a alguien que está jugando. Además, los `MATCH_UPDATED` que confirma un proceso no llegan a los suscritos del otro, y cada arranque regala hasta 10 s de reloj a todas las partidas. Hoy nada detecta la situación: la segunda instancia arranca sin aviso |
| **Propuesta** | (1) Al arrancar, tomar un `pg_advisory_lock` de sesión, en una conexión dedicada que se mantiene abierta, antes de `recoverFromDowntime`. Una segunda instancia queda esperando, o falla con un mensaje claro si se usa `pg_try_advisory_lock`, hasta que la primera se apaga. Así un despliegue solapado se comporta como "parar y arrancar". (2) Dejar escrito en el ADR de alojamiento que el despliegue es de tipo "recreate" y que la comprobación de salud debe tolerar la espera por el bloqueo |
| **Impacto** | Convierte la decisión "una instancia" en algo que el sistema garantiza, en vez de una convención. Coste: medio día |
| **Relación** | ADR-007, acuerdo B7; `planning/decisiones-y-pendientes.md:106`; ADR-015, decisiones V1, V4 y V10; ADR-003, condición 5.7 |
| **Clasificación** | **Recomendación nueva**: refuerza una decisión aprobada |

### GO-5. Los documentos describen una caché de sesiones que no existe, y no nombran los verdaderos bloqueos para tener varias instancias

| Campo | Contenido |
|---|---|
| **Prioridad** | **Baja**. No afecta al MVP, pero engaña a quien vaya a planificar la escala |
| **Evidencia** | El código no guarda copia en memoria (ADR-014, decisión K2; `game-sessions.service.ts:124-128`). Los documentos siguen hablando de ella: `docs/02-arquitectura.md:123` ("la memoria es una caché de sesiones de juego") y `:233` ("la serialización de jugadas … vive en la memoria de un proceso", cuando la serializa el bloqueo de fila); `docs/04-flujos-y-persistencia.md:18`, `:103`, `:140` y `:161`; `docs/03-dominio-datos.md:395` y `:416`; reglas 7.22 y 8.10 de ADR-009 y ADR-010. Además, `docs/04-flujos-y-persistencia.md:128` dice que, entre una jugada y un vencimiento simultáneos, el segundo "encuentra otra versión, se descarta y se vuelve a evaluar". En el código espera al bloqueo y encuentra la partida cerrada (`MATCH_NOT_IN_PROGRESS`), o `expireIfDue` devuelve `false` |
| **Problema** | Quien lea la arquitectura creerá que el obstáculo es la serialización, que ya funciona con varias instancias. Los obstáculos reales, sin documentar, son: (a) la presencia y las ausencias en memoria (GO-4); (b) la difusión dentro del proceso; (c) la anotación de actividad de una sola fila; (d) los límites por jugador contados por proceso; (e) la hora de cada servidor como fuente de tiempo (`common/clock.ts:6-8`), que con varias máquinas añade su desfase al reloj de juego |
| **Propuesta** | Corregir los pasajes citados con una nota fechada, sin reescribir decisiones, y sustituir la sección 10 de la arquitectura por esta lista. Para la escala: (a) y (d) en Redis con caducidad, o en una tabla de presencia con un latido por instancia; (b) Redis pub/sub o `LISTEN/NOTIFY` de PostgreSQL detrás de `RealtimeEvents`, que ya es el punto único (ADR-003, condición 5.3); (c) una fila por instancia, desplazando turnos solo si no queda ninguna viva; (e) tomar `now()` de la base de datos dentro de la transacción de cada jugada. La revisión periódica de relojes ya sirve tal cual, aunque convendría `FOR UPDATE SKIP LOCKED` para no repetir trabajo |
| **Impacto** | Documentación fiel y un plan de escala realista: unas 1–2 semanas cuando llegue, frente a las estimaciones que da hoy el texto. Coste de la corrección: una hora |
| **Relación** | ADR-014, K2 (sustituye en la práctica 7.22 y 8.10); ADR-007, B6 y B7; `planning/decisiones-y-pendientes.md:156` |
| **Clasificación** | **Incoherencia entre documentación y código** (y, para la escala, solo importa a gran escala) |

### GO-6. Jugadas simultáneas: la segunda jugada se rechaza por versión, y también por el reloj de otro asiento

| Campo | Contenido |
|---|---|
| **Prioridad** | **Media**. No afecta al MVP con Cuatro en raya, pero el usuario quiere expresamente que el diseño no impida las jugadas simultáneas |
| **Evidencia** | `game-sessions.service.ts:289-293` (la versión tiene que coincidir exactamente); `:296-300` y `:1047-1049` (`isDue` mira la fecha límite común, que es la del primer reloj activo que se agote, `match-clock.ts:35-42`); `contracts/02-realtime.md:391`; `contracts/03-game-engine.md`, sección 7 |
| **Problema** | (1) Con dos asientos activos, A y B juegan sobre la versión N. La de A pasa a N+1 y la de B se rechaza con `STALE_STATE_VERSION`. B tiene que pedir el estado y repetir. Con 4 o 6 jugadores en una fase de "todos eligen", la mayoría de las jugadas rebotan una vez. (2) Además, si el reloj de A se agota, la jugada de B se rechaza con `CLOCK_EXPIRED` aunque a B le quede tiempo: se aplica el vencimiento de A y B tiene que reenviar. El protocolo solo prevé el primer caso como asunto abierto. El segundo no está anotado |
| **Propuesta** | (1) Guardar en la sesión, por asiento, la versión en la que pasó a estar activo (`activeSinceVersion`). Aceptar la jugada si `expectedStateVersion >= activeSinceVersion[seat]` y el asiento sigue activo. El motor sigue decidiendo si la acción vale sobre el estado actual, así que la regla 8.11 conserva su sentido: lo que el jugador vio desde que le tocó no ha cambiado para él. Si un juego necesita la regla estricta, podría declararlo en `GameMetadata`. (2) En el vencimiento: retirar solo los asientos vencidos y, si el que envía sigue activo después, evaluar su jugada en la misma transacción, en lugar de rechazarla |
| **Impacto** | Hace viable el primer juego simultáneo sin rehacer la capa de sesión. Coste: 1–2 días, más una enmienda del protocolo (sección 4, paso 5) |
| **Relación** | ADR-010, regla 8.11; contrato del motor, decisión M10; modelo de datos, R10; protocolo, sección 12 |
| **Clasificación** | **Ya anotado como pendiente** en (1). El caso (2) es **recomendación nueva** |

### GO-7. Más de dos jugadores: la plataforma no sabe qué asientos están retirados

| Campo | Contenido |
|---|---|
| **Prioridad** | **Media**. No afecta al MVP, pero romperá el contrato del motor con el primer juego de 3 o más jugadores en el que alguien se retire y la partida siga |
| **Evidencia** | `packages/game-engine/src/contract.ts:272-275` ("la plataforma solo la llama con … un asiento que sigue participando"); `game-sessions.service.ts:365-378` (cualquier participante puede rendirse mientras la sesión esté `ACTIVE`); `:476-503` (el abandono se vigila para todos los participantes); `:790-805` (el conjunto `retired` solo existe dentro de la llamada); `:488-490` (un asiento retirado pero conectado cuenta como "rival conectado"); `rooms/rooms.service.ts:495` (la partida solo empieza con la sala llena) |
| **Problema** | En una partida de 4, si C se rinde y la partida continúa, nada impide que C vuelva a rendirse, o que su desconexión posterior produzca una retirada por `ABANDONMENT`. Las dos llaman a `retireSeat` sobre un asiento ya retirado, cosa que el contrato prohíbe. Lo que pase entonces depende de cada motor: en Cuatro en raya, `retireSeat` sobrescribe `retiredSeat` (`engine.ts:249-251`). Además, el retirado sigue ocupando su plaza en la sala, cuenta para su límite de partidas simultáneas (7.30) y vale como "rival conectado" para declarar abandonos de los demás |
| **Propuesta** | Añadir `retired_seats smallint[]` a `game_sessions`, o que `GameStatus` en curso devuelva también los asientos que siguen participando. Filtrar con eso la rendición (responder con el estado actual, como una orden repetida), el abandono, los vencimientos y el cálculo de "rival conectado". Las reglas de sala y de límites para el retirado siguen pendientes de decisión (ADR-015, W6). Aparte, conviene decidir si una sala de un juego de 2 a 6 jugadores puede empezar sin estar llena, porque hoy no se puede (`rooms.service.ts:495`) |
| **Impacto** | Cumple el contrato con cualquier número de jugadores. Coste: aproximadamente un día |
| **Relación** | Contrato del motor, decisión M11; regla 7.18; ADR-015, W6; `contracts/03-game-engine.md`, sección 7 |
| **Clasificación** | **Ya anotado como pendiente** (jugador retirado en una partida que continúa). La doble llamada a `retireSeat` es un **defecto concreto nuevo** dentro de ese pendiente |

### GO-8. El registro no permite repetir una partida con azar, ni una que siguió tras una retirada

| Campo | Contenido |
|---|---|
| **Prioridad** | **Media**. Hoy cuesta una migración y unas líneas. Después ya no tiene remedio para las partidas jugadas |
| **Evidencia** | `game-sessions.service.ts:213-217` (la semilla se pasa al motor y no se guarda en ninguna parte); `matches/matches.schema.ts:32-53` (la partida no guarda semilla ni opciones del juego: las opciones viven en la sala); `game-sessions.service.ts:794-805` (las retiradas suben `stateVersion` pero no dejan fila en `match_actions`); `game-sessions.schema.ts:83` (`sequence` coincide con `stateVersion`, así que tiene huecos); `contracts/03-game-engine.md:125` (M7: "la semilla queda guardada con el estado"); ADR-010, sección 7 ("la base para repetir o mostrar partidas más adelante") |
| **Problema** | Con un solo snapshot que se sobrescribe (8.1), lo que el estado guarda es la posición **actual** del generador de azar, no la semilla inicial. Para reconstruir una partida desde el registro faltan tres cosas: la semilla, las opciones del juego tal como estaban al empezar, y las retiradas intercaladas con las jugadas. Cuatro en raya no tiene azar y su única retirada termina la partida, así que hoy sí se puede repetir. El segundo juego con cartas o dados no podrá, y tampoco se podrá revisar una partida disputada ni comprobar una versión nueva del motor contra las partidas reales |
| **Propuesta** | (1) Guardar en `matches` o en `game_sessions`, al empezar, la `seed` y las `settings` validadas, o directamente el estado inicial. (2) Anotar las retiradas en el registro: una columna `kind` (`ACTION` o `RETIREMENT`) con `seat` y `reason`, y `request_id` y `player_id` opcionales para las que provoca la plataforma; o bien una tabla `match_retirements` con el mismo `sequence`. No es event sourcing (8.3): el snapshot sigue siendo la fuente de verdad |
| **Impacto** | Permite repeticiones, auditoría de partidas disputadas y pruebas de regresión de motores con partidas reales. Coste: medio día o un día |
| **Relación** | ADR-010, reglas 8.1 a 8.3 y alternativas de 8.2; contrato del motor, M7; ADR-014, K11 y K16 |
| **Clasificación** | **Incoherencia entre documentación y código** (M7 promete que la semilla queda guardada) y **recomendación nueva** (las retiradas en el registro) |

### GO-9. Activar un juego no garantiza que el frontend sepa mostrarlo

| Campo | Contenido |
|---|---|
| **Prioridad** | **Media**. Se dará justo con el primer juego nuevo, por la combinación de dos decisiones aprobadas: activación desde administración y frontend alojado aparte |
| **Evidencia** | `apps/backend/src/modules/games/games.service.ts:155-174` (activar solo comprueba que el **motor** esté registrado); `apps/frontend/app/composables/useCatalog.ts:21-27` y `components/RoomCreateForm.vue:104` (se ofrecen todos los juegos del catálogo, tenga o no tablero el frontend); `apps/frontend/app/games/index.ts:11-17` (tableros por `gameSlug`, sin versión); `pages/partidas/[matchId].vue:330-332` (sin tablero solo se muestra un aviso); `apps/frontend/service-worker/sw.js:57-66` (una pestaña o PWA abierta sigue con el paquete anterior hasta recargar) |
| **Problema** | Si un administrador activa un juego antes de que el frontend con su tablero esté desplegado, o mientras los jugadores tienen abierta una versión anterior, se pueden crear salas y la partida empieza. Los jugadores ven "juego desconocido", no pueden jugar y el reloj corre hasta que pierden por tiempo o por abandono. Lo mismo pasa con una versión nueva del motor que cambie la forma de `view`, porque el tablero se elige solo por el nombre del juego |
| **Propuesta** | (1) Que el frontend filtre el catálogo y la creación de salas a los juegos que sabe mostrar (`gameUi(slug) !== null`) y, ante un juego desconocido, sugiera recargar la aplicación. (2) Elegir el tablero por `slug` y versión mayor (`four-in-a-row@1`). (3) Añadir a `docs/guia-administracion.md` el orden: desplegar el frontend, comprobar y después activar |
| **Impacto** | Evita partidas imposibles de jugar que cuentan en estadísticas. Coste: unas horas, sin cambios de contrato |
| **Relación** | Decisión del 2026-11-16 (juegos nuevos inactivos, activados desde administración); ADR-004 (alojamiento separado); ADR-016, decisión N4; ADR-017, decisión U5 |
| **Clasificación** | **Recomendación nueva** |

### GO-10. El contrato del tablero en el frontend se queda corto para el segundo juego

| Campo | Contenido |
|---|---|
| **Prioridad** | **Baja**. Se resuelve cuando llegue el segundo juego, pero conviene fijar la forma antes de escribirlo |
| **Evidencia** | `apps/frontend/app/games/game-ui.ts:18-20` y `games/FourInARowBoard.vue:15-21` (el tablero solo recibe `view` y `canPlay`); `pages/partidas/[matchId].vue:181` (los eventos de juego se descartan: `_events`); `assets/css/main.css:437-438` y `:524-531` (colores solo para los asientos 0 y 1); `i18n/es.ts:260` (los textos de cada juego en el archivo común); `games/index.ts:1-2` (todos los tableros entran en el paquete principal) |
| **Problema** | Un juego de cartas, o de más de dos, necesita saber en el tablero su asiento, los activos, los jugadores y los eventos, para animar una carta robada o una tirada. Hoy tendría que repetirlos dentro de `view` o tocar la página genérica. Los colores y los textos obligan a editar archivos comunes por cada juego |
| **Propuesta** | Un tipo `GameBoardProps` con `view`, `yourSeat`, `activeSeats`, `players`, `events`, `stateVersion` y `canPlay`, y el evento `play`. Una paleta de N colores de asiento por variables CSS. Textos e importación por juego con `defineAsyncComponent`. Lo que sigue acoplado a Cuatro en raya es solo `games/four-in-a-row.ts`, `FourInARowBoard.vue`, sus textos y sus colores: la página de partida, el cliente de tiempo real y el backend son genéricos |
| **Impacto** | Añadir un juego pasa a tocar solo su carpeta. Coste: unas horas |
| **Relación** | ADR-014, K7; contrato del motor, M8 (eventos públicos) |
| **Clasificación** | **Recomendación nueva** |

### GO-11. La plataforma no hace cumplir los valores de reloj aprobados

| Campo | Contenido |
|---|---|
| **Prioridad** | **Baja**. Hoy se cumplen, pero solo porque así lo declara el motor |
| **Evidencia** | `games.service.ts:60-73` (al arrancar solo se comprueba que haya motor); `:285-297` (el catálogo publica lo que declare el motor); `games/room-options.ts:23-43` (la sala se compara con el motor, no con la regla) |
| **Problema** | La regla 7.2 ("hasta 30 minutos en tiempo real; 12, 24 o 36 horas por turnos") vive solo en los documentos. Un motor nuevo podría declarar 60 minutos o 48 horas, o `minPlayers > maxPlayers`, y entraría en el catálogo sin que nada avisara |
| **Propuesta** | Al registrar los motores (`createGameEngineRegistry` o `GamesService.onApplicationBootstrap`), validar los metadatos: en `REALTIME`, `totalMs` de 30 minutos como mucho; en `TURN_BASED`, solo 12, 24 o 36 horas; y `1 <= minPlayers <= maxPlayers`. Si no se cumple, el servidor no arranca, como ya pasa con un motor que falta |
| **Impacto** | Convierte la regla aprobada en una comprobación automática. Coste: una hora |
| **Relación** | ADR-009, reglas 7.2 y 7.7; ADR-016, N1 |
| **Clasificación** | **Recomendación nueva** (salvaguarda de una decisión aprobada) |

### GO-12. Repetir una rendición tras reconectar no es idempotente

| Campo | Contenido |
|---|---|
| **Prioridad** | **Baja**. Solo afecta a lo que se ve en pantalla |
| **Evidencia** | `realtime-client.ts:396-397` (al reconectar se reenvían todas las órdenes pendientes, también `RESIGN_MATCH`); `game-sessions.service.ts:365-368` (si la partida ya terminó, se responde `MATCH_NOT_IN_PROGRESS`); `pages/partidas/[matchId].vue:205-216` (eso se muestra como error) |
| **Problema** | Si la conexión se corta después de que el servidor aplique la rendición y antes de que llegue su respuesta, al reconectar el jugador ve el resultado junto con un mensaje de error ("la partida no está en curso"), aunque su orden se aplicó. El protocolo solo define la repetición para `SUBMIT_ACTION` (sección 4, paso 3) |
| **Propuesta** | En `resign`, si la partida terminó por `RESIGNATION` del asiento de quien la envía, responder con el estado final, igual que una jugada repetida (T13). O bien, en el cliente, no mostrar ese rechazo cuando lo que llega después es una partida terminada |
| **Impacto** | Coherencia con la regla 8.12. Coste: una hora |
| **Relación** | ADR-010, 8.12; protocolo, T5 y T13 |
| **Clasificación** | **Recomendación nueva** |

### GO-13. La receta para añadir un juego no dice que llegue inactivo

| Campo | Contenido |
|---|---|
| **Prioridad** | **Baja** |
| **Evidencia** | `apps/backend/drizzle/20261116061456_cuatro_en_raya/migration.sql:1-3`, `:10` y `:17` (la migración de referencia inserta el juego en `ACTIVE`); `packages/game-engine/src/engines.ts:4-11` (la receta en el código no menciona el estado); `docs/guia-administracion.md:111` (la guía sí dice que llega inactivo) |
| **Problema** | Quien copie la única migración de ejemplo publicará el juego en el catálogo en cuanto se despliegue, sin pasar por administración. La comprobación de arranque no lo impide, porque el motor está registrado |
| **Propuesta** | Actualizar los dos comentarios para que digan "en estado `INACTIVE`, y se activa desde administración", con la fecha de la decisión. La migración de Cuatro en raya no se toca: es anterior a la decisión y ya está aplicada |
| **Impacto** | Evita incumplir la decisión por accidente. Coste: minutos |
| **Relación** | Decisión del 2026-11-16 (juegos nuevos inactivos); ADR-014, K5; ADR-017, U16 |
| **Clasificación** | **Incoherencia entre documentación y código** |

### GO-14. Espectadores, repetición, emparejamiento y juego limpio: lo preparado y lo que falta después del MVP

| Campo | Contenido |
|---|---|
| **Prioridad** | **Baja**. Todo es posterior al MVP |
| **Evidencia** | `contract.ts:277-282` (`getView(state, null)` existe y nadie lo usa); `realtime.gateway.ts:402` (solo los participantes se suscriben, T6); `packages/contracts/src/realtime.ts:108` (`yourSeat: number`, sin valor para quien no tiene asiento); ADR-014, K16 (sin repetición jugada a jugada); la lista de salas como único emparejamiento (T16); `statistics/statistics.service.ts:27-38` (contadores sin puntuación) |
| **Problema** | Las piezas de base están (vista sin asiento, registro de jugadas, resultados por asiento con `score`), pero faltan: (a) para espectadores, un `yourSeat: null`, la autorización de suscripción y un retardo opcional en tiempo real para que no se use como ventaja; (b) para la repetición, un `GET /matches/{id}/actions`, que depende de GO-8; (c) emparejamiento automático o "partida rápida": hoy solo existe la lista de salas; (d) juego limpio: con estadísticas por cuenta y registro abierto, nada impide subir victorias jugando contra una cuenta propia. No importa sin clasificación, pero sí cuando llegue (ADR-008, punto 14) |
| **Propuesta** | Cuando se prioricen: (a) y (b) son pequeños con lo que ya hay; (c) una cola por juego, modalidad y control de tiempo, que cree una sala y la llene, reutilizando la condición de inicio; (d) antes de la clasificación, descartar en el cálculo las partidas entre cuentas relacionadas (misma dirección o dispositivo) y exigir un mínimo de jugadas para que una partida cuente |
| **Impacto** | Hoja de ruta sin rehacer nada. Coste: según la pieza |
| **Relación** | Protocolo, T6, T16 y sección 12; ADR-008, puntos 12 a 16; ADR-014, K16 |
| **Clasificación** | **Ya anotado como pendiente** (espectadores), y **recomendación nueva** en el resto |

---

## 3. Respuesta punto por punto

### 3.1 Autoridad del servidor

Cumple el modelo server-authoritative aprobado. El cliente solo envía `{stateVersion, action}`. No puede elegir asiento, ni tocar el estado, ni el reloj. Una orden repetida no se aplica dos veces, y las jugadas de una misma partida se ordenan con el bloqueo de fila. No he encontrado ninguna carrera que pase la doble barrera.

Dos observaciones menores, que no llegan a hallazgo:
- La hora de la jugada se toma después de conseguir el bloqueo y cargar la partida (`game-sessions.service.ts:295`). Eso solo añade milisegundos, y únicamente cuando compite otra escritura sobre la misma partida.
- Una anulación no sube `stateVersion` (`:944`). El cliente lo tolera porque acepta versiones iguales (`matches.ts:90`).

### 3.2 Relojes

- **Fuente**: la hora del servidor de aplicación. Con una sola instancia es correcto; con varias, ver GO-5 (e).
- **Deriva**: los temporizadores usan tiempo monotónico y el cliente usa `performance.now()`, así que no hay deriva relevante.
- **Compensación de latencia**: no la hay, por la regla aprobada 7.4. El cliente muestra el reloj del rival medio viaje de red por encima del real, cosa que T12 acepta.
- **Vencimiento exacto**: temporizador más revisión periódica, decidido siempre bajo bloqueo.
- **Reinicio y parada**: bien resueltos, con V4 y V10.
- **Por turnos**: 12, 24 y 36 horas, con hora límite visible y aviso de turno en la aplicación.

Los riesgos reales están en la red (GO-2 y GO-3), no en el cálculo del reloj.

### 3.3 Red y tiempo real

- **Protocolo**: limpio, con una orden y una respuesta (T5), estado completo en cada aviso (T3) y vistas por asiento.
- **Pendiente**: los límites de frecuencia y el cierre 1008 (GO-1).
- **Contrapresión**: no se mira `bufferedAmount` (`realtime.gateway.ts:736-740`). Con mensajes pequeños, un cliente que deja de leer deja de responder al ping y se corta en 50 s como mucho, así que basta para el MVP.
- **Varias pestañas o dispositivos**: todas las conexiones reciben su vista. Si dos pestañas juegan a la vez, una recibe `STALE_STATE_VERSION` y recarga. El punto débil es el límite de 5 conexiones con zombis (GO-2).

### 3.4 Escalabilidad

**Coste por partida en curso**: un temporizador y, en tiempo real, una entrada de ausencia por jugador ausente. Por jugada: una transacción de unas 8 consultas que ocupa una conexión del pool de 10 durante unos pocos milisegundos.

**Capacidad con una instancia**: del orden de cientos de jugadas por segundo y miles de conexiones. Es de sobra para el MVP. Hay dos cuellos de botella:
- El pool de conexiones, vulnerable a abuso (GO-1).
- Las consultas que dispara cada cambio de presencia. Con hasta 20 partidas por turnos por jugador, una reconexión puede leer varias partidas, aunque solo las que tienen suscriptores (`realtime.gateway.ts:587-605`).

**Qué impide varias instancias**: está en GO-4 y GO-5. Solo importa a gran escala, salvo el solape durante un despliegue, que sí afecta al MVP.

### 3.5 Extensibilidad a varios juegos

| Capacidad | Motor (contrato) | Plataforma | Frontend |
|---|---|---|---|
| N jugadores | Sí (`playerCount`, resultados por asiento) | Casi: falta saber qué asientos están retirados (GO-7). La sala empieza solo llena | Colores de dos asientos (GO-10) |
| Jugadas simultáneas | Sí (`activeSeats` es una lista, M10) | Rechazo por versión y por el reloj de otro asiento (GO-6) | `canPlay` ya mira `activeSeats` |
| Información oculta | Sí (`getView` por asiento; eventos públicos por convención, M8) | Sí: cada conexión recibe solo su vista | Sí |
| Azar reproducible | Semilla de la plataforma (M7) | La semilla no se guarda (GO-8) | No aplica |
| Fases y turnos no lineales | Sí: el motor decide `activeSeats` en cada estado | Sí | Sí |
| Deshacer | No hay operación. Se puede modelar como acción del juego que guarda el historial dentro del estado, porque solo hay un snapshot | No hay orden de la plataforma | No |
| Vista para quien no ocupa asiento | Sí (`getView(null)`) | No se usa (GO-14) | `yourSeat` obligatorio |

**Para añadir un segundo juego hoy**:
1. Escribir el motor en `packages/game-engine/src/games/<juego>/`, con sus tipos como entrada propia del paquete.
2. Añadirlo a `GAME_ENGINES`.
3. Escribir una migración que dé de alta el juego y su versión **inactivos** (GO-13).
4. En el frontend, añadir su tablero y sus textos en `apps/frontend/app/games/`, sus textos en `i18n/es.ts` y sus colores en `main.css`.
5. Desplegar los dos y activarlo desde administración, en ese orden (GO-9).

Fuera de esas piezas del propio juego, nada del backend está acoplado a Cuatro en raya. La prueba `apps/backend/test/matches.test.ts:832` lo demuestra con un motor falso.

### 3.6 Juego limpio y experiencia

**Lo que funciona**:
- No se puede hacer trampa sobre el estado ni sobre el reloj.
- La rendición puede hacerse en cualquier momento.
- El abandono a los 2 minutos se aplica solo si hay un rival conectado (V2).
- En la revancha se alternan los asientos para que no empiece siempre el mismo (K11).
- Las partidas anuladas no cuentan, y las terminadas cuentan una sola vez.

**Lo que flojea**:
- Abandonos injustos en el móvil (GO-2 y GO-3, ligados a la prueba pendiente de la PWA en el móvil).
- Sin emparejamiento automático ni repetición (GO-14).

---

## 4. Riesgos reales del MVP frente a los de gran escala

| Afecta al MVP | Solo a gran escala o cuando llegue el juego que lo necesite |
|---|---|
| GO-1: abuso del canal, antes de publicar | GO-5: plan de varias instancias |
| GO-2: 4003 con zombis en el móvil | GO-6: jugadas simultáneas |
| GO-3: jugada perdida durante 50 s en partidas rápidas | GO-7: N jugadores con retiradas |
| GO-4: despliegue solapado, en cuanto haya alojamiento | GO-10: contrato del tablero |
| GO-9: activar un juego sin su tablero, con el primer juego nuevo | GO-14: espectadores, emparejamiento, juego limpio a escala |
| GO-8: guardar semilla, opciones y retiradas, porque no tiene remedio para las partidas ya jugadas | |
| GO-11, GO-12, GO-13: menores y baratos | |

Ninguno de los hallazgos **contradice una decisión aprobada**. El código respeta:
- El monolito modular, con las reglas de dependencias comprobadas.
- El modelo server-authoritative.
- El WebSocket nativo.
- Las dos modalidades con sus relojes.
- El snapshot único con registro de jugadas e idempotencia.
- La separación de frontend y backend.
- La activación desde administración.

Tres hallazgos refuerzan decisiones que hoy solo se cumplen por convención:
- **GO-4**: una sola instancia.
- **GO-11**: los valores de la regla 7.2.
- **GO-13**: juegos nuevos inactivos.

**Nota sobre el Hito 7**: GO-1 coincide con los pendientes ya anotados para ese hito (cierre 1008 y límites de frecuencia). GO-2 y GO-3 conviene revisarlos junto con la prueba de la PWA en el móvil, que también está pendiente. Nada de este informe requiere empezar el Hito 7 sin su autorización.
