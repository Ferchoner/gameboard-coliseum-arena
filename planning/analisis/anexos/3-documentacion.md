# Análisis 3. Documentación y su coherencia con el código

Revisión estática, sin cambios en el repositorio ni en la carpeta compartida. Repositorio en `main` (d7719b5, con el Hito 6 fusionado en la PR #8). Fecha de la revisión: 2026-11-19.

Convenciones de este informe:

- Las rutas del repositorio son relativas a `/home/user/gameboard-coliseum-arena/`. Las de la carpeta compartida empiezan por `/mnt/project-files/`.
- **Aprobado** es lo que consta como decidido en un ADR, en `planning/decisiones-y-pendientes.md` o en el contexto aprobado del encargo. **Recomendado** es propuesta de este informe y no está decidido por nadie.
- Clasificación de cada hallazgo: «contradice una decisión aprobada», «incoherencia entre documentación y código», «incoherencia entre documentos», «recomendación nueva» o «ya anotado como pendiente».

---

## 1. Estado actual, en resumen

**Lo que está bien, comprobado en los dos lados:**

- **API REST.** Las 28 operaciones de `contracts/01-rest-api.yaml` coinciden con los controladores en ruta, método y código de estado (por ejemplo, `201` al registrarse, `202` al pedir la recuperación de contraseña, `204` al cerrar una sala o anular una partida desde administración). El contrato se valida en las pruebas con Ajv (`apps/backend/test/contract.ts`) y los esquemas Zod se comparan con el YAML (`packages/contracts/src/openapi.test.ts`).
- **Catálogo de errores.** Los 41 códigos de `contracts/04-error-catalog.md` coinciden con `packages/contracts/src/errors.ts`, y todos los que lanza el backend están en el catálogo.
- **Modelo de datos.** Las 17 tablas de `docs/03-dominio-datos.md` coinciden con el esquema de Drizzle y sus restricciones (correo en minúsculas, nombre de usuario único sin distinguir mayúsculas, versión vigente activa, suma de partidas en estadísticas, fila única de actividad del servidor). La comprobación de arranque de motores registrados existe (`apps/backend/src/modules/games/games.service.ts:60`). Hay 6 migraciones en `apps/backend/drizzle/`.
- **Protocolo de tiempo real.** Ruta `/realtime`, parámetro de versión, códigos de cierre y orden de comprobaciones de `SUBMIT_ACTION` coinciden con `packages/contracts/src/protocol.ts`, `packages/contracts/src/realtime.ts` y `apps/backend/src/modules/realtime/realtime.gateway.ts`.
- **Guía de administración** (`docs/guia-administracion.md`): coincide con el código (filtros, campo `engineRegistered`, respuestas).
- **Índice de ADR** (`docs/adr/README.md`): lista los 17 ADR, todos aceptados.

**Lo que falla, por orden de importancia:**

1. Dos decisiones del Hito 3 no se llevaron a los documentos que cambian: K2 (no hay copia en memoria de la partida) sigue contradicha en seis documentos, y K21/L2 (traducción de los códigos del motor) contradice el catálogo de errores, aunque el código sigue a K21. ADR-014 dice que ninguna decisión obliga a cambiar un contrato, y no es así.
2. El procedimiento escrito para añadir un juego no dice que llega **inactivo**, que es lo aprobado, y el único ejemplo que hay (la migración de Cuatro en raya) lo da de alta activo. No hay guía para añadir un juego.
3. `docs/04-flujos-y-persistencia.md` y partes de `docs/02-arquitectura.md` se quedaron en el Hito 3.
4. El README y el backlog dicen que el Hito 6 está "en revisión", cuando la PR #8 está fusionada. Los tres pendientes del Hito 7 que da el encargo no están juntos en ningún sitio, y uno (la prueba de la PWA en el móvil) sigue colgado del Hito 5.
5. La convención de ADR no se cumple: se cambian decisiones con anotaciones en línea y estados que la convención no prevé.
6. La carpeta compartida tiene once copias desactualizadas, nombres incoherentes y le faltan los ADR 001 a 011 y su índice. `auditoria/` y la copia antigua del repositorio no están marcadas como históricas.

---

## 2. Hallazgos

### DOC-1. La decisión K2 (sin copia en memoria) no se llevó a los documentos

- **Prioridad:** alta. Es la pieza central de la persistencia de partida. Quien lea la arquitectura o los flujos entiende un diseño (caché en memoria con recarga) que no existe, y diseñará sobre él el paso a varias instancias o los temporizadores.
- **Evidencia, lado de la decisión y el código:**
  - `docs/adr/0014-decisiones-del-hito-3.md:43` (K2): "Siempre en la base de datos. Cada jugada lo lee con un bloqueo de fila, lo cambia y lo guarda. No hay copia en memoria".
  - `docs/adr/0014-decisiones-del-hito-3.md:236` ya detectó el conflicto: "La arquitectura describe sesiones de juego cargadas en memoria [...] | K2".
  - `docs/02-arquitectura.md:133`, actualizado: "No hay copia en memoria: cada jugada lee la sesión de la base de datos con un bloqueo de fila".
- **Evidencia, lado de los documentos que no cambiaron:**
  - `docs/02-arquitectura.md:123` (regla 12): "La memoria es una caché de sesiones de juego que se reconstruye desde la base de datos". Contradice la línea 133 del mismo documento.
  - `docs/02-arquitectura.md:233`: "Hoy la serialización de jugadas, las suscripciones y los temporizadores viven en la memoria de un proceso". La serialización de jugadas la hace el bloqueo de fila de PostgreSQL.
  - `docs/01-vision-alcance.md:42`: "La memoria del servidor es solo una caché".
  - `docs/03-dominio-datos.md:395` ("Cargar una sesión en memoria o liberarla no cambia su estado guardado (7.22)") y `:416` ("el servidor descarta su copia en memoria de esa sesión y la vuelve a cargar (8.10)").
  - `docs/04-flujos-y-persistencia.md:18` ("sesiones de juego cargadas [...] Es una caché"), `:103` ("descarta su copia en memoria y la recarga", 8.10), `:140` ("un temporizador exacto para las sesiones cargadas en memoria"), `:161` ("Cada una se carga cuando alguien la necesita (7.22)").
  - `contracts/03-game-engine.md:29` (operación `restoreState`): "Al cargar en memoria".
  - Las reglas de origen siguen sin anotación: `docs/adr/0009-reglas-de-dominio.md:74` (7.22), `docs/adr/0010-persistencia-de-partida.md:36` (8.10) y `docs/adr/0007-linea-base.md:26` (B6, "La memoria del proceso es solo una caché de las sesiones de juego").
- **Problema:** K2 sustituye en la práctica 7.22 y 8.10 y precisa B6, pero ni esas reglas ni los documentos que las citan lo dicen. ADR-014 (`:245`) afirma que "Ninguno obliga a cambiar un contrato", y `contracts/03-game-engine.md` sí queda inexacto.
- **Propuesta (recomendada):** anotar con fecha en ADR-009 (7.22) y ADR-010 (8.10) "sustituida por ADR-014, K2"; precisar B6 en ADR-007 ("la memoria guarda conexiones, suscripciones, presencia y temporizadores; el estado de la partida, no"); reescribir la regla 12 y la sección 10 de `docs/02`, la fila de `docs/01:42`, `docs/03:395` y `:416`, y `docs/04:18`, `:103`, `:140` y `:161`; cambiar "Al cargar en memoria" por "Al leer la sesión de la base de datos" en `contracts/03-game-engine.md:29`. La última es un cambio de contrato documental: necesita autorización, igual que el resto de contratos (ADR-015, sección 13).
- **Impacto:** alto en comprensión; nulo en código.
- **Relación:** ADR-014 K2; ADR-009 7.22; ADR-010 8.10; ADR-007 B6.
- **Clasificación:** incoherencia entre documentos (y entre documentación y código, porque el código sigue a K2).

### DOC-2. K21 y L2 contradicen el catálogo de errores, y el código sigue a K21

- **Prioridad:** alta. Es un contrato publicado que dice lo contrario de lo que recibe el cliente.
- **Evidencia:**
  - `contracts/04-error-catalog.md:165`: `GAME_ALREADY_FINISHED` → "`INTERNAL_ERROR`. [...] indica un defecto del servidor y se registra".
  - `contracts/04-error-catalog.md:166`: `INVALID_GAME_STATE` → "`INTERNAL_ERROR`. Se registra. Si no puede recuperarse, la partida se anula".
  - `docs/adr/0014-decisiones-del-hito-3.md:226` (K21): "`GAME_ALREADY_FINISHED` se responde como `MATCH_NOT_IN_PROGRESS`. `INVALID_GAME_STATE` anula la partida (K12)". La línea `:334` (L2): quien envió la orden "recibe `MATCH_NOT_IN_PROGRESS`".
  - Código: `apps/backend/src/modules/game-sessions/game-sessions.service.ts:318-323`: `case 'GAME_ALREADY_FINISHED': throw matchNotInProgress();` y `case 'INVALID_GAME_STATE': case 'INVALID_SETTINGS':` anula con `abortForFailure` y responde `matchNotInProgress()`.
- **Problema:** K21 dice "Ninguna. Se anota porque el contrato del motor deja la traducción a la plataforma", pero la traducción ya estaba fijada en el catálogo (sección 9). Además el código trata `INVALID_SETTINGS` al aplicar una jugada igual que `INVALID_GAME_STATE`, y el catálogo (`:162`) solo contempla `INVALID_SETTINGS` al crear una sala.
- **Propuesta (recomendada):** que quien decide confirme K21/L2 como cambio de contrato; actualizar las filas `:165-166` del catálogo, añadir el caso de `INVALID_SETTINGS` en una jugada, y anotar en ADR-014 (sección de efectos, `:245`) que K21 sí cambia el catálogo. Añadirlo a "Durante la implementación" de `planning/decisiones-y-pendientes.md` mientras no se autorice.
- **Impacto:** medio; un cliente que confíe en el catálogo esperaría `INTERNAL_ERROR`.
- **Relación:** ADR-014 K21, K12 y L2; catálogo E4 y sección 9.
- **Clasificación:** incoherencia entre documentos, e incoherencia entre documentación y código.

### DOC-3. El procedimiento escrito para añadir un juego no dice que llega inactivo, y no hay guía

- **Prioridad:** alta. Es una decisión del contexto aprobado y el próximo juego se hará copiando lo que hay.
- **Evidencia:**
  - Aprobado: `planning/decisiones-y-pendientes.md:57`: "Un juego o una versión nuevos llegan con su motor, mediante una migración, y quedan **inactivos**. [...] Cuatro en raya, el primer juego, [...] entró ya activo". También `docs/guia-administracion.md:111`.
  - `packages/game-engine/src/engines.ts:7-9`: "Añadir un juego consiste en añadir aquí su motor y dar de alta el juego y su versión en la base de datos con una migración". No dice inactivo.
  - `apps/backend/drizzle/20261116061456_cuatro_en_raya/migration.sql:1-3` repite la misma instrucción y sus `INSERT` usan `'ACTIVE'` (líneas 10 y 17). Es la excepción aprobada, pero es el único ejemplo que se puede copiar.
  - `contracts/01-rest-api.md:221` y `contracts/05-permissions.md:113`: "se dan de alta al desplegar su motor", sin el estado inicial.
  - La decisión solo vive en "Decisiones sueltas" de `planning/decisiones-y-pendientes.md`, no en un ADR.
- **Problema:** quien añada el segundo juego copiando la migración lo publicará activo, en contra de lo aprobado. Tampoco hay una lista de pasos: motor, registro en `GAME_ENGINES`, metadatos y controles de tiempo, migración inactiva, pruebas del motor, activación por API, versión nueva frente a cambio de controles de tiempo (ADR-016, N1).
- **Propuesta (recomendada):** una guía `docs/guia-nuevo-juego.md` con esos pasos y una plantilla de migración con `'INACTIVE'`; corregir los comentarios de `engines.ts` y de la migración para que digan "inactivo, salvo el primer juego"; y añadir "llega inactivo" en `contracts/01-rest-api.md:221` y `contracts/05-permissions.md:113` cuando se autorice tocar contratos.
- **Impacto:** alto para el segundo juego; evita publicar un juego sin revisar.
- **Relación:** decisión suelta del 2026-11-16; ADR-014 K5; ADR-016 N1; API A5; ADR-017 U5 y Y4.
- **Clasificación:** incoherencia entre documentos, y recomendación nueva (la guía).

### DOC-4. `docs/04-flujos-y-persistencia.md` se quedó en el Hito 3

- **Prioridad:** media. Es el documento de flujos y lo citan los demás, pero no describe la mitad de los comportamientos actuales.
- **Evidencia:**
  - `docs/04-flujos-y-persistencia.md:119`: abandono "tras 2 minutos sin ninguna conexión del jugador (7.26)". Falta el margen de 5 segundos (ADR-015 V3, `docs/adr/0015-decisiones-del-hito-4.md:51`) y que solo pierde quien falta mientras algún rival está conectado (V2, `:50`).
  - `docs/04-flujos-y-persistencia.md:160`: "Desplaza [...] el turno en curso de todas las partidas". V4 (`docs/adr/0015-decisiones-del-hito-4.md:52`) lo hace por turno desde su último instante conocido, y `docs/03-dominio-datos.md:412` ya lo dice así.
  - `docs/04-flujos-y-persistencia.md:167`: "La reconexión y la recuperación son parte del resto del MVP, no del corte vertical". Están construidas desde el Hito 4.
  - No hay flujo de aviso de turno ni de la lista de mis partidas (Hito 5, N2 y N3), de recuperación de contraseña, de suspensión de cuenta (U4), de cambio de catálogo con cierre de salas (U5, Y4) ni de salida de sala (7.32).
  - La sección 2 se titula "Corte vertical" (`:27`), lo que fecha el documento.
- **Propuesta (recomendada):** actualizar las secciones 5 y 7 con V2, V3 y V4; quitar la línea 167; añadir flujos breves para turno por turnos, recuperación de contraseña, suspensión y cambio de catálogo, remitiendo a ADR-016 y ADR-017.
- **Impacto:** medio.
- **Relación:** ADR-015 V2, V3, V4; ADR-016 N2, N3; ADR-017 U4, U5, Y4; regla 7.32.
- **Clasificación:** incoherencia entre documentos.

### DOC-5. `docs/02-arquitectura.md`: fila superada, hitos que faltan y diagrama incompleto

- **Prioridad:** media.
- **Evidencia:**
  - `docs/02-arquitectura.md:181` (decisiones del Hito 2): "`matches` la implementa. `matches` conoce a `rooms`, y no al revés". K1 lo cambió, y el mismo documento lo dice en `:194`: "`game-sessions` dirige el inicio [...] se registra como iniciador en `rooms`". La fila de `:181` no lleva anotación de cambio.
  - La sección 8 tiene apartados para los Hitos 1 (`:159`), 2 (`:175`), 3 (`:188`) y 6 (`:201`). Faltan los Hitos 4 y 5; si no cambiaron la arquitectura, no lo dice (el Hito 5 añadió la PWA y el aviso de turno; el 4, la anotación de actividad del servidor).
  - Diagrama de la sección 3 (`:57-74`) y la frase "Las flechas indican quién usa a quién" (`:76`): faltan Partida → Plataforma (`game-sessions` usa `rooms`, `games` y `players`, K1, `:194`) y Plataforma (`admin`) → Partida (Y1, `:207`). `admin` está dentro de Plataforma, de modo que la flecha de Y1 tendría que salir de la caja que la recibe.
  - `docs/02-arquitectura.md:135`: "Contadores de los límites de frecuencia | Entrada | Se reinician", como si existieran. No hay límites de frecuencia en la API (ver DOC-9).
- **Propuesta (recomendada):** anotar `:181` como cambiada por K1; añadir "Hito 4" y "Hito 5" a la sección 8 aunque sea con "sin cambios de arquitectura" y los módulos nuevos (`mail`, `broadcast` ya figuran en la sección 4); completar el diagrama sacando `admin` a su propia caja y añadiendo las dos flechas; marcar la fila de `:135` como "Hito 7".
- **Impacto:** medio; el diagrama es lo primero que se lee.
- **Relación:** ADR-013 H1; ADR-014 K1; ADR-017 Y1; backlog Hito 7.
- **Clasificación:** incoherencia entre documentos, e incoherencia entre documentación y código (diagrama y contadores).

### DOC-6. El README y el backlog dicen que el Hito 6 está en revisión

- **Prioridad:** media. Es la primera línea del README.
- **Evidencia:** `README.md:5`: "el **Hito 6**, cuenta, estadísticas y administración por la API, está en revisión". `planning/backlog-mvp.md:139`: "Construido el 2026-11-19, en revisión en la PR #8". La PR #8 está fusionada en `main` (d7719b5).
- **Propuesta:** "fusionado el 2026-11-19 en la PR #8", y decir en el README que el Hito 7 no está autorizado.
- **Impacto:** bajo en código; medio en confianza en el estado.
- **Relación:** ADR-017.
- **Clasificación:** incoherencia entre documentación y código (estado del repositorio).

### DOC-7. Los pendientes del Hito 7 no están reunidos, y la prueba de la PWA en el móvil sigue en el Hito 5

- **Prioridad:** media. El contexto aprobado da tres pendientes del Hito 7: cierre con 1008, otros navegadores en las pruebas y prueba manual de la PWA en el móvil.
- **Evidencia:**
  - `planning/backlog-mvp.md:122`: "[ ] Probar a mano la instalación en Chrome de escritorio y en un móvil (N6)", dentro del Hito 5, que ADR-016 pedía hacer "antes de cerrar el hito" (`docs/adr/0016-decisiones-del-hito-5.md:147` y `:267`).
  - La lista del Hito 7 (`planning/backlog-mvp.md:147-152`) no incluye ni esa prueba, ni las pruebas en otros navegadores y en HTTPS, ni el cierre con 1008 como tarea propia (solo "Límites de frecuencia [...] del canal de tiempo real").
  - `planning/decisiones-y-pendientes.md` sí recoge otros navegadores (fila en "Durante la implementación", origen ADR-014 sección 13) y el 1008, pero no la prueba de la PWA.
  - Código: el 1008 está definido y no se usa (`packages/contracts/src/protocol.ts:22`, sin uso en `apps/backend/src`).
- **Propuesta:** mover la casilla de la línea 122 al Hito 7, anotando que se aplazó y cuándo, y añadir al Hito 7 las otras dos tareas. Añadir la prueba de la PWA a `planning/decisiones-y-pendientes.md`.
- **Impacto:** medio; evita que el Hito 5 parezca abierto o que la prueba se pierda.
- **Relación:** ADR-016 N6; ADR-014 sección 13; protocolo sección 9; contexto aprobado del Hito 7.
- **Clasificación:** ya anotado como pendiente (parcialmente), e incoherencia entre documentos (backlog frente a contexto aprobado).

### DOC-8. La convención de ADR no se cumple y dos documentos la describen distinto

- **Prioridad:** media. Afecta a cómo se sabe qué está vigente.
- **Evidencia:**
  - `docs/adr/README.md:38`: estados "**Propuesta**, **Aceptada**, **Sustituida por ADR-NNN** y **Obsoleta**". `:39`: "Una decisión aceptada no se reescribe. Si cambia, se añade un ADR nuevo que la sustituye y se actualiza el estado del anterior".
  - `planning/decisiones-y-pendientes.md:164`: "se anota el cambio con su fecha en el documento que la contiene, o se añade un ADR que la sustituye". Admite la anotación en línea que el índice no admite.
  - `docs/adr/0012-decisiones-de-arranque.md:5`: "Aceptada, con un cambio en S14"; `docs/adr/0013-decisiones-del-hito-2.md:5`: "Aceptada, con un cambio en H3". Estados fuera de la lista.
  - En la práctica, los ADR por hito cambian decisiones de otros sin que el estado del anterior cambie: K1 cambia H1, K2 cambia 7.22, 8.10 y B6 (DOC-1), K7 cambia una regla de S4.
  - Puntos aplazados que se cerraron más tarde sin anotar el origen: `docs/adr/0001-backend-nestjs.md:70-71` ("Se decide al iniciar el Hito 1"), `docs/adr/0006-*.md:33` ("propuesta pendiente de confirmación en ADR-004", confirmada en ADR-012), `docs/adr/0008-*.md:20` ("Resto del MVP | Hito 4 y trabajo adicional", que B1 repartió en los Hitos 4 a 7).
- **Propuesta (recomendada):** elegir una regla y ponerla igual en los dos sitios. La más simple con lo que ya se hace: admitir "Aceptada, modificada por ADR-NNN (decisiones X)" como estado, y en la decisión cambiada añadir una línea "*Cambiada el AAAA-MM-DD por ADR-NNN, X*". Añadir al índice una columna "Modificada por". Aplicarlo a 7.22, 8.10, B6, H1, S4, y a los aplazamientos de ADR-001, ADR-006 y ADR-008.
- **Impacto:** medio; hoy hay que leer todos los ADR posteriores para saber si una regla sigue vigente.
- **Relación:** índice de ADR; sección 6 de `planning/decisiones-y-pendientes.md`.
- **Clasificación:** incoherencia entre documentos.

### DOC-9. Los contratos describen como activos límites de frecuencia que no existen

- **Prioridad:** media. Un cliente o una revisión de seguridad tomaría la protección por hecha.
- **Evidencia:**
  - `contracts/01-rest-api.md:196-207`: tabla de límites y "Al superarlos, la API responde `429` con el código `RATE_LIMITED` y la cabecera `Retry-After`".
  - `contracts/05-permissions.md:147`: paso 2 del orden de comprobaciones, "Límite de frecuencia".
  - `contracts/02-realtime.md:335`: "Órdenes por conexión | 20 cada 10 segundos | `RATE_LIMITED`. Si se repite, cierre con el código 1008".
  - `docs/02-arquitectura.md:135` (DOC-5).
  - Código: no hay limitador en la API. Solo `apps/backend/src/common/errors/api-exception.filter.ts:48` traduce un `429` si llegara, y `apps/backend/src/modules/realtime/realtime.gateway.ts:457` limita el número de suscripciones por conexión, no la frecuencia de órdenes.
  - Pendiente: `planning/backlog-mvp.md:147` (Hito 7) y ADR-013 H9.
- **Propuesta:** hasta el Hito 7, una nota en cada una de esas secciones: "Previsto para el Hito 7; hoy no se aplica, salvo el límite de suscripciones por conexión".
- **Impacto:** medio.
- **Relación:** ADR-013 H9; backlog Hito 7.
- **Clasificación:** ya anotado como pendiente (la implementación), con incoherencia entre documentación y código (los contratos no lo dicen).

### DOC-10. El contrato de la API describe una protección CSRF más estricta que la que hay

- **Prioridad:** media. Toca a seguridad y ya se detectó en el Hito 6.
- **Evidencia:**
  - `contracts/01-rest-api.md:40`: "El servidor rechaza con `403` y el código `ORIGIN_NOT_ALLOWED` las peticiones que cambian algo y no vienen del origen del frontend".
  - Código: `apps/backend/src/app.setup.ts:68`, `app.enableCsrfProtection({ trustedOrigins: [...] })`, que admite las peticiones sin `Origin` ni `Sec-Fetch-*`.
  - `docs/adr/0017-decisiones-del-hito-6.md:286`: "la API no exige la cabecera `Origin` a `curl` [...] admite las que no traen ni `Origin` ni las cabeceras `Sec-Fetch-*`". `docs/guia-administracion.md:28` dice lo mismo.
- **Problema:** el ADR y la guía describen el comportamiento real; el contrato no.
- **Propuesta:** cambiar la fila de `:40` por "rechaza las que un navegador envía desde otro origen; las que no traen `Origin` ni `Sec-Fetch-*` (clientes que no son navegadores) se admiten y dependen de la cookie". Incluirlo en la revisión de seguridad del Hito 7 por si se decide endurecerlo.
- **Impacto:** medio.
- **Relación:** ADR-004 condición 5.3; ADR-017 sección 15.
- **Clasificación:** incoherencia entre documentación y código.

### DOC-11. Las descripciones del OpenAPI no recogen las decisiones del Hito 6

- **Prioridad:** media. El YAML es el contrato que se valida en las pruebas, pero las pruebas solo comprueban formas, no las descripciones.
- **Evidencia:**
  - `contracts/01-rest-api.yaml:978-983` (`adminSetUserStatus`): solo dice que se cierran sesiones y conexiones. Falta que sale de las salas en espera (U4, `docs/adr/0017-decisiones-del-hito-6.md:52`).
  - `:1139` (`adminSetGameStatus`) y `:1261` (`adminSetCurrentGameVersion`): no dicen que se cierran salas (U5, `:53`) ni la comprobación al empezar (Y4, `:309`).
  - `:426` y `:471` (`getPlayer`, `getPlayerStatistics`): "`PLAYER_NOT_FOUND`: no existe ningún jugador con ese nombre de usuario". Con U15 (`:206`) también responde así para una cuenta suspendida. `contracts/05-permissions.md:128` sigue diciendo que el perfil lo ve "Cualquier jugador", sin la excepción.
  - `:1073` (`adminAbortMatch`): "Si la partida ya estaba anulada, responde igual", y `:1096` define `409 MATCH_NOT_IN_PROGRESS` como "terminó o se anuló". Se contradicen dentro de la misma operación. El código (`apps/backend/src/modules/game-sessions/game-sessions.service.ts:661-662`, `abortByAdmin`) devuelve `204` si ya estaba anulada y `409` solo si terminó, como dice la guía (`docs/guia-administracion.md`, sección 4).
  - `:5`: título "Plataforma de Juegos de Mesa Online", frente a "en Línea" en el README. Trivial.
- **Propuesta:** añadir U4, U5/Y4 y U15 a las descripciones; dejar en `:1096` solo "la partida terminó"; añadir la excepción de U15 en `contracts/05-permissions.md:128`. Requiere autorización para tocar contratos.
- **Impacto:** medio para quien integre otro cliente.
- **Relación:** ADR-017 U4, U5, U15, Y4.
- **Clasificación:** incoherencia entre documentación y código.

### DOC-12. Los contratos de la API y de permisos dicen que el rol se da en la base de datos

- **Prioridad:** baja. La guía de administración lo explica bien.
- **Evidencia:** `contracts/01-rest-api.md:222` ("Se asigna directamente en la base de datos") y `contracts/05-permissions.md:112` ("Se hace en la base de datos (decisión A5)"). U3 (`docs/adr/0017-decisiones-del-hito-6.md:51`) creó la orden `pnpm admin:role <usuario> ADMIN`, que sí está en el README (`README.md:61`) y en `package.json:22`. ADR-017 `:219` reconoce que "no hay forma de hacerlo salvo con SQL".
- **Propuesta:** "No se hace por la API. Se hace con `pnpm admin:role` (ADR-017, U3)".
- **Relación:** API A5; ADR-017 U3.
- **Clasificación:** incoherencia entre documentos.

### DOC-13. El contrato del motor tiene líneas de antes del Hito 1 y los motivos de Cuatro en raya no están donde dice el catálogo

- **Prioridad:** baja en las líneas viejas; media en los motivos, porque el catálogo remite a un sitio que no existe.
- **Evidencia:**
  - `contracts/03-game-engine.md:13`: "El archivo vive por ahora en `contracts/`. Al iniciar el Hito 1 pasa al paquete del motor". Contradice `:6`, que ya da la ruta en `packages/game-engine/src/contract.ts`.
  - `:150`: "Los de la modalidad por turnos se añaden en el Hito 5". Hechos (ADR-016 N1).
  - `:154`: "La herramienta se elige al iniciar el Hito 1 (ADR-001)". Elegida: dependency-cruiser (ADR-012 S4).
  - `:76`: el ejemplo de juego dice que "Los nombres y valores definitivos se fijan al implementar el juego", y nadie volvió a ponerlos.
  - `contracts/04-error-catalog.md:168`: "Cada juego documenta los suyos junto a su motor". Los motivos de Cuatro en raya (`MALFORMED_ACTION`, `COLUMN_OUT_OF_RANGE`, `COLUMN_FULL`) solo están en ADR-014 K6 y en el código del motor (`packages/game-engine/src/games/four-in-a-row/`), sin un documento junto al motor.
- **Propuesta:** quitar o fechar `:13`, `:150` y `:154`; añadir un `README.md` en `packages/game-engine/src/games/four-in-a-row/` con reglas, controles de tiempo y motivos de rechazo, y que la guía de DOC-3 lo pida para cada juego.
- **Relación:** ADR-012 S4; ADR-014 K6; ADR-016 N1; catálogo E4.
- **Clasificación:** incoherencia entre documentos.

### DOC-14. El protocolo de tiempo real no recoge V2, el margen de 5 segundos, K17 ni C1

- **Prioridad:** baja. V2 y el margen ya están anotados como pendientes de contrato.
- **Evidencia:**
  - `contracts/02-realtime.md:295`: "un jugador sin ninguna conexión durante 2 minutos seguidos pierde por abandono". Sin margen de 5 s (V3) ni la excepción de V2. Anotado en `planning/decisiones-y-pendientes.md` ("Precisar en el protocolo el margen de desconexión y el abandono cuando faltan todos", origen ADR-015 sección 13).
  - `contracts/02-realtime.md:114`: `SUBSCRIBE_MATCH` → "`MATCH_SUBSCRIBED`, con el estado completo". No dice que con una partida terminada no queda suscripción (K17, `docs/adr/0014-decisiones-del-hito-3.md:222`, que en `:241` reconoce que "El protocolo no dice qué pasa").
  - `contracts/02-realtime.md:113` y `:115`: `UNSUBSCRIBE_*` lo puede pedir "Quien esté suscrito". C1 (`docs/adr/0013-decisiones-del-hito-2.md:265`) responde igual a quien no lo está.
  - `contracts/02-realtime.md:394`: "Se ajustan con datos reales tras el corte vertical". El corte vertical quedó atrás.
- **Propuesta:** incluir K17, C1 y la línea 394 en la misma tanda de cambios de contrato que V2 y V3.
- **Relación:** ADR-013 C1; ADR-014 K17; ADR-015 V2, V3, sección 13.
- **Clasificación:** ya anotado como pendiente (V2 y margen); incoherencia entre documentos (K17, C1, línea 394).

### DOC-15. `planning/decisiones-y-pendientes.md` no recoge todos los pendientes, y el README afirma algo que no se ha probado

- **Prioridad:** media para Windows (el README lo da por hecho); baja para el resto.
- **Evidencia:**
  - `README.md:24`: "Funciona en Windows, macOS y Linux". `docs/adr/0013-decisiones-del-hito-2.md:277` y `docs/adr/0014-decisiones-del-hito-3.md:353`: "Prueba en Windows. Todo se ejecutó en Linux | Al probarlo en el equipo de quien decide". La prueba en Windows no está en `planning/decisiones-y-pendientes.md` ni en el backlog.
  - `docs/adr/0016-decisiones-del-hito-5.md:206` y `:268`: "Cómo sirve el alojamiento `sw.js`, sin guardarlo en caché, y el manifiesto con su tipo | Con el alojamiento, en el Hito 7". No está en la lista de pendientes.
  - La contradicción de DOC-2 no figura como pendiente.
  - La implementación de los límites de frecuencia está en el backlog, pero en la lista de pendientes solo están sus "valores definitivos", con el texto "Tras el corte vertical, con datos reales".
- **Propuesta:** cambiar la frase del README por "Probado en Linux; en Windows y macOS está previsto pero sin probar", hasta que se pruebe; añadir a la lista de pendientes la prueba en Windows, `sw.js` en el alojamiento, la prueba de la PWA (DOC-7), K21 frente al catálogo (DOC-2) y la implementación de los límites; cambiar "Tras el corte vertical" por "Hito 7".
- **Relación:** ADR-013 y ADR-014, sección de pendientes; ADR-016 sección 12.
- **Clasificación:** ya anotado como pendiente (en los ADR, no en la lista común), e incoherencia entre documentos (README).

### DOC-16. La carpeta compartida tiene copias desactualizadas

- **Prioridad:** media. Quien lea la carpeta compartida sin el repositorio ve decisiones que ya cambiaron.
- **Evidencia (comparación archivo por archivo con `main`):**
  - **Iguales al repositorio:** `01-rest-api-v1.yaml`, `05-permissions-v1.md`, `adr-0012-decisiones-de-arranque.md`, `docs-01-vision-alcance.md`, `docs-04-flujos-y-persistencia.md`, `planning-cierre-hito-0.md`, `hito-5/ADR-016-*`, `hito-6/ADR-017-*` y `hito-6/guia-administracion.md`.
  - **Desactualizadas:**
    - `/mnt/project-files/entregables/README.md`: dice que el Hito 4 está autorizado y habla de "catorce decisiones".
    - `/mnt/project-files/entregables/docs-02-arquitectura.md` (194 líneas frente a 233): sin `mail` ni `broadcast`, sin K2 (dice "Se vuelven a cargar desde la base de datos al necesitarlas"), con la sección 8 "Lo que se decide al iniciar el Hito 1" sin cerrar.
    - `/mnt/project-files/entregables/03-dominio-datos-v1.md`: ajuste por caída anterior a V4 y sin 7.32.
    - `/mnt/project-files/entregables/01-rest-api-v1-notas.md`: cookie como "Propuesta pendiente" (`:37`) y salud "Se define al iniciar el Hito 1" (`:223`).
    - `/mnt/project-files/entregables/02-realtime-v1.md` y `02-realtime-v1.ts`: el `.ts` repite los tipos que hoy se importan del paquete del motor (ADR-012 S2).
    - `/mnt/project-files/entregables/03-game-engine-v1-notas.md`, `03-game-engine-v1.ts` (solo formato), `04-error-catalog-v1.md`.
    - `/mnt/project-files/entregables/ADR-014-decisiones-del-hito-3.md`: sin las anotaciones del 2026-11-18 y 2026-11-19.
    - `/mnt/project-files/entregables/adr-0013-decisiones-del-hito-2.md`: sin la anotación de H13.
    - `/mnt/project-files/entregables/hito-4/ADR-015-decisiones-del-hito-4.md`: sin la anotación de N5 (`:202` en el repositorio).
    - `/mnt/project-files/entregables/planning-backlog-mvp.md` (152 frente a 168 líneas) y `planning-decisiones-y-pendientes.md`: sin ADR-015 a ADR-017 en el índice ni sus pendientes; la segunda aún lista "Margen de espera antes de dar a un jugador por desconectado | Con la reconexión, en el Hito 4" y dice que "El Hito 4 y los siguientes no lo están" (autorizados).
- **Propuesta (recomendada):** decidir qué es la carpeta. Si es un archivo de entregas por hito, mover cada copia a la carpeta del hito en que se entregó y no tocarla más; si es un espejo del estado actual, regenerarla entera desde `main` en cada cierre de hito. En los dos casos, un `LEEME.md` que diga cuál y que la fuente de verdad es el repositorio.
- **Impacto:** medio.
- **Relación:** ninguna decisión aprobada regula esta carpeta.
- **Clasificación:** incoherencia entre documentos, con recomendación nueva (la regla).

### DOC-17. La carpeta compartida mezcla nombres y le faltan documentos

- **Prioridad:** baja.
- **Evidencia:**
  - Tres convenciones para los ADR: `adr-0012-*.md` y `adr-0013-*.md` en la raíz, en minúsculas y con cuatro cifras; `ADR-014-*.md` en la raíz, en mayúsculas y con tres; `ADR-015`, `ADR-016` y `ADR-017` dentro de `hito-4/`, `hito-5/` y `hito-6/`. ADR-013 y ADR-014 no están en `hito-2/` ni `hito-3/`, que solo tienen capturas.
  - Prefijos `docs-` y `planning-` en unos archivos y sufijo `-v1` en los contratos; `docs/03` se llama `03-dominio-datos-v1.md` sin prefijo, y choca con `03-game-engine-v1-*`.
  - Faltan los ADR 001 a 011 y el índice `docs/adr/README.md`; faltan `docs/auditoria/` en su versión del repositorio y una copia del contrato `01-rest-api.md` con ese nombre (está como `01-rest-api-v1-notas.md`).
  - `hito-4/` no tiene capturas, a diferencia de los Hitos 2, 3, 5 y 6. Las de `hito-2/` saltan números (1, 5, 6, 8, 9).
- **Propuesta (recomendada):** usar los nombres del repositorio (`docs/adr/0014-decisiones-del-hito-3.md`, etc.) o una carpeta por hito con la misma estructura de rutas; añadir los ADR 001 a 011 y el índice en una carpeta `hito-0/`.
- **Clasificación:** recomendación nueva.

### DOC-18. `auditoria/` y la copia antigua del repositorio no están marcadas como históricas

- **Prioridad:** baja. Pueden confundir a quien llegue nuevo, pero el repositorio ya conserva lo que vale.
- **Evidencia:**
  - `/mnt/project-files/auditoria/adr-borradores/ADR-001-*.md:6` a `ADR-005-*.md:6`: "Estado de este texto | Borrador pendiente de tu revisión. No está en el repositorio". Están en el repositorio, en `docs/adr/0001` a `0005`, con estado "Aceptada". `ADR-005-*.md:48`: "Estructura propuesta, pendiente de tu confirmación" (confirmada en ADR-012 S1).
  - `/mnt/project-files/auditoria/D2-orm-comparacion.md`, `D3-*`, `D4-*` y `P5-despliegue-y-requisitos.md` son versiones anteriores de `docs/auditoria/comparacion-*.md` y `despliegue-y-requisitos.md`, con otros nombres y pequeñas diferencias. `auditoria-consistencia-y-plan-de-cierre.md` también difiere de la del repositorio. `docs/auditoria/README.md:3` sí las declara históricas; la carpeta compartida no.
  - `P0`, `P6` a `P10` y `subdecisiones-por-confirmar.md` son propuestas del 2026-11-14, ya absorbidas en ADR-006 a ADR-011 (la última dice que se aprobaron las 28).
  - `/mnt/project-files/gameboard-coliseum-arena/README.md:3-4`: "implementación aún no iniciada", con fecha de corte 2026-11-13, y orden de lectura con `contracts/03-game-engine.ts` y `prompts/`, que no existen en el repositorio actual. Es la documentación previa a la auditoría.
- **Propuesta (recomendada):** mover las dos carpetas a `/mnt/project-files/archivo/` con un `LEEME.md` de una línea ("Anterior al Hito 0. Lo vigente está en el repositorio, `docs/adr/`"). No borrar nada, porque la auditoría cita los hallazgos C-01 a C-22 de ese material.
- **Clasificación:** recomendación nueva.

### DOC-19. Faltan documentos de proyecto

- **Prioridad:** baja; ninguno lo pide una decisión aprobada, salvo la guía de despliegue.
- **Evidencia:** no hay `CHANGELOG.md`, `CONTRIBUTING.md`, guía de despliegue, guía para añadir un juego (DOC-3), glosario propio ni documento de migraciones. El glosario está solo en ADR-011 sección 6. La guía de despliegue figura en el Hito 7 (`planning/backlog-mvp.md:149`, "Alojamiento, copias de seguridad, supervisión y guía de despliegue").
- **Propuesta (recomendada):**
  - **Guía para añadir un juego**: la más útil ahora, ver DOC-3.
  - **CONTRIBUTING**: lo que hoy está repartido entre el README, ADR-012 (S3, S4, S10) y `planning/decisiones-y-pendientes.md` sección 6: ramas, `pnpm check`, regla de dependencias, cuándo hace falta un ADR, que no se escribe código sin autorización del hito.
  - **CHANGELOG** por hito, con la PR y lo que cambió de contrato. Sustituiría a las líneas de estado del README y el backlog que se desactualizan (DOC-6).
  - **Glosario**: sacar ADR-011 sección 6 a `docs/glosario.md` y enlazarlo desde el README.
  - **Migraciones**: una sección en `docs/03` sobre cómo se crean (Drizzle Kit), cómo se nombran y que las de catálogo dan de alta los juegos inactivos.
  - **Despliegue**: se queda en el Hito 7, como está previsto.
- **Clasificación:** recomendación nueva (salvo despliegue: ya anotado como pendiente).

### DOC-20. Detalles del README y documentos históricos sin marcar

- **Prioridad:** baja.
- **Evidencia:**
  - `README.md:55`: "`pnpm db:migrate` | Aplica las migraciones pendientes". El script del backend ejecuta `dist/database/migrate.js` (`apps/backend/package.json:14`), así que hace falta construir antes, como el README sí advierte para `admin:role` (`:61`). `pnpm dev` lo hace solo.
  - `package.json:26` define `pnpm icons` (genera los iconos de la PWA) y el README no lo lista.
  - `planning/cierre-hito-0.md` es una foto del 2026-11-14 (por ejemplo, "la rama principal solo contiene la licencia", propuestas sin confirmar) y no dice que es histórica, pero el README la pone en el orden de lectura.
  - `contracts/01-rest-api.md:276`: "Hoy están escritas dos veces [...] Al iniciar el Hito 1 pasarán a definirse una sola vez". Ya se hizo (ADR-012 S2).
- **Propuesta:** añadir "Antes hay que construir" a `db:migrate`; añadir `pnpm icons`; una línea al principio de `cierre-hito-0.md` ("Documento histórico, no se mantiene") y sacarlo del orden de lectura o ponerlo al final; fechar o quitar `contracts/01-rest-api.md:276`.
- **Clasificación:** incoherencia entre documentación y código (README), incoherencia entre documentos (el resto).

---

## 3. Resumen por clasificación

| Clasificación | Hallazgos |
|---|---|
| Contradice una decisión aprobada | Ninguno en el código. DOC-3 pone en riesgo la decisión de los juegos inactivos, pero hoy no la incumple: Cuatro en raya es la excepción aprobada |
| Incoherencia entre documentación y código | DOC-2, DOC-5 (diagrama y contadores), DOC-6, DOC-9, DOC-10, DOC-11, DOC-20 |
| Incoherencia entre documentos | DOC-1, DOC-2, DOC-3, DOC-4, DOC-5, DOC-8, DOC-12, DOC-13, DOC-14, DOC-15, DOC-16 |
| Ya anotado como pendiente | DOC-7 (en parte), DOC-9 (implementación), DOC-14 (V2 y margen), DOC-15 (en los ADR), DOC-19 (despliegue) |
| Recomendación nueva | DOC-3 (guía), DOC-16 (regla de la carpeta), DOC-17, DOC-18, DOC-19 |

**Orden de trabajo recomendado.** Sin tocar contratos ni código, y sin autorización del Hito 7: DOC-6, DOC-1 (salvo `contracts/03`), DOC-4, DOC-5, DOC-7, DOC-8, DOC-15, DOC-20 y la guía de DOC-3. Con autorización para cambiar contratos, en una sola tanda: DOC-2, DOC-9, DOC-10, DOC-11, DOC-12, DOC-13, DOC-14 y las líneas de contrato de DOC-1 y DOC-3. La carpeta compartida (DOC-16 a DOC-18) depende de que quien decide diga para qué sirve.
