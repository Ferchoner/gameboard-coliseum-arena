# Análisis de la aplicación y tareas de mejora

| Campo | Valor |
|---|---|
| **Fecha** | 2026-11-19 |
| **Código analizado** | `Ferchoner/gameboard-coliseum-arena`, rama `main` en `d7719b5` (Hitos 1 a 6; el Hito 6 quedó fusionado en la PR #8) |
| **Método** | Cuatro revisiones independientes, solo de lectura: CI/CD, pruebas, documentación y desarrollo de videojuegos online. No se modificó código ni documentación, no se ejecutaron pruebas en local y solo se leyeron, en GitHub, los registros de las 28 ejecuciones del flujo "Comprobaciones" |
| **Estado de este documento** | **Plan aceptado el 2026-11-19** por quien decide: se trabaja por las tandas de la sección 8 y prevalecen K2 y K21/L2. Cada tanda que cambia contratos o código necesita su propia autorización. Las tareas no se dan por hechas hasta fusionarse |
| **Informes de cada especialista** | [anexos/1-cicd.md](anexos/1-cicd.md), [anexos/2-pruebas.md](anexos/2-pruebas.md), [anexos/3-documentacion.md](anexos/3-documentacion.md), [anexos/4-videojuegos-online.md](anexos/4-videojuegos-online.md) |

---

## 1. Conclusión

La base es sólida. El servidor es autoritativo de verdad: cada jugada se ordena con un bloqueo de fila en PostgreSQL y una comprobación de versión, las órdenes repetidas no se aplican dos veces, los relojes los mide siempre el servidor y se recuperan tras una parada, y al reconectar el cliente recibe el estado completo con la vista de su asiento. El monolito modular, el WebSocket nativo, las dos modalidades con reloj, el snapshot único con registro de jugadas y la separación de frontend y backend se respetan, y las reglas de dependencias se comprueban de forma automática. Hay unas 450 pruebas, con concurrencia real contra PostgreSQL, y las 28 ejecuciones de GitHub pasaron al primer intento.

Lo que se puede mejorar se reparte así:

- **Una sola contradicción del código con una decisión aprobada:** ADR-012 S7 pide validar toda respuesta de la API contra OpenAPI en las pruebas, y solo se valida una de cada tres (T-02).
- **Varias decisiones aprobadas que no se llevaron a los documentos que cambiaban,** sobre todo K2 (no hay copia de la partida en memoria) y K21/L2 (traducción de los códigos del motor), que hoy contradicen a otros documentos aprobados. El código sigue a la decisión más reciente en los dos casos. Quien decide tiene que confirmar qué texto prevalece (T-03 y T-04).
- **Riesgos reales antes de publicar,** casi todos en los bordes: la rama `main` no exige las comprobaciones (T-01), el canal en tiempo real no limita la frecuencia ni la cola de órdenes (T-06, ya previsto para el Hito 7), dos casos de red en el móvil que pueden costar una partida por abandono (T-18 y T-19), y nada impide que corran dos procesos del servidor a la vez durante un despliegue (T-20).
- **Piezas baratas ahora y caras después** para el segundo juego: guardar la semilla y las retiradas (T-21), no ofrecer un juego que el frontend no sabe mostrar (T-22), una batería común para cualquier motor (T-15) y la receta para añadir un juego que llegue inactivo (T-05).

---

## 2. Cómo leer las tareas

- **Prioridad.** *Alta*: conviene resolverla antes de seguir construyendo o antes de publicar. *Media*: riesgo real del MVP, o pieza que cuesta poco ahora y mucho después. *Baja*: mejora o asunto que solo importa a gran escala o con un juego que aún no existe.
- **Clasificación.**
  - **Contradice una decisión aprobada:** el código hace algo distinto de lo que dice una decisión aceptada.
  - **Desajuste con lo aprobado:** documentos aprobados que no coinciden con el código o entre sí. Corregirlos no cambia el comportamiento, pero algunos son contratos y necesitan autorización.
  - **Ya pendiente:** está anotado para el Hito 7, para el alojamiento o para cuando llegue un juego que lo necesite. La tarea solo añade lo nuevo que encontró el análisis.
  - **Recomendación:** propuesta nueva de este análisis; no la pide ninguna decisión.
- **Qué toca.** *Doc*: documentación que no es contrato. *Contrato*: `contracts/` o el OpenAPI, que necesita autorización expresa. *Código*, *Pruebas*, *CI*. *GitHub*: un ajuste del repositorio, sin archivos. *Dependencia*: añade un paquete y necesita justificación y aprobación (regla 5 del proyecto).
- **Origen.** Identificador del hallazgo en el informe del especialista: CI (CI/CD), PR (pruebas), DOC (documentación) y GO (videojuegos online). Cuando varios especialistas encontraron lo mismo, la tarea los junta.

---

## 3. Lista priorizada

| Id | Tarea | Prioridad | Clasificación | Qué toca | Origen | Esfuerzo aprox. | Cuándo |
|---|---|---|---|---|---|---|---|
| T-01 | Exigir las comprobaciones en la rama `main` | Alta | Recomendación | GitHub | CI-1 | 10 min | Ahora |
| T-02 | Validar todas las respuestas de la API contra OpenAPI | Alta | **Contradice una decisión aprobada** (S7) | Pruebas | PR-1 | 1 día | Ahora |
| T-03 | Llevar K2 (sin copia en memoria) a todos los documentos | Alta | Desajuste con lo aprobado | Doc, Contrato | DOC-1, GO-5 | 2 h | Ahora |
| T-04 | Resolver K21/L2 frente al catálogo de errores | Alta | Desajuste con lo aprobado | Contrato, Pruebas | DOC-2, PR-12 | 1 h | Ahora |
| T-05 | Receta y guía para añadir un juego que llegue inactivo | Alta | Desajuste con lo aprobado | Doc, comentarios de código, Contrato | DOC-3, GO-13, DOC-13, DOC-19 | Medio día | Antes del segundo juego |
| T-06 | Límites de frecuencia, tope de la cola y cierre 1008 | Alta (antes de publicar) | Ya pendiente (Hito 7), con parte nueva | Código, Contrato, Pruebas | GO-1, DOC-9, DOC-5 | 1 día | Hito 7; la nota en los contratos, ahora |
| T-07 | Instalar el navegador de las pruebas sin `--with-deps` | Media | Recomendación | CI | CI-2 | 15 min | Ahora |
| T-08 | Guardar las trazas de Playwright cuando algo falla | Media | Recomendación | CI | CI-3 | 30 min | Ahora |
| T-09 | Comprobar en CI que las migraciones siguen al esquema | Media | Recomendación | CI | CI-4 | 1 h | Ahora |
| T-10 | Fijar las acciones de GitHub por SHA y actualizarlas con Dependabot | Media | Recomendación | CI, GitHub | CI-5 | 30 min | Ahora |
| T-11 | Análisis de seguridad automático | Media | Recomendación (adelanta parte del Hito 7) | GitHub, CI | CI-6 | 1 h | Ahora o Hito 7 |
| T-12 | Pruebas directas de los temporizadores de reloj y de abandono | Media | Recomendación | Pruebas, Doc | PR-3 | 3 h | Ahora |
| T-13 | Pruebas de carreras entre operaciones distintas | Media | Recomendación | Pruebas | PR-5 | Medio día | Ahora |
| T-14 | Pruebas de las decisiones P1, P3 y W5 | Media | Recomendación | Pruebas | PR-6 | 2 h | Ahora |
| T-15 | Comprobar automáticamente cada motor: batería común y metadatos al arrancar | Media | Recomendación, con un asunto abierto del contrato sin cerrar | Pruebas, Código, Contrato | PR-4, GO-11, DOC-13 | 1 día | Antes del segundo juego |
| T-16 | Validar los mensajes del canal contra el protocolo | Media | Recomendación | Pruebas, `packages/contracts` | PR-2 | 1 día | Ahora |
| T-17 | Protección contra peticiones falsificadas: pruebas y texto del contrato | Media | Desajuste con lo aprobado | Pruebas, Contrato | PR-8, DOC-10 | 2 h | Ahora |
| T-18 | Conexiones medio abiertas y cierre 4003 en el móvil | Media | Recomendación | Código, Contrato | GO-2 | Unas horas | Con la prueba de la PWA en el móvil |
| T-19 | Plazo de respuesta por orden en el cliente | Media | Recomendación | Código | GO-3 | Unas horas | Con la prueba de la PWA en el móvil |
| T-20 | Impedir que corran dos procesos del servidor a la vez | Media | Recomendación (refuerza B7) | Código, Doc | GO-4 | Medio día | Antes del alojamiento |
| T-21 | Guardar semilla, opciones iniciales y retiradas de cada partida | Media | Desajuste con lo aprobado (M7) y recomendación | Código, Doc | GO-8 | 1 día | Antes del segundo juego |
| T-22 | No ofrecer un juego que el frontend no sabe mostrar | Media | Recomendación | Código, Doc | GO-9 | Unas horas | Antes del segundo juego |
| T-23 | Jugadas simultáneas: versión por asiento y reloj de otro asiento | Media | Ya pendiente, con parte nueva | Código, Contrato | GO-6 | 1–2 días | Con el primer juego simultáneo |
| T-24 | Más de dos jugadores: saber qué asientos están retirados | Media | Ya pendiente, con un defecto nuevo | Código | GO-7 | 1 día | Con el primer juego de 3 o más |
| T-25 | Poner al día `docs/02-arquitectura.md` y `docs/04-flujos-y-persistencia.md` | Media | Desajuste con lo aprobado | Doc | DOC-4, DOC-5 | Medio día | Ahora |
| T-26 | README: estado real del proyecto e instrucciones exactas | Media | Desajuste con lo aprobado | Doc | CI-11, DOC-6, DOC-15, DOC-20 | 30 min | Ahora |
| T-27 | Reunir los pendientes del Hito 7 y completar la lista de pendientes | Media | Desajuste con lo aprobado | Doc | DOC-7, DOC-15, CI-9, PR-14 | 1 h | Ahora |
| T-28 | Una sola convención para cambiar decisiones aceptadas | Media | Desajuste con lo aprobado | Doc | DOC-8 | 2 h | Ahora, antes de T-03 |
| T-29 | Tanda de enmiendas pendientes en los contratos | Media | Desajuste con lo aprobado | Contrato | DOC-11, DOC-12, DOC-13, DOC-14 | 2 h | Ahora |
| T-30 | Decidir para qué sirve la carpeta compartida y ordenarla | Media | Desajuste con lo aprobado | Carpeta compartida | DOC-16, DOC-17, DOC-18 | 1 h | Ahora |
| T-31 | Quitar del repositorio el enlace `apps/frontend/dist` | Baja | Recomendación (defecto) | Código | CI-7 | 10 min | Ahora |
| T-32 | No cancelar ejecuciones en `main` y no guardar el token en el clon | Baja | Recomendación | CI | CI-8 | 10 min | Ahora |
| T-33 | Condiciones del despliegue separado para el ADR de alojamiento | Baja (alta al decidir el alojamiento) | Ya pendiente (alojamiento aplazado) | Doc | CI-10 | Notas | Con el alojamiento |
| T-34 | Probar el orden único de comprobaciones | Baja | Recomendación | Pruebas | PR-7 | 2 h | Cuando se toque la zona |
| T-35 | Medir la cobertura de código | Baja | Recomendación | Dependencia, CI | PR-9 | 2 h | Cuando se apruebe la dependencia |
| T-36 | Aislar mejor la base de datos de las pruebas | Baja | Recomendación | Pruebas | PR-10 | 1 h | Cuando se toque la zona |
| T-37 | Pruebas en navegador: no arrastrar fallos y no esconder los intermitentes | Baja | Recomendación | Pruebas, CI | PR-11 | 1 h | Cuando se toque la zona |
| T-38 | Probar el orden de los mensajes de una partida | Baja | Recomendación | Pruebas | PR-13 | 1 h | Cuando se toque la zona |
| T-39 | Frontend: sacar lógica a funciones probables y probar el cambio de versión del service worker | Baja | Recomendación | Código, Pruebas | PR-15 | Medio día | Cuando se toque la zona |
| T-40 | Decidir si la accesibilidad entra en el MVP | Baja | Recomendación (sin decisión que la pida) | Decisión, Pruebas | PR-16 | Según se decida | Hito 7 |
| T-41 | Pruebas de rendimiento y carga | Baja | Ya pendiente (con el alojamiento) | Pruebas | PR-17 | 1 día | Con el alojamiento |
| T-42 | Contrato del tablero en el frontend para el segundo juego | Baja | Recomendación | Código | GO-10 | Unas horas | Antes del segundo juego |
| T-43 | Que repetir una rendición tras reconectar no muestre un error | Baja | Recomendación | Código | GO-12 | 1 h | Cuando se toque la zona |
| T-44 | Documentos de proyecto: CONTRIBUTING, CHANGELOG, glosario y migraciones | Baja | Recomendación | Doc | DOC-19 | Medio día | Cuando se decida |
| T-45 | Hoja de ruta tras el MVP: espectadores, repetición, emparejamiento y juego limpio | Baja | Ya pendiente en parte, y recomendación | Decisión | GO-14 | Según la pieza | Tras el MVP |

**Recuento.** 62 hallazgos de los especialistas (11 de CI/CD, 17 de pruebas, 20 de documentación y 14 de videojuegos online) quedan en 45 tareas sin duplicados: 6 de prioridad alta, 24 media y 15 baja. Una contradice una decisión aprobada, 11 son desajustes con lo aprobado, 5 ya estaban pendientes (con algo nuevo que añadir) y 28 son recomendaciones nuevas.

---

## 4. Lo que contradice decisiones aprobadas

### T-02. Validar todas las respuestas de la API contra OpenAPI

- **Origen:** PR-1.
- **Problema:** ADR-012, decisión S7, punto 1, dice: "Toda respuesta real de la API en las pruebas se valida contra el archivo OpenAPI" (`docs/adr/0012-decisiones-de-arranque.md:146`). La validación es una función que cada prueba llama a mano (`apps/backend/test/contract.ts:61`). Hay unas 285 peticiones en las pruebas y 83 validaciones; `entry.test.ts`, `realtime.test.ts`, `match-realtime.test.ts` y `recovery.test.ts` no tienen ninguna. ADR-017 (`:292`) también dice "todas las respuestas contra el contrato", y en `admin.test.ts:432-444` hay respuestas 404 y 409 sin validar.
- **Propuesta:** validar en el único sitio por el que pasan las peticiones (`actAs` y `t.request()`), traduciendo la ruta real a su plantilla del contrato. Las rutas fuera del contrato (`/health`, `ROUTE_NOT_FOUND`) van en una lista de excepciones. Anotar cada par operación y estado visto e imprimir al terminar los que nunca aparecieron, al principio solo como informe.
- **Impacto:** cualquier diferencia entre el contrato y las respuestas reales, incluidos los errores, hace fallar una prueba. Sin dependencias nuevas (Ajv y yaml ya están). Puede sacar a la luz diferencias reales, que habrá que resolver con autorización si tocan el contrato.
- **Relación:** ADR-012 S7; ADR-017, sección 15 (U10).

---

## 5. Desajustes con lo aprobado

Ninguno cambia el comportamiento de la aplicación. Varios son contratos: corregirlos necesita autorización expresa, como cualquier cambio de contrato (ADR-015, sección 13). Conviene hacer primero T-28, porque fija cómo se anota un cambio de decisión.

### T-03. Llevar K2 (sin copia en memoria) a todos los documentos

- **Origen:** DOC-1 y GO-5 (los dos especialistas lo encontraron por separado).
- **Problema:** ADR-014 K2 decidió que la partida está siempre en la base de datos: cada jugada la lee con un bloqueo de fila y "no hay copia en memoria". El código lo cumple. Pero seis documentos siguen describiendo una caché de sesiones que se carga y se recarga: `docs/02-arquitectura.md:123` (regla 12, que contradice la línea 133 del mismo documento) y `:233`, `docs/01-vision-alcance.md:42`, `docs/03-dominio-datos.md:395` y `:416`, `docs/04-flujos-y-persistencia.md:18`, `:103`, `:140` y `:161`, y `contracts/03-game-engine.md:29`. Las reglas de origen (7.22 en ADR-009, 8.10 en ADR-010 y B6 en ADR-007) no dicen que K2 las cambió, y ADR-014 (`:245`) afirma que ninguna decisión obliga a cambiar un contrato, lo que no es exacto. Además, `docs/04:128` describe la carrera entre jugada y vencimiento con un rechazo por versión, cuando en el código el segundo espera al bloqueo.
- **Propuesta:** anotar con fecha 7.22 y 8.10 como cambiadas por K2 y precisar B6 ("la memoria guarda conexiones, suscripciones, presencia y temporizadores; el estado de la partida, no"). Reescribir los pasajes citados. Sustituir la sección 10 de la arquitectura por la lista real de lo que impide tener varias instancias: presencia y ausencias en memoria, difusión dentro del proceso, fila única de actividad del servidor, límites por jugador contados por proceso y hora de cada máquina como fuente de tiempo.
- **Impacto:** alto en comprensión. Evita diseñar el paso a varias instancias o los temporizadores sobre una caché que no existe.
- **Relación:** ADR-014 K2; ADR-009 7.22; ADR-010 8.10; ADR-007 B6 y B7; `planning/decisiones-y-pendientes.md:156`. La línea de `contracts/03` necesita autorización.

### T-04. Resolver K21/L2 frente al catálogo de errores

- **Origen:** DOC-2 y PR-12.
- **Problema:** dos documentos aprobados se contradicen. El catálogo de errores (`contracts/04-error-catalog.md:165-166`) dice que `GAME_ALREADY_FINISHED` e `INVALID_GAME_STATE` llegan al cliente como `INTERNAL_ERROR`. ADR-014 K21 y L2 (`:226` y `:334`) dicen que se responden como `MATCH_NOT_IN_PROGRESS` y que `INVALID_GAME_STATE` anula la partida. El código sigue a K21 (`game-sessions.service.ts:318-324`, comprobado) y además trata `INVALID_SETTINGS` en una jugada igual que `INVALID_GAME_STATE`, caso que el catálogo no contempla. La prueba del catálogo (`errors.test.ts:27`) no lee esa sección, y la rama de `GAME_ALREADY_FINISHED` no tiene prueba.
- **Propuesta:** que quien decide confirme K21/L2 como cambio de contrato. Después, corregir las dos filas, añadir el caso de `INVALID_SETTINGS` en una jugada, anotar en ADR-014 que K21 sí cambia el catálogo, y añadir una prueba con un motor de prueba que responda `GAME_ALREADY_FINISHED`.
- **Impacto:** un cliente que confíe en el catálogo hoy esperaría un error distinto del que recibe.
- **Relación:** ADR-014 K21, K12 y L2; catálogo E4 y sección 9.

### T-05. Receta y guía para añadir un juego que llegue inactivo

- **Origen:** DOC-3, GO-13, DOC-13 (motivos de rechazo sin documento propio) y DOC-19 (falta la guía).
- **Problema:** la decisión del 2026-11-16 dice que un juego o una versión nuevos llegan con su motor e inactivos, y se activan desde administración; Cuatro en raya entró activo como excepción. Pero la receta escrita en el código (`packages/game-engine/src/engines.ts:7-9` y el comentario de `apps/backend/drizzle/20261116061456_cuatro_en_raya/migration.sql:1-3`) no menciona el estado, y la única migración de ejemplo inserta `'ACTIVE'`. Los contratos (`contracts/01-rest-api.md:221`, `contracts/05-permissions.md:113`) tampoco lo dicen. La decisión solo vive en "Decisiones sueltas" de `planning/decisiones-y-pendientes.md:57`, no en un ADR. Los motivos de rechazo de Cuatro en raya solo están en ADR-014 K6 y en el código, aunque el catálogo dice que cada juego los documenta junto a su motor.
- **Propuesta:** una guía `docs/guia-nuevo-juego.md` con los pasos (motor, registro en `GAME_ENGINES`, metadatos y controles de tiempo, migración inactiva, pruebas del motor, tablero en el frontend, desplegar y después activar) y una plantilla de migración con `'INACTIVE'`. Corregir los dos comentarios sin tocar la migración ya aplicada. Un `README.md` junto al motor de Cuatro en raya con reglas, controles de tiempo y motivos. Añadir "llega inactivo" a los dos contratos cuando se autorice.
- **Impacto:** quien añada el segundo juego copiando lo que hay lo publicaría activo, en contra de lo aprobado. Coste: medio día.
- **Relación:** decisión del 2026-11-16; ADR-014 K5 y K6; ADR-016 N1; API A5; ADR-017 U5, U16 y Y4. Relacionada con T-15 y T-22.

### T-17. Protección contra peticiones falsificadas: pruebas y texto del contrato

- **Origen:** PR-8 y DOC-10.
- **Problema:** `contracts/01-rest-api.md:40` dice que se rechazan las peticiones que cambian algo y no vienen del origen del frontend. El comportamiento real, que ADR-017 (sección 15) y la guía de administración sí describen, admite las que no traen ni `Origin` ni `Sec-Fetch-*` (clientes que no son navegadores, como `curl`). Además, la prueba de `Sec-Fetch-Site: cross-site` también envía un `Origin` ajeno, así que no aísla esa cabecera, y no hay pruebas de `Origin: null` ni de la petición sin cabeceras de navegador.
- **Propuesta:** corregir la línea del contrato para que diga lo que hace el servidor. Añadir tres pruebas: solo `Sec-Fetch-Site: cross-site`, `Origin: null` (las dos rechazadas) y sin cabeceras de navegador (admitida, como decisión escrita). Si se quiere endurecer, decidirlo en la revisión de seguridad del Hito 7.
- **Impacto:** seguridad. Fija en pruebas un comportamiento que una actualización de NestJS podría cambiar sin aviso. Una o dos horas.
- **Relación:** ADR-004, condición 5.3; ADR-017, sección 15; matriz de permisos, sección 7.

### T-21. Guardar semilla, opciones iniciales y retiradas de cada partida

- **Origen:** GO-8.
- **Problema:** el contrato del motor, M7, dice que "la semilla queda guardada con el estado", y ADR-010 (sección 7) presenta el registro como "la base para repetir o mostrar partidas más adelante". Pero la semilla se pasa al motor al crear el estado y no se guarda (`game-sessions.service.ts:213-217`, comprobado), y como el snapshot se sobrescribe, lo que queda es la posición actual del generador. Las opciones del juego viven en la sala, no en la partida, y las retiradas suben `stateVersion` sin dejar fila en `match_actions`. Cuatro en raya no tiene azar, así que hoy no se nota; con el primer juego de cartas o dados, las partidas jugadas no se podrán repetir ni auditar, y eso ya no tendrá arreglo.
- **Propuesta:** guardar al empezar la semilla y las opciones validadas, o directamente el estado inicial. Anotar las retiradas en el registro, con una columna de tipo o una tabla aparte con la misma secuencia. No es *event sourcing*: el snapshot sigue siendo la fuente de verdad (8.3).
- **Impacto:** permite repeticiones, revisar partidas disputadas y probar una versión nueva de un motor con partidas reales. Medio día o un día, con una migración.
- **Relación:** ADR-010, reglas 8.1 a 8.3 y sección 7; contrato del motor, M7; ADR-014 K11 y K16.

### T-25. Poner al día `docs/02-arquitectura.md` y `docs/04-flujos-y-persistencia.md`

- **Origen:** DOC-4 y DOC-5.
- **Problema:** `docs/04` se quedó en el Hito 3: el abandono no recoge el margen de 5 segundos (V3) ni que solo pierde quien falta mientras algún rival está conectado (V2); el ajuste tras una parada no es por turno (V4); dice que la reconexión "no es del corte vertical" cuando existe desde el Hito 4; y no tiene los flujos de aviso de turno, mis partidas, recuperación de contraseña, suspensión de cuenta, cambio de catálogo con cierre de salas ni salida de sala. En `docs/02`, la fila del Hito 2 (`:181`) está superada por K1 sin anotarlo, faltan los apartados de los Hitos 4 y 5, y al diagrama de la sección 3 le faltan las flechas de `game-sessions` hacia la plataforma (K1) y de `admin` hacia la partida (Y1).
- **Propuesta:** actualizar los dos documentos remitiendo a ADR-015, ADR-016 y ADR-017, anotar la fila superada y completar el diagrama sacando `admin` a su propia caja.
- **Impacto:** son los documentos que se leen primero. Medio día.
- **Relación:** ADR-013 H1; ADR-014 K1; ADR-015 V2, V3 y V4; ADR-016 N2 y N3; ADR-017 U4, U5, Y1 y Y4; regla 7.32. La fila de los límites de frecuencia (`docs/02:135`) va con T-06.

### T-26. README: estado real del proyecto e instrucciones exactas

- **Origen:** CI-11, DOC-6, DOC-15 (Windows) y DOC-20.
- **Problema:** el README (`:5`) y el backlog (`planning/backlog-mvp.md:139`) dicen que el Hito 6 está "en revisión", y la PR #8 está fusionada. El README dice que `pnpm check` es "todo lo que se comprueba en cada pull request", pero no incluye las pruebas en navegador. Dice "Funciona en Windows, macOS y Linux", y ADR-013 y ADR-014 anotan que solo se probó en Linux. `pnpm db:migrate` necesita compilar antes y no lo advierte, y falta `pnpm icons`.
- **Propuesta:** corregir esas líneas, decir que el Hito 7 no está autorizado y cambiar la frase de Windows por "probado en Linux; Windows y macOS previstos, sin probar" hasta que se pruebe.
- **Impacto:** el README es la primera fuente para quien llega. 30 minutos.
- **Relación:** ADR-012 S23; ADR-013 y ADR-014, pendientes; ADR-017.

### T-27. Reunir los pendientes del Hito 7 y completar la lista de pendientes

- **Origen:** DOC-7, DOC-15, CI-9 y PR-14.
- **Problema:** la casilla de la prueba a mano de la PWA en el móvil sigue dentro del Hito 5 (`planning/backlog-mvp.md:122`), y la lista del Hito 7 no incluye esa prueba, ni las pruebas en otros navegadores y en HTTPS, ni el cierre 1008 como tarea propia. A `planning/decisiones-y-pendientes.md` le faltan la prueba en Windows, cómo servir `sw.js` y el manifiesto en el alojamiento (ADR-016, sección 12), la prueba de la PWA, la contradicción de T-04 y la implementación de los límites de frecuencia, que aparece como "tras el corte vertical".
- **Propuesta:** mover la casilla al Hito 7 con la fecha del aplazamiento, añadir las tareas que faltan y completar la lista de pendientes. Anotar con cada pendiente de pruebas cómo entraría en CI sin alargar las pull requests (detalle en CI-9 y PR-14 de los anexos): otros navegadores en un trabajo aparte en `main` o programado, el modo HTTPS con una segunda compilación del frontend, el 1008 como prueba del servidor y la PWA en el móvil a mano.
- **Impacto:** evita que el Hito 5 parezca abierto y que algún pendiente se pierda. Una hora.
- **Relación:** ADR-016 N6; ADR-014, sección 13; ADR-013 H9; ADR-004.

### T-28. Una sola convención para cambiar decisiones aceptadas

- **Origen:** DOC-8.
- **Problema:** el índice de ADR (`docs/adr/README.md:38-39`) admite cuatro estados y dice que una decisión aceptada no se reescribe: se sustituye con un ADR nuevo y se cambia el estado del anterior. `planning/decisiones-y-pendientes.md:164` admite además anotar el cambio en el propio documento. En la práctica se usan estados que el índice no prevé ("Aceptada, con un cambio en S14") y los ADR de cada hito cambian decisiones de otros sin que el anterior lo diga (K1 cambia H1; K2 cambia 7.22, 8.10 y B6; K7 cambia una regla de S4). Para saber si una regla sigue vigente hay que leer todos los ADR posteriores.
- **Propuesta:** elegir una regla y escribirla igual en los dos sitios. La más simple con lo que ya se hace: admitir "Aceptada, modificada por ADR-NNN (decisiones X)", añadir en la decisión cambiada una línea con fecha y origen, y una columna "Modificada por" en el índice. Aplicarla a 7.22, 8.10, B6, H1 y S4, y a los aplazamientos que se cerraron después (ADR-001, ADR-006 y ADR-008).
- **Impacto:** saber qué está vigente sin leerlo todo. Dos horas. Conviene hacerla antes de T-03 y T-04.
- **Relación:** índice de ADR; `planning/decisiones-y-pendientes.md`, sección 6.

### T-29. Tanda de enmiendas pendientes en los contratos

- **Origen:** DOC-11, DOC-12, DOC-13 y DOC-14.
- **Problema:** los contratos no recogen varias decisiones aceptadas:
  - **OpenAPI:** `adminSetUserStatus` no dice que la suspensión saca de las salas en espera (U4); `adminSetGameStatus` y `adminSetCurrentGameVersion` no dicen que se cierran salas (U5) ni la comprobación al empezar (Y4); `getPlayer` y `getPlayerStatistics` no dicen que una cuenta suspendida responde como inexistente (U15); y `adminAbortMatch` se contradice dentro de la operación (el código, y la guía, devuelven `204` si ya estaba anulada y `409` solo si terminó).
  - **API y permisos:** dicen que el rol se asigna en la base de datos, y U3 creó `pnpm admin:role`. `contracts/05-permissions.md:128` no tiene la excepción de U15.
  - **Contrato del motor:** líneas de antes del Hito 1 (`contracts/03-game-engine.md:13`, `:150`, `:154`, `:76`).
  - **Protocolo:** no recoge V2 ni el margen de 5 segundos (ya anotados como pendientes), ni K17 (suscribirse a una partida terminada no deja suscripción), ni C1 (`UNSUBSCRIBE_*` responde igual a quien no está suscrito), y `:394` dice que los valores se ajustan "tras el corte vertical".
- **Propuesta:** autorizar y hacer todas estas enmiendas en una sola tanda, junto con las líneas de contrato de T-03, T-04, T-05, T-06 y T-17.
- **Impacto:** quien integre otro cliente lee hoy un contrato que no coincide con el servidor. Dos horas más la autorización.
- **Relación:** ADR-013 C1; ADR-014 K17; ADR-015 V2, V3 y sección 13; ADR-017 U3, U4, U5, U15 y Y4; API A5.

### T-30. Decidir para qué sirve la carpeta compartida y ordenarla

- **Origen:** DOC-16, DOC-17 y DOC-18.
- **Problema:** en `/mnt/project-files/entregables/`, 11 copias están desactualizadas respecto al repositorio (por ejemplo, `docs-02-arquitectura.md` sin K2 ni los módulos `mail` y `broadcast`, el `README.md` que dice que el Hito 4 está autorizado, y el backlog y la lista de pendientes sin ADR-015 a ADR-017). Conviven tres convenciones de nombres para los ADR, faltan los ADR 001 a 011 y su índice, y `hito-4/` no tiene capturas. `/mnt/project-files/auditoria/` (borradores marcados "pendiente de tu revisión" que ya son ADR aceptados) y `/mnt/project-files/gameboard-coliseum-arena/` (el repositorio de antes de la auditoría, "implementación aún no iniciada") no dicen que son históricos. Ninguna decisión regula esta carpeta.
- **Propuesta:** que quien decide elija qué es la carpeta. Si es un archivo de entregas, cada copia se mueve a la carpeta del hito en que se entregó y no se toca más. Si es un espejo del estado actual, se regenera entera desde `main` al cerrar cada hito. En los dos casos, un `LEEME.md` que diga que la fuente de verdad es el repositorio. Mover `auditoria/` y la copia antigua del repositorio a una carpeta `archivo/`, sin borrar nada, porque la auditoría cita ese material.
- **Impacto:** quien lea la carpeta sin el repositorio hoy ve decisiones que ya cambiaron. Una hora.
- **Relación:** ninguna decisión; afecta a la lectura de todos los ADR.

---

## 6. Ya pendientes, con lo nuevo que aporta el análisis

### T-06. Límites de frecuencia, tope de la cola y cierre 1008

- **Origen:** GO-1, DOC-9 y la fila `docs/02:135` de DOC-5.
- **Problema:** los contratos describen como activos unos límites de frecuencia que no existen (`contracts/01-rest-api.md:196-207`, `contracts/05-permissions.md:147`, `contracts/02-realtime.md:335`, `docs/02-arquitectura.md:135`). El código de cierre 1008 está definido y no se usa en ningún sitio del servidor (comprobado). Lo nuevo: la cola de órdenes de cada conexión no tiene tope, y con las 5 conexiones permitidas un solo jugador mantiene 5 transacciones a la vez, la mitad del *pool* de 10 conexiones a la base de datos. Con registro abierto, un script bastaría para que las jugadas de los demás esperen mientras sus relojes de 3 minutos siguen corriendo.
- **Propuesta:**
  - **Ahora, sin autorizar el Hito 7:** una nota en cada sección citada: "Previsto para el Hito 7; hoy no se aplica, salvo el límite de suscripciones por conexión".
  - **En el Hito 7:** un cubo de fichas por conexión con los valores del protocolo (20 órdenes cada 10 s) que responda `RATE_LIMITED`; un tope de órdenes pendientes por conexión; un contador de infracciones que cierre con 1008; como mucho una orden de juego en curso por jugador y partida, sumando todas sus conexiones; y los límites de la API con `429`. El limitador debe usar el reloj inyectado para poder probarlo.
- **Impacto:** cierra el modo más barato de degradar el servicio. Un día, todo dentro del módulo `realtime` y de la entrada de la API.
- **Relación:** ADR-013 H9; protocolo, sección 9 y T14; backlog, Hito 7; `planning/decisiones-y-pendientes.md:127`.

### T-23. Jugadas simultáneas: versión por asiento y reloj de otro asiento

- **Origen:** GO-6.
- **Problema:** con dos asientos activos, A y B juegan sobre la versión N; la de A pasa y la de B se rechaza con `STALE_STATE_VERSION` (anotado como asunto abierto en el protocolo, sección 12). Lo nuevo: si se agota el reloj de A, la jugada de B se rechaza con `CLOCK_EXPIRED` aunque a B le quede tiempo, porque `isDue` mira la fecha límite común. Esto no está anotado. El usuario quiere que el diseño no impida jugadas simultáneas.
- **Propuesta:** guardar por asiento la versión en la que pasó a estar activo y aceptar la jugada si la versión esperada es igual o posterior y el asiento sigue activo; el motor sigue validando la acción sobre el estado actual. En el vencimiento, retirar solo los asientos vencidos y evaluar en la misma transacción la jugada de quien sigue activo.
- **Impacto:** hace viable el primer juego simultáneo sin rehacer la capa de sesión. Uno o dos días, más una enmienda del protocolo (sección 4, paso 5).
- **Relación:** ADR-010 8.11; contrato del motor M10; modelo de datos R10; protocolo, sección 12.

### T-24. Más de dos jugadores: saber qué asientos están retirados

- **Origen:** GO-7.
- **Problema:** el contrato del motor prohíbe llamar a `retireSeat` sobre un asiento ya retirado, pero la plataforma no guarda qué asientos se retiraron: el conjunto solo existe dentro de la llamada. En una partida de 4 en la que C se rinde y la partida sigue, C podría rendirse otra vez o perder después por abandono, y las dos cosas llaman de nuevo a `retireSeat`. Además, el retirado cuenta como "rival conectado" para declarar el abandono de los demás. Es un defecto concreto dentro del pendiente ya anotado (ADR-015, W6). Aparte, una sala de un juego de 2 a 6 jugadores solo puede empezar llena.
- **Propuesta:** guardar los asientos retirados en la sesión, o que `getStatus` devuelva los que siguen participando, y filtrar con eso la rendición, el abandono, los vencimientos y el cálculo de rival conectado. Decidir si una sala puede empezar sin estar llena.
- **Impacto:** cumple el contrato con cualquier número de jugadores. Un día.
- **Relación:** contrato del motor M11; regla 7.18; ADR-015 W6; `rooms.service.ts:495`.

### T-33. Condiciones del despliegue separado para el ADR de alojamiento

- **Origen:** CI-10.
- **Problema:** el alojamiento está aplazado, pero decisiones ya aceptadas descartan opciones habituales de los proveedores: la cookie es solo del host de la API y CORS, la protección de origen y el WebSocket admiten un único origen exacto; el origen de la API queda fijado al compilar el frontend; las migraciones se aplican con una orden aparte; no hay etiquetas de versión.
- **Propuesta:** llevar al ADR de alojamiento estas condiciones: nada de vistas previas en los dominios gratuitos del proveedor; una compilación del frontend por entorno que falle si en producción el origen no es `https://`; el backend como artefacto inmutable; las migraciones como paso previo al arranque y compatibles con la versión anterior; despliegue de tipo "parar y arrancar" (ver T-20); y una etiqueta por cada versión desplegada.
- **Impacto:** evita elegir un alojamiento que choque con lo aceptado. Hoy son solo notas.
- **Relación:** ADR-004, condiciones 5.2 a 5.5; ADR-005; ADR-006; ADR-007 B6 y B7; ADR-012 S13; `docs/auditoria/despliegue-y-requisitos.md`.

### T-41. Pruebas de rendimiento y carga

- **Origen:** PR-17.
- **Problema:** los requisitos medibles de capacidad y latencia se aplazaron con el alojamiento; la única medida es la de ADR-014 (unos 65 ms por jugada, medida una vez).
- **Propuesta:** cuando se decida el alojamiento, un script fuera de `pnpm test`, con el cliente `ws` que ya existe, que juegue N partidas a la vez y mida el percentil 95 de cada jugada. Hasta entonces, nada: un umbral de tiempo en GitHub sería inestable.
- **Relación:** `planning/decisiones-y-pendientes.md:81` y `:103`; `docs/01-vision-alcance.md:115`; ADR-014, sección 13.

---

## 7. Recomendaciones nuevas

### T-01. Exigir las comprobaciones en la rama `main`

- **Origen:** CI-1.
- **Problema:** la API de GitHub devuelve `protected: false` para `main`. Las comprobaciones de S23 se ejecutan en cada pull request, pero nada impide fusionar con ellas en rojo o en curso, ni empujar directamente a `main`.
- **Propuesta:** un conjunto de reglas sobre `main` que exija pull request (con 0 aprobaciones, porque decide una sola persona), exija los dos trabajos ("Formato, análisis, dependencias, tipos y pruebas" y "Pruebas en navegador") y bloquee el empuje forzado y el borrado. Si se renombra un trabajo en `ci.yml`, hay que actualizar la regla.
- **Impacto:** las comprobaciones pasan de informativas a obligatorias. Diez minutos, sin archivos.
- **Relación:** ADR-012 S23, que complementa sin cambiarla. No se pudo ver si hay reglas a nivel de organización.

### T-07. Instalar el navegador de las pruebas sin `--with-deps`

- **Origen:** CI-2.
- **Problema:** en dos de 28 ejecuciones, el paso de instalar el navegador tardó 5 min 57 s y 3 min 23 s (normalmente unos 20 s). Lo lento no es Playwright: es `apt` descargando fuentes de idiomas asiáticos que estas pruebas no usan, a 72 kB/s. El trabajo tiene un límite de 15 minutos.
- **Propuesta:** `playwright install chromium`, sin `--with-deps`; el registro muestra que la imagen de GitHub ya trae las librerías que pide Chromium. Opcional, `--only-shell`, comprobando antes la prueba del service worker.
- **Impacto:** quita hasta 6 minutos de variación y el riesgo de agotar el tiempo por causas ajenas al código. Una línea.
- **Relación:** ADR-014 K8. Si se añade WebKit (T-27), ahí sí hará falta `--with-deps`.

### T-08. Guardar las trazas de Playwright cuando algo falla

- **Origen:** CI-3.
- **Problema:** la configuración genera trazas al reintentar y capturas al fallar (`e2e/playwright.config.ts:31-32`), pero el trabajo no las sube, así que se pierden; también la de una prueba que falla una vez y pasa al reintentar.
- **Propuesta:** un paso `actions/upload-artifact` (fijado por SHA) con `if: ${{ !cancelled() }}`, sobre `e2e/test-results/`, con `if-no-files-found: ignore` y 7 días de retención. Opcional, el informe HTML.
- **Impacto:** un fallo en GitHub se depura con la traza paso a paso en lugar de repetirlo a ciegas. Media hora.
- **Relación:** ADR-014 K8; ADR-015 V6.

### T-09. Comprobar en CI que las migraciones siguen al esquema

- **Origen:** CI-4. Se complementa con la sección de migraciones de T-44.
- **Problema:** un cambio en un esquema de Drizzle sin su migración compila, pasa los tipos y solo falla si alguna prueba toca justo eso. ADR-002 (5.3) pide que las migraciones se generen, se revisen y se versionen, pero nada comprueba que se hayan generado.
- **Propuesta:** un paso con `drizzle-kit check` y `drizzle-kit generate` que falle si se crea algo en `apps/backend/drizzle`. No se pudo ejecutar: hay que comprobar en una pull request que `drizzle-kit 1.0.0-rc.5` carga el esquema y que la migración con relleno escrito a mano no produce diferencias.
- **Impacto:** un olvido de migración se detecta en la pull request y no al desplegar; también sirve de red al pasar a Drizzle 1.0. Sin dependencias nuevas.
- **Relación:** ADR-002, condición 5.3; ADR-012 S8; `planning/decisiones-y-pendientes.md:128`.

### T-10. Fijar las acciones de GitHub por SHA y actualizarlas con Dependabot

- **Origen:** CI-5.
- **Problema:** `actions/checkout`, `actions/setup-node` y la de terceros `pnpm/action-setup` van por etiqueta, que se puede mover, y no hay nada que las actualice.
- **Propuesta:** fijarlas por SHA con la versión en un comentario y añadir `.github/dependabot.yml` solo para `github-actions`. Para npm no se recomiendan actualizaciones automáticas, porque el proyecto fija versiones comprobadas a propósito.
- **Impacto:** cierra la principal vía de cadena de suministro del propio flujo. Media hora y un par de pull requests al mes. Dependabot añade un proceso y necesita aprobación.
- **Relación:** ADR-012 S3 y S16.

### T-11. Análisis de seguridad automático

- **Origen:** CI-6.
- **Problema:** con contraseñas, sesiones y un canal en tiempo real, ninguna comprobación avisa de una vulnerabilidad conocida en una dependencia ni de un secreto subido por error. No se pudo ver si ya están activados los ajustes del repositorio.
- **Propuesta, de menor a mayor coste:** activar en GitHub las alertas de Dependabot, el escaneo de secretos y la protección al empujar; activar la configuración por defecto de CodeQL (gratis en repositorios públicos; en privados necesita licencia); y una auditoría de dependencias de producción en un flujo semanal, no en cada pull request.
- **Impacto:** detección temprana. Los dos primeros, minutos; el tercero, un flujo pequeño.
- **Relación:** adelanta parte de la "Revisión de seguridad" del Hito 7 (`planning/backlog-mvp.md:148`). Son ajustes y no código del hito, pero conviene aprobarlos.

### T-12. Pruebas directas de los temporizadores de reloj y de abandono

- **Origen:** PR-3.
- **Problema:** `TurnTimers` y `AbandonmentWatch` no programan nada en el entorno de pruebas, y la prueba en navegador del tiempo agotado se resuelve por la revisión periódica. Si el temporizador exacto dejara de funcionar, la revisión lo taparía y ninguna prueba fallaría; la partida se quedaría en 0:00 hasta 10 segundos. El fallo W2 del Hito 4 muestra que en estos bordes hay errores reales. ADR-014 (`:304`) dice "hay una prueba de ese caso", y es correcto solo en parte.
- **Propuesta:** pruebas unitarias con temporizadores falsos: el aviso llega a su hora y no antes, cancelar lo impide, reprogramar sustituye, el aviso adelantado se vuelve a poner, el límite de `MAX_DELAY_MS` y la limpieza al apagar. Corregir la frase de ADR-014.
- **Impacto:** fija el comportamiento de los relojes que ve el jugador. Unas 3 horas.
- **Relación:** ADR-013 H8; ADR-014 K3 y sección 13; ADR-015 V1 y W2.

### T-13. Pruebas de carreras entre operaciones distintas

- **Origen:** PR-5.
- **Problema:** se prueban dos jugadas a la vez, la misma petición dos veces y el vencimiento contra una jugada, pero no rendición, anulación del administrador o abandono contra una jugada, dos "listo" simultáneos que completan la sala, ni la salida del anfitrión contra una entrada. La segunda barrera de la versión (8.8) no tiene prueba.
- **Propuesta:** cinco pruebas con el patrón que ya existe, que comprueben como mucho un resultado por partida, una sola partida por sala y que la sala no quede esperando sin anfitrión; y una prueba del repositorio con una versión esperada equivocada.
- **Impacto:** protege la transacción única del final frente a operaciones nuevas, como las del administrador del Hito 6. Medio día.
- **Relación:** ADR-009 7.15; ADR-010 8.8 y 8.14; ADR-017 U4 y U5.

### T-14. Pruebas de las decisiones P1, P3 y W5

- **Origen:** PR-6.
- **Problema:** tres decisiones aprobadas sin prueba: un administrador que no juega no puede ver partidas ajenas (P1); un administrador puede suspender a otro (P3, solo se prueba que no a sí mismo); y por turnos no hay abandono, pero el turno sí se desplaza tras una parada (W5). Una regresión en W5 descontaría una parada a quien tiene el turno, o le daría por perdida una partida de 12 horas.
- **Propuesta:** cuatro pruebas, una por caso, más la de la parada en una partida por turnos.
- **Impacto:** una o dos horas.
- **Relación:** `contracts/05-permissions.md` P1, P3 y P5; ADR-015 W5; ADR-009 7.27 y 7.29.

### T-15. Comprobar automáticamente cada motor: batería común y metadatos al arrancar

- **Origen:** PR-4, GO-11 y el asunto abierto de `contracts/03-game-engine.md:154` (DOC-13).
- **Problema:** el contrato del motor tiene reglas de obligado cumplimiento (puro, determinista, no modifica la entrada, estado JSON, `retireSeat` en juegos de dos, `restoreState`, eventos públicos), y cada motor las prueba a su manera; añadir un juego es añadirlo a `GAME_ENGINES` sin comprobación común. El asunto abierto sobre comprobar esas reglas sigue diciendo "se elige al iniciar el Hito 1". Además, la regla 7.2 (hasta 30 minutos en tiempo real; 12, 24 o 36 horas por turnos) solo vive en los documentos: un motor podría declarar 60 minutos o `minPlayers > maxPlayers` y entraría en el catálogo.
- **Propuesta:** una función `checkEngineConformance(engine, fixture)` en la entrada de pruebas del paquete del motor, sin depender de Vitest, que juegue partidas con un generador con semilla y verifique cada regla; un archivo de prueba que la pase a todos los motores. Al registrar los motores, validar los metadatos contra la regla 7.2 y no arrancar si no se cumplen, como ya pasa con un motor que falta. Cerrar el asunto abierto del contrato.
- **Impacto:** cada juego nuevo hereda las comprobaciones. Un día. Sin dependencias.
- **Relación:** contrato del motor, secciones 1 y 7, M5, M7, M8 y M11; ADR-001, condición 5.5; ADR-012 S4; ADR-009 7.2 y 7.7; ADR-016 N1.

### T-16. Validar los mensajes del canal contra el protocolo

- **Origen:** PR-2.
- **Problema:** el cliente de pruebas convierte cada mensaje del servidor a su tipo sin comprobarlo, y `packages/contracts` solo tiene tipos para las notificaciones, sin esquemas. Un campo de más o de menos en `MATCH_UPDATED` o `ROOM_UPDATED` pasaría sin que nadie lo vea.
- **Propuesta:** esquemas Zod de las notificaciones del servidor, atados en compilación a los tipos existentes como en S7, y validar con ellos cada mensaje que recibe el cliente de pruebas.
- **Impacto:** cierra en el canal el mismo riesgo que T-02 en la API. Medio día a un día. Zod ya está.
- **Relación:** `contracts/02-realtime.md`; ADR-012 S7, que hoy solo habla de la API.

### T-18. Conexiones medio abiertas y cierre 4003 en el móvil

- **Origen:** GO-2.
- **Problema:** una conexión muerta tarda hasta 50 s en descartarse. En el móvil, cada cambio de red deja una conexión medio abierta que sigue contando, y unos pocos cortes llenan el cupo de 5. Entonces se cierra con 4003 la conexión nueva, la buena, y el cliente deja de reintentar (4003 está entre los cierres sin reconexión, comprobado). En tiempo real, el jugador acaba perdiendo por abandono aunque esté mirando la partida.
- **Propuesta:** en el servidor, al llegar al límite, descartar primero las conexiones del jugador que no respondieron al último latido y, si sigue lleno, cerrar la más antigua en vez de la nueva. O, en el cliente, reintentar con espera larga tras un 4003 si hay una partida en tiempo real en curso. La primera cambia el significado de 4003 y necesita enmendar el protocolo.
- **Impacto:** evita derrotas injustas en el móvil. Unas horas. Conviene revisarla con la prueba pendiente de la PWA en el móvil.
- **Relación:** protocolo, sección 2 y T14; regla 7.25; ADR-015 V3 y V11; ADR-016 N5.

### T-19. Plazo de respuesta por orden en el cliente

- **Origen:** GO-3.
- **Problema:** en una conexión medio abierta, enviar no falla. La jugada se pierde, el tablero se queda "enviando" y el cliente solo lo nota tras dos latidos, hasta 50 s, mientras el reloj corre en el servidor. Con 3 minutos por jugador, eso decide la partida. ADR-015 V11 descartó bajar el latido a 10 s.
- **Propuesta:** un plazo por orden de juego en el cliente, por ejemplo 5 s. Si vence, reconectar de inmediato y reenviar con el mismo `requestId`, que el servidor ya trata como idempotente. No cambia el protocolo ni el latido.
- **Impacto:** el caso peor pasa de unos 50 s a unos 5 s. Unas horas.
- **Relación:** protocolo, sección 2 y T9; ADR-015 V11; ADR-010 8.12.

### T-20. Impedir que corran dos procesos del servidor a la vez

- **Origen:** GO-4.
- **Problema:** la decisión aprobada es una sola instancia (B7), pero nada lo garantiza, y muchos alojamientos arrancan el proceso nuevo antes de parar el viejo. Con dos procesos, la presencia está en la memoria de cada uno: uno marca ausente a quien está conectado al otro y lo declara perdedor por abandono a los 2 minutos; los avisos de uno no llegan a los suscritos del otro; y cada arranque desplaza los relojes de todas las partidas.
- **Propuesta:** tomar al arrancar un `pg_advisory_lock` en una conexión dedicada, antes de la recuperación tras la parada, y escribir en el ADR de alojamiento que el despliegue es de tipo "parar y arrancar".
- **Impacto:** convierte una convención en algo que el sistema garantiza. Medio día.
- **Relación:** ADR-007 B7; ADR-015 V1, V4 y V10; ADR-003, condición 5.7; T-33.

### T-22. No ofrecer un juego que el frontend no sabe mostrar

- **Origen:** GO-9.
- **Problema:** activar un juego solo comprueba que su motor esté registrado. Si se activa antes de desplegar el frontend con su tablero, o mientras alguien tiene abierta una versión anterior de la aplicación, se pueden crear salas y empezar partidas que nadie puede jugar: se muestra "juego desconocido" y el reloj corre hasta perder. Pasa también con una versión nueva del motor que cambie la vista, porque el tablero se elige solo por nombre del juego.
- **Propuesta:** que el frontend ofrezca solo los juegos que sabe mostrar y, ante uno desconocido, sugiera recargar; elegir el tablero por juego y versión mayor; y escribir en la guía de administración el orden: desplegar el frontend, comprobar y después activar.
- **Impacto:** evita partidas imposibles que cuentan en las estadísticas. Unas horas, sin cambios de contrato.
- **Relación:** decisión del 2026-11-16; ADR-004 (alojamiento separado); ADR-016 N4; ADR-017 U5; T-05.

### T-31. Quitar del repositorio el enlace `apps/frontend/dist`

- **Origen:** CI-7.
- **Problema:** está versionado un enlace simbólico que apunta a `/home/user/gameboard-coliseum-arena/apps/frontend/.output/public` (comprobado). `.gitignore` excluye `dist/` con barra, que no cubre un enlace. En otra máquina no apunta a nada; en Windows sin enlaces simbólicos sale como archivo de texto; y ensucia el árbol tras compilar.
- **Propuesta:** dejar de versionarlo y cambiar `dist/` por `dist` en `.gitignore`. Las pruebas no lo usan.
- **Impacto:** diez minutos.

### T-32. No cancelar ejecuciones en `main` y no guardar el token en el clon

- **Origen:** CI-8.
- **Problema:** dos fusiones seguidas cancelan la comprobación de la primera, y ese commit de `main` se queda sin resultado completo. `actions/checkout` guarda las credenciales en el clon sin que ningún paso las use.
- **Propuesta:** cancelar solo en pull requests y `persist-credentials: false` en los dos `checkout`.
- **Impacto:** tres líneas.

### T-34. Probar el orden único de comprobaciones

- **Origen:** PR-7.
- **Problema:** P6 promete que la misma petición recibe siempre el mismo error, y el protocolo fija el orden de las comprobaciones de `SUBMIT_ACTION`. Solo se prueban un par de pasos.
- **Propuesta:** una prueba en forma de tabla en la que cada petición falla en dos pasos a la vez y espera el código del primero.
- **Impacto:** dos horas.
- **Relación:** `contracts/05-permissions.md` P6; protocolo, sección 4.

### T-35. Medir la cobertura de código

- **Origen:** PR-9.
- **Problema:** no se mide; el mapa de huecos de este análisis se hizo a mano.
- **Propuesta:** `@vitest/coverage-v8` como dependencia de desarrollo, solo para informar, sin umbral al principio. Es una **dependencia nueva** y necesita aprobación.
- **Impacto:** dos horas.
- **Relación:** ADR-012 S18 y S23.

### T-36. Aislar mejor la base de datos de las pruebas

- **Origen:** PR-10.
- **Problema:** la lista de tablas que se vacían entre pruebas está escrita a mano, y dos pruebas renombran tablas de la base compartida; si el proceso se corta, la base queda rota y las pruebas siguientes fallan sin causa clara.
- **Propuesta:** sacar la lista de tablas del catálogo de PostgreSQL y recrear la base de pruebas al empezar, con una guarda sobre el nombre. Más adelante, una base por trabajador si el tiempo molesta.
- **Impacto:** una hora.
- **Relación:** ADR-012 S11; ADR-014, sección 13.

### T-37. Pruebas en navegador: no arrastrar fallos y no esconder los intermitentes

- **Origen:** PR-11.
- **Problema:** la prueba de administración retira Cuatro en raya y lo vuelve a poner sin `finally`; si falla a medias, arrastra a la del reinicio. Con un reintento en GitHub, una prueba intermitente deja el trabajo en verde.
- **Propuesta:** reactivar el juego en un `finally`, ejecutar el reinicio antes que la administración y que el trabajo falle o avise si alguna prueba solo pasó al reintentar.
- **Impacto:** una hora.
- **Relación:** ADR-015 V6 y V12; ADR-017 Y8.

### T-38. Probar el orden de los mensajes de una partida

- **Origen:** PR-13.
- **Problema:** el orden de los mensajes se prueba en salas pero no en partidas, donde el protocolo promete versiones crecientes y que el mensaje final es el último.
- **Propuesta:** una prueba con una secuencia rápida de jugadas y una tercera conexión que escucha.
- **Impacto:** una hora.
- **Relación:** protocolo, secciones 3 y 5; ADR-010 8.9.

### T-39. Frontend: sacar lógica a funciones probables y probar el cambio de versión del service worker

- **Origen:** PR-15.
- **Problema:** las pruebas del frontend solo llegan a las funciones puras de `utils/`. Los *composables*, la página de partida, el tablero y el service worker solo se prueban de forma indirecta, y no se prueba que una versión nueva del service worker borre la caché anterior.
- **Propuesta:** sin añadir dependencias, seguir sacando a `utils/` la lógica con ramas y separar en el service worker las decisiones de caché en funciones que se puedan probar.
- **Impacto:** medio día.
- **Relación:** ADR-016 N4 y Q1; ADR-012 S24.

### T-40. Decidir si la accesibilidad entra en el MVP

- **Origen:** PR-16.
- **Problema:** ningún documento fija un requisito de accesibilidad, así que no se puede tratar como un fallo. No hay pruebas de teclado, de foco ni de anuncios de turno para lectores de pantalla.
- **Propuesta:** que quien decide resuelva si entra en la revisión del Hito 7. Si entra, empezar sin dependencias (partida jugada solo con teclado e instantáneas de accesibilidad de Playwright). `@axe-core/playwright` sería una dependencia nueva.

### T-42. Contrato del tablero en el frontend para el segundo juego

- **Origen:** GO-10.
- **Problema:** el tablero solo recibe la vista y si puede jugar; los eventos de juego se descartan; los colores existen solo para dos asientos; los textos de cada juego van en el archivo común; y todos los tableros entran en el paquete principal.
- **Propuesta:** un tipo de propiedades común (vista, asiento propio, asientos activos, jugadores, eventos, versión y si puede jugar), una paleta de N colores con variables CSS, y textos y carga por juego. Lo único acoplado a Cuatro en raya es su propia carpeta: la página de partida, el cliente en tiempo real y el backend son genéricos.
- **Impacto:** añadir un juego pasa a tocar solo su carpeta. Unas horas.
- **Relación:** ADR-014 K7; contrato del motor M8.

### T-43. Que repetir una rendición tras reconectar no muestre un error

- **Origen:** GO-12.
- **Problema:** si la conexión se corta después de aplicar la rendición y antes de la respuesta, al reconectar el cliente la reenvía y recibe `MATCH_NOT_IN_PROGRESS`, que se muestra como error aunque se aplicó.
- **Propuesta:** responder con el estado final si la partida terminó por la rendición de ese mismo asiento, como una jugada repetida; o no mostrar ese rechazo en el cliente.
- **Impacto:** una hora.
- **Relación:** ADR-010 8.12; protocolo T5 y T13.

### T-44. Documentos de proyecto: CONTRIBUTING, CHANGELOG, glosario y migraciones

- **Origen:** DOC-19.
- **Problema:** no hay `CONTRIBUTING.md`, `CHANGELOG.md`, glosario propio (está solo en ADR-011, sección 6) ni explicación de cómo se crean y se nombran las migraciones. La guía para añadir un juego va en T-05 y la de despliegue ya está prevista para el Hito 7.
- **Propuesta:** un CONTRIBUTING que reúna lo repartido (ramas, `pnpm check`, regla de dependencias, cuándo hace falta un ADR, que no se escribe código sin autorizar el hito); un CHANGELOG por hito que sustituya a las líneas de estado que se desactualizan (T-26); sacar el glosario a `docs/glosario.md`; y una sección de migraciones en `docs/03`.
- **Impacto:** medio día.

### T-45. Hoja de ruta tras el MVP: espectadores, repetición, emparejamiento y juego limpio

- **Origen:** GO-14.
- **Problema:** las piezas de base existen (vista sin asiento, registro de jugadas, resultados por asiento), pero faltan: para espectadores, un `yourSeat` vacío, la autorización de suscripción y un retardo opcional; para la repetición, una operación que devuelva las jugadas (depende de T-21); emparejamiento automático, porque hoy solo hay lista de salas; y, antes de una clasificación, filtrar las partidas contra cuentas propias.
- **Propuesta:** decidir cuándo entran. Espectadores y repetición son pequeños con lo que ya hay.
- **Relación:** protocolo T6, T16 y sección 12; ADR-008, puntos 12 a 16; ADR-014 K16.

---

## 8. Lo que el usuario tiene que decidir

*Respondido el 2026-11-19:* el plan por tandas se acepta tal como se propone (punto 1); prevalecen K2 y K21/L2 (punto 2); la carpeta compartida será un espejo del repositorio (punto 3). Los puntos 4 y 5 se deciden con su tanda.

1. **Qué tareas se trabajan y en qué orden.** Sugerencia, sin tocar el Hito 7:
   - **Primera tanda, sin código de la aplicación:** T-01, T-28, T-03, T-25, T-26, T-27, T-30 y la nota de T-06 en los contratos.
   - **Tanda de contratos, con una sola autorización:** T-04, T-17 (texto), T-29 y las líneas de contrato de T-03 y T-05.
   - **Comprobaciones y pruebas:** T-07, T-08, T-09, T-10, T-31, T-32, T-02, T-12, T-13 y T-14.
   - **Antes del segundo juego:** T-05, T-15, T-21, T-22 y T-42.
   - **Con el Hito 7, cuando se autorice:** T-06, T-11, T-18, T-19, T-20 y los pendientes reunidos en T-27.
2. **Qué texto prevalece** en las dos contradicciones entre documentos aprobados: K21/L2 frente al catálogo de errores (T-04) y K2 frente a 7.22, 8.10 y B6 (T-03). La recomendación es confirmar K21/L2 y K2, que es lo que hace el código.
3. **Qué es la carpeta compartida** (T-30): archivo de entregas por hito o espejo del repositorio.
4. **Dependencias y procesos nuevos**, cada uno con su aprobación: Dependabot (T-10), CodeQL y alertas (T-11), `@vitest/coverage-v8` (T-35) y, si se decide, `@axe-core/playwright` (T-40).
5. **Si la accesibilidad entra en el MVP** (T-40).

## 9. Lo que no se pudo comprobar

- La configuración del repositorio en GitHub más allá de `protected: false` en `main`: si es público o privado, reglas a nivel de organización, alertas de Dependabot y escaneo de secretos.
- Que `drizzle-kit check` y `generate` funcionen como se propone en T-09, y que `--only-shell` sirva para la prueba del service worker (T-07). Se verificarían en una pull request.
- Que la opción para fallar con pruebas intermitentes exista en la versión de Playwright del proyecto (T-37).
- Varios hallazgos se comprobaron de nuevo al juntar este informe, leyendo el código: el texto de S7, el enlace de `apps/frontend/dist`, que la semilla no se guarda, la traducción de K21 frente al catálogo, que el cierre 1008 no se usa y que 4003 está entre los cierres sin reconexión. El resto se apoya en la evidencia que citan los informes de los anexos, con ruta y línea.
