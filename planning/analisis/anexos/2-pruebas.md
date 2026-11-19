# Revisión de las pruebas

| Campo | Valor |
|---|---|
| **Alcance** | `apps/backend/test`, todos los `*.test.ts`/`*.spec.ts` de `apps/`, `packages/` y `e2e/`, `e2e/support`, `e2e/playwright.config.ts`, configuración de Vitest, flujo de GitHub `Comprobaciones` |
| **Código revisado** | `main` en `d7719b5` (Hito 6 fusionado, PR #8) |
| **Método** | Análisis estático, solo lectura. No se ejecutó ninguna prueba. Se leyeron, en solo lectura, los registros de GitHub Actions: la lista de las 28 ejecuciones de `Comprobaciones` y los registros completos de los dos trabajos de la última (run 44469491118) |
| **Documentos contrastados** | ADR-012 (S7, S11, S18, S23), ADR-013 (H8, H18), ADR-014 (K3, K8, K12, K21, L2, sección 13), ADR-015 (V6, W1 a W9), ADR-016 (N6), ADR-017 (U10, Y8), `contracts/02` a `05`, `docs/04-flujos-y-persistencia.md`, `planning/backlog-mvp.md`, `planning/decisiones-y-pendientes.md` |

---

## 1. Resumen del estado actual

### 1.1 Qué hay, por capa

| Capa | Archivos | Casos | Herramienta y entorno | Tiempo en GitHub |
|---|---|---|---|---|
| Motor (`packages/game-engine`) | 2 | 32 declarados, unos 50 con los `it.each` | Vitest, funciones puras | Despreciable |
| Contratos (`packages/contracts`) | 4 | 16 declarados, unos 60 con los `it.each` (uno por cada uno de los 39 esquemas de OpenAPI) | Vitest, sin base de datos | Despreciable |
| Backend: unidades (`src/**`) | 2 | 17 (configuración, hash de contraseñas) | Vitest | Menos de 1 s |
| Backend: integración (`test/`) | 13 | 295 | Vitest, aplicación NestJS completa con `@nestjs/testing`, supertest, cliente `ws` real en un puerto libre, PostgreSQL 18 real | **312 casos en 56,5 s**, archivos en serie (`fileParallelism: false`) |
| Frontend (`apps/frontend/app/utils`) | 6 | 67 | Vitest, solo funciones puras; ningún componente, página ni *composable* | Despreciable |
| Navegador (`e2e/`) | 7 | 18 | Playwright 1.65.1, solo Chromium, 2 trabajadores, API compilada en un proceso aparte, frontend estático, base de datos propia creada de cero | **18 casos en 57,2 s**; trabajo entero, unos 2 min |

Las 28 ejecuciones de `Comprobaciones` terminaron bien al primer intento. En el registro de la última, Playwright informa de "18 passed" sin pruebas *flaky*. Los errores que PostgreSQL anota en ese registro (clave duplicada en `match_results`, tablas `users` y `server_liveness` que no existen) los provocan a propósito algunas pruebas: el final que no se puede guardar, el `INTERNAL_ERROR` y el arranque que falla. Ninguno es un fallo.

### 1.2 Lo que está bien

- **Base de datos real, como pedía S11.** Las pruebas de concurrencia lanzan peticiones de verdad contra PostgreSQL: la última plaza (`rooms.test.ts:582`, `:600`), el límite de partidas (`rooms.test.ts:337`), el registro con el mismo nombre (`auth.test.ts:125`), dos jugadas sobre el mismo estado (`matches.test.ts:466`), la misma petición dos veces a la vez (`matches.test.ts:483`) y el vencimiento a la vez que una jugada (`matches.test.ts:698`).
- **El tiempo está controlado sin esperas reales.** `TestClock` (`test/app.ts:89`) sustituye al `Clock` inyectado, y los temporizadores del servidor se apagan en el entorno `test`, de modo que las pruebas llaman a cada comprobación cuando quieren (H8). Los relojes de 12 horas, la caducidad de 30 y 90 días, el enlace de una hora y los 7 días de inactividad se prueban sin esperar. Las comparaciones de relojes usan márgenes (`expectNear`, `toBeLessThanOrEqual`) y no igualdades frágiles.
- **Recuperación tras una parada, en dos niveles (V6).** En el servidor: reinicio ordenado, caída sin apagado, turno posterior a la última anotación, primer arranque, arranque que falla (`recovery.test.ts:104-191`). En el navegador: un reinicio de verdad de la API a mitad de partida (`reinicio.spec.ts`) y un corte de red con la emulación de Chromium (`corte-de-red.spec.ts`).
- **Idempotencia.** La jugada repetida no se aplica dos veces, tampoco la jugada final, que no cuenta dos veces en las estadísticas (`statistics.test.ts:169`). El cliente del navegador reenvía con el mismo `requestId` (`realtime-client.test.ts:526`) y descarta los estados más antiguos que el que muestra (`matches.test.ts:145` del frontend).
- **Contratos.** Los esquemas Zod se comparan uno por uno con OpenAPI (`openapi.test.ts`). El catálogo de errores se compara con su documento y con el `enum` de OpenAPI (`errors.test.ts`). Cada código que llega al cliente tiene su texto en español (`utils.test.ts:10`).
- **Permisos de administración completos (U10).** Las ocho operaciones de `/admin` se prueban con `FORBIDDEN` y con `UNAUTHENTICATED`, y se comprueba que el rol se lee en cada petición (`admin.test.ts:79-118`).
- **La plataforma se prueba con más de un juego.** Hay motores de prueba (`createFakeEngine`, `counter`, `party`) y una prueba explícita de que la plataforma dirige igual otro juego (`matches.test.ts:832`).
- **Las pruebas en navegador** usan sobre todo localizadores por rol y por etiqueta (unos 80 `getByRole`/`getByLabel`) y no tienen ninguna espera fija (`waitForTimeout`). Cada prueba crea sus propias cuentas. Los dos casos que cambian lo que comparten todas van al final y de una en una (V6, Y8).
- **Aislamiento del motor.** La regla del analizador prohíbe la hora, el azar y el entorno (`eslint.config.js:12-33`), y dependency-cruiser comprueba las dependencias entre paquetes y módulos (S4).

### 1.3 Mapa de huecos

"Directa" quiere decir que una prueba ejercita ese código y comprueba su resultado. "Indirecta" quiere decir que solo lo recorre una prueba en navegador o una de nivel superior.

| Área | Cobertura | Lo que falta |
|---|---|---|
| Respuestas de la API frente a OpenAPI | Parcial: 83 llamadas a `expectMatchesContract` para unas 285 peticiones en las pruebas | La validación es manual. Ninguna lista dice qué pares operación y estado no se han visto nunca (PR-1) |
| Mensajes de tiempo real frente al protocolo | Ninguna validación de forma | `TestSocket` convierte cada mensaje a `Notification` sin comprobarlo (PR-2) |
| `TurnTimers.arm` y `AbandonmentWatch.arm`: el aviso exacto, el aviso adelantado y el límite de `MAX_DELAY_MS` | Ninguna directa. Apagados en `test`. La prueba en navegador del tiempo agotado pasa por la revisión periódica | Pruebas unitarias con temporizadores falsos (PR-3) |
| Las seis reglas del motor, para cualquier motor | Solo Cuatro en raya y el motor de prueba, cada uno a su manera | Una batería común (PR-4) |
| Carreras entre operaciones distintas: rendición y jugada, anulación y jugada, abandono y jugada, dos "listo" a la vez, salida del anfitrión y entrada | Ninguna | PR-5 |
| La segunda barrera de la versión del estado (8.8) | Ninguna | PR-5 |
| P1 (el administrador no ve partidas ajenas), P3 (puede suspender a otro administrador) y W5 (por turnos no hay abandono, pero el turno sí se desplaza tras una parada) | Ninguna | PR-6 |
| Orden único de comprobaciones (P6) y orden de `SUBMIT_ACTION` (protocolo, sección 4) | Solo "origen antes que sesión" y algunos pares sueltos | PR-7 |
| Protección contra peticiones falsificadas (CSRF) solo con `Sec-Fetch-Site`, `Origin: null`, y las peticiones sin `Origin` (como `curl`) | Ninguna | PR-8 |
| Cobertura de código | No se mide | PR-9 |
| La rama `GAME_ALREADY_FINISHED` del motor dentro de `submitAction` | Ninguna | PR-12 |
| Orden de los mensajes de partida en el canal (`inOrder`) | Probado en salas (`realtime.test.ts:468`), no en partidas | PR-13 |
| Frontend: *composables* (`useRealtime`, `useSession`, `useApi`), páginas, `FourInARowBoard.vue`, `service-worker/sw.js` | Solo indirecta | PR-15 |
| `scripts/admin-role.ts` | Indirecta, solo el caso que funciona (`e2e/support/account.ts:61`) | Sus casos de error. Menor: no se abre hallazgo |
| `OutboxMailer` (el buzón de archivos) | Indirecta (las pruebas en navegador leen el buzón) | Menor: no se abre hallazgo |
| Accesibilidad | Ninguna explícita | PR-16 |
| Rendimiento y carga | Una medición a mano en ADR-014 | PR-17, aplazado por decisión |
| Límites de frecuencia (`429`, `RATE_LIMITED` de la API y el cierre 1008), otros navegadores, PWA en el móvil | Ninguna | Ya anotados para el Hito 7 (sección 3) |

---

## 2. Hallazgos

### PR-1. La validación contra OpenAPI no se aplica a todas las respuestas, como pide S7

- **Prioridad: alta.** Una decisión aprobada dice "toda respuesta" y el código valida aproximadamente una de cada tres. Corregirlo es barato y cubre el riesgo de que el contrato y el código se separen sin que nadie lo note.
- **Evidencia.**
  - `docs/adr/0012-decisiones-de-arranque.md:146`: "Toda respuesta real de la API en las pruebas se valida contra el archivo OpenAPI".
  - `apps/backend/test/contract.ts:61`: la validación es una función que cada prueba llama a mano.
  - `apps/backend/test/players.ts:47-59`: `actAs` envía las peticiones sin validar la respuesta.
  - Hay unas 285 peticiones en las pruebas y 83 llamadas a `expectMatchesContract`. `entry.test.ts`, `realtime.test.ts`, `match-realtime.test.ts` y `recovery.test.ts` no tienen ninguna.
  - Un ejemplo del Hito 6: en `admin.test.ts:432-444` las respuestas `current` (409, `GAME_VERSION_IS_CURRENT`) y `missing` (404) de `PUT /admin/games/{gameSlug}/versions/{gameVersion}/status` no se validan. Aun así, `docs/adr/0017-decisiones-del-hito-6.md:292` dice "todas las respuestas contra el contrato".
- **Problema.** Si cambia la forma de una respuesta que no se valida, como un error 409 o una página de la lista, ninguna prueba falla. Tampoco se sabe qué estados de cada operación no se han visto nunca: por ejemplo, si el 409 de `current-version` o el 400 de `GET /me/matches` se comprueban contra el esquema.
- **Propuesta.**
  1. Validar automáticamente en el único sitio por el que pasan las peticiones. `actAs` y `t.request()` envolverían la respuesta de supertest, por ejemplo con `.then()` o con una función `send()` común. La ruta real (`/api/v1/rooms/<uuid>/members/me`) se traduce a su plantilla del contrato con expresiones regulares generadas desde `openapi.paths`, cambiando cada `{param}` por `[^/]+`.
  2. Las respuestas a rutas que el contrato no tiene (`ROUTE_NOT_FOUND`, `METHOD_NOT_ALLOWED`, `/health`) se validan con `expectErrorEnvelope` o quedan en una lista explícita de excepciones.
  3. Anotar cada par operación y estado visto. Al terminar, el *teardown* global imprime los pares del contrato que nunca aparecieron. Al principio solo informa; más adelante se puede decidir que falle.
  4. Las llamadas manuales que ya existen se pueden quedar, o retirarse poco a poco.
- **Impacto.** Cubre todo lo que se separe del contrato en las respuestas reales, incluidos los errores. Cuesta alrededor de un día, sin dependencias nuevas (ajv y yaml ya están). Puede sacar a la luz diferencias reales, que habrá que resolver con autorización si tocan el contrato.
- **Relación.** ADR-012, decisión S7, punto 1. ADR-017, sección 15 (U10).
- **Clasificación:** contradice una decisión aprobada.

### PR-2. Los mensajes del canal en tiempo real no se comprueban contra el protocolo

- **Prioridad: media.** El protocolo está aceptado como contrato y es la mitad del producto, pero ninguna prueba comprueba la forma de lo que envía el servidor.
- **Evidencia.**
  - `apps/backend/test/realtime-client.ts:45-47`: `JSON.parse(String(data)) as Notification`, una conversión sin comprobación.
  - `packages/contracts/src/realtime.ts` solo tiene tipos, ningún esquema. Lo que se valida en ejecución son las órdenes del cliente (`protocol.ts`).
  - Las pruebas comprueban algunos campos con `toMatchObject` o `toEqual` en casos concretos.
- **Problema.** Un campo de más o de menos en `MATCH_UPDATED`, `ROOM_UPDATED` o `PLAYER_MATCH_UPDATED`, o un `serverTime` mal formado en un mensaje poco probado, pasa sin que nadie lo vea. TypeScript no lo detecta: el gateway arma los mensajes con un tipo `Outgoing` (`realtime.gateway.ts:736`), y lo que de verdad se envía es el resultado de `JSON.stringify` en ejecución, que nada comprueba.
- **Propuesta.** Escribir en `packages/contracts` esquemas Zod para las notificaciones del servidor, atados en compilación a los tipos que ya existen (`satisfies z.ZodType<Notification>`, igual que S7, punto 2). Después, validar con ellos cada mensaje que recibe `TestSocket`. Sin dependencias nuevas, porque Zod ya está. Más adelante, el frontend podría usarlos en desarrollo para avisar de un mensaje desconocido.
- **Impacto.** Cierra el mismo riesgo que PR-1, pero en el canal de tiempo real. Cuesta entre medio día y un día, según cuántas vistas haya que describir; la vista de cada juego va como `unknown`.
- **Relación.** `contracts/02-realtime.md`. ADR-012, S7, que hoy solo habla de la API.
- **Clasificación:** recomendación nueva.

### PR-3. Los temporizadores exactos de reloj y de abandono no tienen ninguna prueba directa

- **Prioridad: media.** Si dejan de funcionar, la revisión periódica lo tapa (cada 10 s en producción, cada 1 s en las pruebas en navegador), y ninguna prueba falla. El fallo de W2 demuestra que en estos bordes hay errores reales.
- **Evidencia.**
  - `turn-timers.ts:36` y `abandonment-watch.ts:57`: `if (this.config.environment === 'test') return;`. En las pruebas del servidor nunca se programa ningún temporizador.
  - `abandonment-watch.ts:62-70`: el aviso que se adelanta y se vuelve a poner (W2) solo lo recorre el navegador.
  - `e2e/support/database.ts:10-25` y `e2e/support/start-backend.mjs:76`: la prueba del tiempo agotado retrasa el turno en la base de datos y espera a la revisión periódica, que pasa cada segundo. El temporizador de la partida, puesto a 5 minutos, no llega a dispararse. **Nadie comprueba que `TurnTimers` dispare.**
  - `docs/adr/0014-decisiones-del-hito-3.md:304` dice "Hay una prueba de ese caso". Lo que existe es `matches.test.ts:628`: comprueba la operación cuando aún queda tiempo, pero no que se programe otro temporizador.
  - `docs/adr/0015-decisiones-del-hito-4.md:246` (W2): el fallo de un aviso que saltó un milisegundo antes de tiempo apareció al repetir la prueba en navegador.
- **Problema.** Un error al calcular el retraso, al cancelar el temporizador tras una jugada, al volver a ponerlo o en el límite de `MAX_DELAY_MS` haría que una partida se quede en 0:00 sin terminar hasta la siguiente revisión. Ninguna prueba lo detectaría.
- **Propuesta.** Pruebas unitarias de `TurnTimers` y `AbandonmentWatch`, creando las clases a mano con una configuración de entorno `development`, un `Clock` falso y `vi.useFakeTimers()`. Casos:
  - el aviso llega a la hora y no antes;
  - `cancel` y `forget` lo impiden;
  - volver a programar sustituye al anterior;
  - un aviso que llega antes de tiempo se vuelve a poner (W2);
  - un retraso mayor de 2³¹−1 ms se limita;
  - `onApplicationShutdown` lo limpia todo.

  Opcional: una prueba de `GameSessionsService` con los temporizadores encendidos, que compruebe que al confirmar una jugada se llama a `arm` con la nueva fecha límite. Sin dependencias.
- **Impacto.** Fija el comportamiento exacto de los relojes y del abandono que ve el usuario. Unas 2 a 3 horas.
- **Relación.** ADR-013, H8. ADR-014, K3 y sección 13. ADR-015, V1 y W2.
- **Clasificación:** recomendación nueva. La frase de ADR-014 sobre esa prueba es correcta solo en parte.

### PR-4. No hay una batería común que cualquier motor nuevo deba pasar

- **Prioridad: media.** Es lo que más ayuda a llevar la plataforma a varios juegos. Hoy, cada motor nuevo tendría que acordarse de probar por su cuenta las seis reglas del contrato.
- **Evidencia.**
  - `contracts/03-game-engine.md:154`: el asunto abierto "Comprobación automática de las seis reglas, en especial el aislamiento y el determinismo" sigue diciendo "La herramienta se elige al iniciar el Hito 1". S4 resolvió el aislamiento (análisis del código y dependency-cruiser). El determinismo, la inmutabilidad y que el estado se pueda serializar solo se comprueban a mano en `four-in-a-row/engine.test.ts:113`, `:121` y `:125`, y en el motor de prueba en `registry.test.ts:40`.
  - `packages/game-engine/src/engines.ts:11`: añadir un juego es añadirlo a `GAME_ENGINES`, sin ninguna comprobación común.
- **Problema.** Las reglas del contrato son de cumplimiento obligado: puro, determinista, inmutable, estado JSON, sin identidades, sin tiempo, y además `retireSeat` en juegos de dos (7.18), `restoreState` y que los eventos sean públicos (M8). Un motor nuevo puede romper alguna, por ejemplo modificar el estado que recibe o devolver una vista que no se puede serializar, y nada lo detecta hasta que falla en el servidor.
- **Propuesta.**
  1. En la entrada `testing` del motor, que ya existe, añadir `checkEngineConformance(engine, fixture)`. Es una función pura que devuelve la lista de incumplimientos y no depende de Vitest, así que el paquete sigue sin dependencias.
  2. `fixture` lo aporta cada juego: unas opciones válidas y una forma de proponer una acción a partir de la vista y de un número al azar. Hace falta porque el contrato no tiene `getAvailableActions` (M5).
  3. La comprobación juega varias partidas con un generador de azar con semilla escrito en el propio archivo (unas 10 líneas, sin dependencias) y verifica en cada paso:
     - los metadatos son coherentes (`minPlayers ≤ maxPlayers`, controles de tiempo dentro de los límites del esquema `timeControl`);
     - el mismo estado inicial con la misma semilla;
     - no cambia la entrada (se congela con `Object.freeze` en profundidad antes de cada llamada);
     - el mismo resultado al repetir la secuencia;
     - estado, vista y eventos sobreviven a `JSON.parse(JSON.stringify(x))`;
     - `restoreState(estado)` devuelve el mismo estado, y rechaza `null`, `[]` y `"x"`;
     - `getStatus`: los asientos activos son asientos válidos y, si terminó, hay un resultado por asiento;
     - `retireSeat` con cada motivo, en un juego de dos, termina el juego y gana el rival;
     - `applyAction` sobre un juego terminado responde `GAME_ALREADY_FINISHED`.
  4. Un archivo `engines.conformance.test.ts` recorre `GAME_ENGINES` y el motor de prueba.
  5. En el frontend, atar los textos de rechazo al tipo de los motivos de cada juego con `satisfies Record<FourInARowRejectionReason, string>`, que es un import de solo tipos y lo permite K7.
- **Impacto.** Cada juego nuevo hereda las comprobaciones con poco código propio. Cierra el asunto abierto del contrato del motor. Cuesta alrededor de un día.
- **Relación.** `contracts/03-game-engine.md`, secciones 1 y 7, y decisiones M5, M7, M8 y M11. ADR-001, condición 5.5. ADR-012, S4.
- **Clasificación:** recomendación nueva, más una incoherencia entre documentación y código: el asunto abierto sigue sin cerrar ni actualizar.

### PR-5. No se prueban las carreras entre operaciones distintas sobre la misma partida o sala

- **Prioridad: media.** El diseño se protege con bloqueos de fila y comprobaciones dentro de la transacción. Las carreras que se prueban son siempre de la misma operación contra sí misma, o del vencimiento contra una jugada.
- **Evidencia.**
  - Cubiertas: `matches.test.ts:466` (dos jugadas), `:483` (la misma petición), `:698` (vencimiento y jugada), y `rooms.test.ts:337`, `:582`, `:600`.
  - Sin prueba:
    - `resign` contra `submitAction` (`game-sessions.service.ts:365` y `:274`);
    - `abortByAdmin` contra una jugada (`:656`);
    - `abandonIfDue` contra una jugada (`:476`);
    - dos `setReady` simultáneos que completan la condición de inicio (`rooms.service.ts:279`), donde no debe crearse más de una partida;
    - `leave` del anfitrión contra `join` de otro (`rooms.service.ts:218`, `:253`).
  - La segunda barrera (`game-sessions.repository.ts:96`, regla 8.8 y `docs/04-flujos-y-persistencia.md`, sección 4, "Segunda barrera") no tiene prueba: con el bloqueo de fila nunca llega a actuar.
- **Problema.** Un cambio en el orden de los bloqueos o en las comprobaciones de una operación nueva, como las del administrador del Hito 6, puede producir dos finales, una partida en una sala cerrada o dos partidas para una sala, sin que ninguna prueba falle.
- **Propuesta.** Cinco pruebas con el patrón que ya existe (`Promise.allSettled` y consultas de comprobación):
  - como mucho una fila en `match_results` y un solo motivo;
  - `matches` de la sala igual a 1 después de dos "listo" simultáneos;
  - la sala nunca queda `WAITING` con su anfitrión fuera.

  Además, una prueba del repositorio que llame a `updateSession` con una versión esperada equivocada y compruebe que no cambia nada. Repetir cada carrera unas 20 veces dentro de la prueba aumenta la probabilidad de cruzarlas sin hacerla lenta.
- **Impacto.** Fija la regla 7.15 y la transacción única del final (8.14) frente a operaciones nuevas. Medio día.
- **Relación.** ADR-009, 7.15. ADR-010, 8.8 y 8.14. ADR-014, K8 (pedía las jugadas simultáneas, que sí están). ADR-017, U4 y U5.
- **Clasificación:** recomendación nueva.

### PR-6. Decisiones aprobadas que ninguna prueba fija: P1, P3 y W5

- **Prioridad: media.** Son decisiones aceptadas con efecto visible (permisos y relojes), y un cambio podría invertirlas sin que nada falle.
- **Evidencia.**
  - **P1** (`contracts/05-permissions.md`, sección 8): "El administrador no puede ver las partidas de otros". No hay ninguna prueba de `GET /matches/{id}` ni de `SUBSCRIBE_MATCH` hecha por un administrador que no juega. `admin.test.ts` solo prueba las rutas `/admin`.
  - **P3**: "Un administrador puede suspender a otro administrador, pero no a sí mismo". Solo se prueba lo segundo (`admin.test.ts:256-262`).
  - **W5** (`docs/adr/0015-decisiones-del-hito-4.md`, sección 13): en las partidas por turnos no se cuentan ausencias, pero su turno sí se desplaza tras una parada. `recovery.test.ts` solo usa partidas en tiempo real. En las pruebas por turnos de `matches.test.ts:880-983` no hay ni reinicio ni desconexión.
- **Problema.** En W5, una regresión descontaría a quien tiene el turno el tiempo de una parada larga en una partida de 12 horas, o la daría por perdida por abandono, cuando estar desconectado es lo normal por turnos (7.27).
- **Propuesta.** Cuatro pruebas:
  - un administrador que no juega recibe `PLAYER_NOT_IN_MATCH` por la API y por el canal (P1, y también P5);
  - un administrador suspende a otro (P3);
  - en una partida por turnos de Cuatro en raya, con los dos jugadores desconectados y el tiempo adelantado más allá de `MATCH_ABANDON_SECONDS`, `abandonDueMatches()` no aplica nada y `abandonAt` es `null`;
  - con el patrón `boot`/`shutDown` de `recovery.test.ts`, una parada de una hora no se descuenta a quien tiene el turno de una partida por turnos.
- **Impacto.** Una o dos horas.
- **Relación.** `contracts/05-permissions.md`, P1, P3 y P5. ADR-015, W5. ADR-009, 7.27 y 7.29.
- **Clasificación:** recomendación nueva. Son decisiones aprobadas sin prueba, aunque ninguna pedía una de forma expresa.

### PR-7. El orden único de comprobaciones solo se prueba en parte

- **Prioridad: baja.** P6 promete que "la misma petición recibe siempre el mismo error, y las pruebas pueden contar con ello". El código lo cumple en lo que se ha visto, pero no hay una prueba que lo recorra.
- **Evidencia.**
  - `contracts/05-permissions.md`, sección 7, y P6.
  - `contracts/02-realtime.md`, sección 4, pasos 1 a 7 de `SUBMIT_ACTION`.
  - Solo `entry.test.ts:111` ("el origen se comprueba antes que la sesión") y el permiso del administrador, que envía `{}` y recibe `FORBIDDEN` (`admin.test.ts:98`), comprueban un par de pasos.
  - No se prueba, por ejemplo: sin sesión y con cuerpo inválido, que debe dar `UNAUTHENTICATED`; un cuerpo inválido para una sala que no existe, que debe dar `VALIDATION_ERROR`; quien no es miembro de una sala cerrada, que debe dar `PLAYER_NOT_IN_ROOM` y no `ROOM_NOT_WAITING`; una jugada con versión antigua y el reloj agotado, que debe dar `STALE_STATE_VERSION` porque el paso 5 va antes que el 6.
- **Propuesta.** Una prueba en forma de tabla: cada fila arma una petición que falla en dos pasos a la vez y espera el código del primero. Lo mismo para `SUBMIT_ACTION`, con pares de pasos (4,5), (5,6) y (6,7).
- **Impacto.** Fija un contrato que el frontend usa para decidir qué mostrar. Unas 2 horas.
- **Relación.** `contracts/05-permissions.md`, P6. Protocolo, sección 4.
- **Clasificación:** recomendación nueva.

### PR-8. Faltan casos de la protección contra peticiones falsificadas

- **Prioridad: media.** Es seguridad. La protección la da una función de NestJS (`app.enableCsrfProtection`, `app.setup.ts:67`), cuyo comportamiento en estos casos no se ha comprobado aquí.
- **Evidencia.**
  - `entry.test.ts:73-80`: la prueba de `Sec-Fetch-Site: cross-site` envía también `Origin: https://otro.example`, así que no aísla la cabecera `Sec-Fetch-Site`.
  - No hay pruebas de:
    - una petición sin `Origin` y con `Sec-Fetch-Site: cross-site`;
    - `Origin: null`, el que envían los `iframe` aislados y algunas redirecciones;
    - una petición sin `Origin` ni `Sec-Fetch-*`, que el servidor **admite** por diseño, según la nota de `docs/adr/0017-decisiones-del-hito-6.md`, sección 15 (la que corrige la premisa de U2 sobre `curl`).
  - En el canal de tiempo real sí se prueba la apertura sin `Origin` (`realtime.test.ts:137`).
- **Problema.** Si una actualización de NestJS cambia cómo trata esas combinaciones, ninguna prueba lo detecta. Que se admitan las peticiones sin cabeceras de navegador es una decisión y debe quedar escrita en una prueba, para que no cambie sin querer.
- **Propuesta.** Tres pruebas en `entry.test.ts`, en el bloque "comprobación de origen". Las dos primeras esperan `ORIGIN_NOT_ALLOWED`; la tercera, que la petición llegue a ejecutarse. La fuerza bruta en el inicio de sesión y en la recuperación depende de los límites de frecuencia del Hito 7: cuando lleguen, el `429` del contrato y la reacción `WAIT` del cliente necesitan su prueba (sección 3).
- **Impacto.** Una hora.
- **Relación.** ADR-004, condición 5.3. ADR-017, nota de la sección 15. Matriz de permisos, sección 7, paso 1.
- **Clasificación:** recomendación nueva. Lo de la fuerza bruta ya está anotado como pendiente.

### PR-9. La cobertura de código no se mide

- **Prioridad: baja.** El mapa de huecos de este informe se hizo a mano. Una medida automática lo mantendría al día, pero con lo que hay no es urgente.
- **Evidencia.** `apps/backend/vitest.config.ts`, `apps/frontend/vitest.config.ts` y los paquetes no configuran `coverage`. No hay ningún proveedor de cobertura en las dependencias. `.github/workflows/ci.yml` no publica ningún informe.
- **Propuesta.** Añadir `@vitest/coverage-v8` como dependencia de desarrollo. La justificación: es del mismo proyecto que Vitest, usa la cobertura que ya trae V8 y no cambia cómo se escriben las pruebas. Solo informa: un resumen en el registro de GitHub y un artefacto HTML, **sin umbral** por ahora. Cuando haya una base, se puede fijar un umbral por paquete que impida bajar, más alto para `packages/game-engine`. La cobertura de las pruebas en navegador no compensa.
- **Impacto.** Hace visibles las ramas sin probar, como las de PR-3 y PR-12. Unas 2 horas y una dependencia de desarrollo que habría que aprobar.
- **Relación.** ADR-012, S18 (Vitest) y S23 (comprobaciones en cada pull request). Ninguna decisión trata la cobertura.
- **Clasificación:** recomendación nueva.

### PR-10. El aislamiento de la base de datos de pruebas depende de una lista a mano y de un orden en serie

- **Prioridad: baja.** Hoy funciona. Conviene arreglarlo antes de que crezcan las tablas y las pruebas.
- **Evidencia.**
  - `apps/backend/test/database.ts:11-29`: la lista de las 17 tablas que se vacían está escrita a mano. Si una migración añade una tabla y nadie la pone en la lista, sus filas pasan de una prueba a otra.
  - `entry.test.ts:198` y `recovery.test.ts:182` renombran tablas de la base de datos compartida y las restauran en un `finally`. Si el proceso se corta entre medias, la base queda rota. `global-setup.ts` aplica las migraciones pero no recrea la base, y las migraciones no reponen una tabla renombrada, así que las pruebas siguientes fallan sin una causa clara. Las pruebas en navegador sí crean la base de cero (`e2e/support/start-backend.mjs`).
  - `apps/backend/vitest.config.ts:9`: con `fileParallelism: false`, los 56 s crecen en línea recta con cada prueba nueva.
- **Propuesta.**
  1. Sacar la lista de tablas de `pg_tables` (esquema `public`, sin la tabla de migraciones de Drizzle).
  2. En `global-setup.ts`, borrar y crear la base de pruebas, con una guarda sobre el nombre parecida a la de `_e2e`, por ejemplo que termine en `_test`, y después migrar.
  3. Más adelante, si el tiempo molesta: una base por trabajador de Vitest, creada desde una plantilla migrada (`CREATE DATABASE … TEMPLATE`), para poder quitar `fileParallelism: false`.
- **Impacto.** Evita fallos que pasan de una prueba a otra y fallos que solo se dan en local. Las dos primeras medidas, una hora; la tercera, medio día.
- **Relación.** ADR-012, S11. ADR-014, sección 13 ("Las pruebas del backend vacían la base de datos después de migrar").
- **Clasificación:** recomendación nueva.

### PR-11. Pruebas en navegador: un fallo de la administración arrastra a la del reinicio, y el reintento puede tapar fallos intermitentes

- **Prioridad: baja.** El historial está limpio: 28 de 28 ejecuciones bien al primer intento, y en la última ninguna prueba *flaky*. El riesgo está en el diagnóstico cuando algo falle.
- **Evidencia.**
  - `e2e/tests/administracion.spec.ts:67-81`: retira Cuatro en raya del catálogo y lo vuelve a poner sin `try/finally` ni `afterEach`. En el grupo `reinicio`, que va de una en una, Playwright la ejecuta antes que `reinicio.spec.ts` (orden alfabético; en el registro de la última ejecución, la 17 y la 18). Si falla entre la línea 70 y la 81, el reintento falla también en `createRoom`, y la prueba del reinicio falla en `startMatch`. Se ven tres fallos y solo hay una causa.
  - `e2e/playwright.config.ts:22`: `retries: 1` en GitHub. Un fallo intermitente que pasa al segundo intento deja el trabajo en verde, y solo lo cuenta el resumen de Playwright.
- **Propuesta.**
  1. Volver a activar el juego en un `finally`, o en un `test.afterEach` del archivo, a través de la API del administrador.
  2. Ejecutar `reinicio` antes que `administracion`: dos grupos con `dependencies` en cadena, o renombrar los archivos.
  3. Hacer que el trabajo falle si alguna prueba solo pasó al reintentar (opción `failOnFlakyTests` de Playwright; comprobar que la versión 1.65 la tiene), o al menos que lo anote como aviso en la pull request.
- **Impacto.** Diagnósticos más claros y fallos intermitentes que no se esconden. Una hora.
- **Relación.** ADR-015, V6 y V12. ADR-017, Y8.
- **Clasificación:** recomendación nueva.

### PR-12. El catálogo de errores, en su sección 9, contradice K21 y L2, y su prueba no lo ve

- **Prioridad: baja.** El código sigue la decisión aprobada. El documento está desfasado y la prueba del catálogo no lee esa sección.
- **Evidencia.**
  - `contracts/04-error-catalog.md:165-166`: `GAME_ALREADY_FINISHED` e `INVALID_GAME_STATE` llegan al cliente como `INTERNAL_ERROR`.
  - `docs/adr/0014-decisiones-del-hito-3.md:226` (K21) y `:334` (L2): `GAME_ALREADY_FINISHED` se responde como `MATCH_NOT_IN_PROGRESS`, e `INVALID_GAME_STATE` anula la partida y quien envió la orden recibe `MATCH_NOT_IN_PROGRESS`.
  - El código hace lo de K21 (`game-sessions.service.ts:318-324`), y `matches.test.ts:995` exige `MATCH_NOT_IN_PROGRESS`.
  - `packages/contracts/src/errors.test.ts:27` solo lee las secciones 3 a 8 del documento.
  - Además, la rama `GAME_ALREADY_FINISHED` (`game-sessions.service.ts:318`) no tiene prueba.
- **Propuesta.**
  1. Corregir la sección 9 del catálogo para que diga lo de K21 y L2. Es un cambio de contrato y necesita autorización.
  2. Una prueba con un motor de prueba que responda `GAME_ALREADY_FINISHED` con la sesión aún activa, que espere `MATCH_NOT_IN_PROGRESS` y que no se guarde nada.
  3. Opcional: que `errors.test.ts` lea también la tabla de la sección 9 y la compare con una tabla de traducción en el código.
- **Impacto.** Coherencia del contrato. Una hora más el trámite de autorización.
- **Relación.** ADR-014, K21 y L2. `contracts/04-error-catalog.md`, sección 9.
- **Clasificación:** incoherencia entre documentación y código.

### PR-13. No se prueba el orden de los mensajes de una partida

- **Prioridad: baja.** El servidor los ordena con una cola por partida (`realtime.gateway.ts:708`, `inOrder`). El cliente tolera el desorden porque descarta las versiones antiguas, pero el protocolo promete que la suscripción termina con el último mensaje.
- **Evidencia.**
  - Las salas tienen su prueba (`realtime.test.ts:468`).
  - En partidas no hay ninguna que compruebe estas dos cosas:
    - que, en una secuencia rápida de jugadas de los dos jugadores, cada suscrito recibe `MATCH_UPDATED` con `stateVersion` siempre creciente;
    - que, después del mensaje final, no llega un aviso de presencia (`announceMatchPresence` lee la base de datos cuando le toca, `realtime.gateway.ts:587-604`).
- **Propuesta.** Una prueba en `match-realtime.test.ts`: los dos jugadores, cada uno con su conexión, juegan 10 o 12 jugadas sin esperar entre ellas mientras una tercera conexión del mismo jugador escucha. Se comprueba el orden de las versiones, que hay exactamente un mensaje con `status !== 'IN_PROGRESS'` y que es el último.
- **Impacto.** Fija la regla 8.9 y la decisión T3 del protocolo. Una hora.
- **Relación.** Protocolo, secciones 3 y 5. ADR-010, 8.9.
- **Clasificación:** recomendación nueva.

### PR-14. Hito 7: las pruebas que ya están anotadas, con lo que necesitarán

- **Prioridad: baja**, porque el Hito 7 no está autorizado.
- **Evidencia.**
  - `planning/decisiones-y-pendientes.md:125`: otros navegadores y el modo HTTPS.
  - `planning/backlog-mvp.md:122`: la PWA en el móvil.
  - `planning/backlog-mvp.md:147`: los límites de frecuencia.
  - `contracts/02-realtime.md:335`: el cierre 1008.
  - ADR-015, sección 11: la caída solo de la base de datos.
- **Propuesta**, para cuando se autorice:
  1. Las pruebas de los límites necesitarán un reloj controlable también en el limitador. Conviene que use el `Clock` inyectado.
  2. Los proyectos de Firefox y WebKit se pueden añadir solo para el grupo general: el reinicio y la administración no ganan nada con otro navegador.
  3. La caída solo de la base de datos se puede probar en el servidor parando la conexión del *pool* (como en `health.test.ts:28`) y comprobando qué ve el canal.
- **Clasificación:** ya anotado como pendiente.

### PR-15. Frontend: las pruebas solo llegan a las funciones puras

- **Prioridad: baja.** El reparto actual es razonable: la lógica que importa está en `utils/` y tiene pruebas, y las pruebas en navegador recorren las páginas.
- **Evidencia.**
  - Solo hay pruebas en `apps/frontend/app/utils/*.test.ts`.
  - Sin pruebas directas: `composables/` (unas 390 líneas, entre ellas `useRealtime.ts`, 148, y `useSession.ts`, 113), `pages/partidas/[matchId].vue` (382 líneas), `games/FourInARowBoard.vue` y `service-worker/sw.js` (96).
  - `sw.js` solo se prueba sin red (`aplicacion-instalable.spec.ts:43`). No se prueba el cambio de versión: borrar la caché anterior y no servir una `/_nuxt/` antigua tras publicar una nueva (Q1).
- **Propuesta.**
  1. No añadir por ahora `@nuxt/test-utils` ni `@vue/test-utils`, que serían dependencias nuevas.
  2. Seguir sacando a `utils/` la lógica con ramas que hoy está en las páginas y en los *composables*, como las decisiones de `useSession` al recibir `UNAUTHENTICATED`, y probarla allí.
  3. Separar en `sw.js` la decisión de qué cachés borrar y qué peticiones servir de la caché en funciones puras que se puedan probar con Vitest, o añadir una prueba en navegador que cargue dos versiones del service worker.
- **Impacto.** Cubre el riesgo de que una publicación deje a usuarios de la PWA con archivos antiguos. Medio día.
- **Relación.** ADR-016, N4 y Q1. ADR-012, S24.
- **Clasificación:** recomendación nueva.

### PR-16. Accesibilidad: ninguna decisión y ninguna comprobación

- **Prioridad: baja.** Ningún documento fija un requisito de accesibilidad. Las búsquedas de "accesib", "WCAG" y "teclado" en `docs/`, `contracts/` y `planning/` no encuentran nada que lo pida. Por eso no se puede tratar como un fallo.
- **Evidencia.** El uso de `getByRole` y `getByLabel` en las pruebas en navegador da algo de cobertura implícita: los botones de columna tienen rol y los campos tienen etiqueta. No hay ninguna prueba de teclado, de foco ni de anuncios de los cambios de turno para lectores de pantalla.
- **Propuesta.**
  1. Que quien decide resuelva si la accesibilidad entra en la revisión del Hito 7.
  2. Si entra, empezar sin dependencias: una prueba que juegue una partida solo con el teclado (`Tab` y `Enter` sobre las columnas) y `toMatchAriaSnapshot` del tablero y de los relojes, que Playwright ya trae.
  3. `@axe-core/playwright` sería una dependencia nueva que habría que justificar y aprobar.
- **Clasificación:** recomendación nueva.

### PR-17. Rendimiento y carga: sin pruebas, por una decisión aplazada

- **Prioridad: baja.**
- **Evidencia.**
  - `planning/decisiones-y-pendientes.md:81` y `:103`, y `docs/01-vision-alcance.md:115`: los requisitos medibles de capacidad y latencia se aplazaron con el alojamiento.
  - La única medida es la de ADR-014, sección 13: unos 65 ms por jugada de extremo a extremo, medidos una vez.
- **Propuesta.**
  1. Cuando se decida el alojamiento, escribir un script fuera de `pnpm test`, con el cliente `ws` que ya es dependencia de desarrollo del backend, que juegue N partidas a la vez y mida el tiempo de cada jugada hasta su `MATCH_UPDATED`, con su percentil 95.
  2. Mientras tanto, no añadir nada: un umbral de tiempo en GitHub sería inestable.
- **Clasificación:** ya anotado como pendiente.

---

## 3. Pendientes ya anotados que esta revisión confirma

| Pendiente | Dónde está anotado | Nota |
|---|---|---|
| Cierre 1008 por exceso de órdenes y límites de frecuencia (`429`, `RATE_LIMITED`) | Hito 7; `contracts/02-realtime.md:335` | El contrato ya declara `429` en 5 operaciones de autenticación y cuenta; ninguna prueba puede llegar a ese estado hoy (PR-1 lo señalaría como estado no visto) |
| Pruebas en otros navegadores y en el modo HTTPS | ADR-014, sección 13; `planning/decisiones-y-pendientes.md:125` | Ver PR-14 |
| Prueba a mano de la PWA en Chrome de escritorio y en el móvil | `planning/backlog-mvp.md:122` (N6) | Sin cambios |
| Caída solo de la base de datos, abandono en el móvil, varias instancias | ADR-015, sección 11 | Ver PR-14 |
| Cookie en Safari con un despliegue real | ADR-004; backlog, Hito 7 | Sin cambios |
| Requisitos de rendimiento | `planning/decisiones-y-pendientes.md:81` | Ver PR-17 |

## 4. Orden sugerido

1. **PR-1**: contradice S7 y es barato.
2. **PR-3, PR-5 y PR-6**: riesgos reales de relojes, de carreras y de decisiones aprobadas, todos sin dependencias.
3. **PR-4**: antes del segundo juego.
4. **PR-2 y PR-8**.
5. El resto (PR-7, PR-9 a PR-13, PR-15 y PR-16) cuando se toque esa zona. PR-9 necesita aprobar una dependencia.
