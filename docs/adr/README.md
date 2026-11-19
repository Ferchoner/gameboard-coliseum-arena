# Registro de decisiones de arquitectura

Cada archivo de esta carpeta recoge una decisión de arquitectura aceptada, con su contexto, las alternativas consideradas y sus consecuencias.

## Índice

| ADR | Decisión | Estado | Cambios posteriores |
|---|---|---|---|
| [ADR-001](0001-backend-nestjs.md) | Backend sobre NestJS, Node.js y TypeScript | Aceptada | ADR-012 cierra sus puntos aplazados (S3, S4, S6) |
| [ADR-002](0002-orm-drizzle.md) | Drizzle como capa de acceso a datos sobre PostgreSQL | Aceptada | Ninguno |
| [ADR-003](0003-realtime-websocket-nativo.md) | WebSocket nativo con protocolo propio | Aceptada | Ninguno |
| [ADR-004](0004-autenticacion-sesion-cookie.md) | Sesión de servidor con cookie | Aceptada | ADR-012 confirma la propuesta y decide lo aplazado (S12, S13, S15) |
| [ADR-005](0005-organizacion-del-repositorio.md) | Un solo repositorio con espacios de trabajo | Aceptada | ADR-012 confirma los nombres de carpeta (S1) y la forma de compartir tipos (S2) |
| [ADR-006](0006-renderizado-del-frontend.md) | Frontend renderizado en el navegador, con páginas públicas pregeneradas | Aceptada | ADR-012 confirma el alcance de la cookie (S13) |
| [ADR-007](0007-linea-base.md) | Línea base de acuerdos de arquitectura | Aceptada, modificada | ADR-014 precisa B6 (K2) |
| [ADR-008](0008-alcance-del-mvp.md) | Alcance del MVP | Aceptada | El backlog reparte el resto del MVP en los Hitos 4 a 7 (B1); ADR-019 cierra el resto de la sección 4 (F1 y F9) |
| [ADR-009](0009-reglas-de-dominio.md) | Reglas de dominio de salas, partidas y relojes | Aceptada, modificada | ADR-014 sustituye 7.22 (K2); ADR-015 precisa 7.26 (V2) y añade 7.32 (V5) |
| [ADR-010](0010-persistencia-de-partida.md) | Persistencia de partida | Aceptada, modificada | ADR-014 sustituye 8.10 (K2); ADR-018 precisa 8.2 (Z1 y Z2); ADR-019 precisa 8.11 (X15 y X16) |
| [ADR-011](0011-convenciones-y-glosario.md) | Convenciones de nombres, identificadores y glosario | Aceptada | Ninguno |
| [ADR-012](0012-decisiones-de-arranque.md) | Decisiones de arranque del Hito 1 | Aceptada, modificada | ADR-014 precisa la regla de dependencias de S2 y cierra S24 y S25 (K7) |
| [ADR-013](0013-decisiones-del-hito-2.md) | Decisiones del Hito 2, salas y tiempo real | Aceptada, modificada | ADR-014 precisa H1 (K1); ADR-015 cierra H13 (V3) |
| [ADR-014](0014-decisiones-del-hito-3.md) | Decisiones del Hito 3, Cuatro en raya en tiempo real | Aceptada | Ninguno |
| [ADR-015](0015-decisiones-del-hito-4.md) | Decisiones del Hito 4, reconexión y recuperación | Aceptada | Ninguno |
| [ADR-016](0016-decisiones-del-hito-5.md) | Decisiones del Hito 5, modalidad por turnos | Aceptada | Ninguno |
| [ADR-017](0017-decisiones-del-hito-6.md) | Decisiones del Hito 6, cuenta, estadísticas y administración | Aceptada | Ninguno |
| [ADR-018](0018-preparacion-del-segundo-juego.md) | Preparación del segundo juego | Aceptada | Ninguno |
| [ADR-019](0019-batalla-naval-y-jugadas-simultaneas.md) | Los próximos juegos, Batalla naval y jugadas simultáneas | Aceptada | Ninguno |

## Decisiones aplazadas

El alojamiento del backend, el de PostgreSQL, las copias de seguridad, la supervisión y los objetivos de disponibilidad están **aplazados** hasta que haya algo construido que revisar. Mientras tanto se trabaja en local. El análisis previo está en [`docs/auditoria/despliegue-y-requisitos.md`](../auditoria/despliegue-y-requisitos.md). Tendrán su propio ADR cuando se retomen.

## Propuestas pendientes de confirmación

Ninguna. Las decisiones Z1 a Z8 de [ADR-018](0018-preparacion-del-segundo-juego.md) se aceptaron el 2026-11-19, al autorizar la cuarta tanda del análisis. Las decisiones U1 a U18 de [ADR-017](0017-decisiones-del-hito-6.md) y sus elecciones Y1 a Y8 ([sección 15](0017-decisiones-del-hito-6.md#15-lo-que-resultó-al-construir)) se aceptaron el 2026-11-19. Las decisiones N1 a N12 de [ADR-016](0016-decisiones-del-hito-5.md) con sus elecciones Q1 a Q6 se aceptaron el 2026-11-18. Las decisiones V1 a V12 de ADR-015 con sus elecciones W1 a W9, K1 a K22 de ADR-014 con sus elecciones L1 a L7, y las elecciones C1 a C5 de ADR-013 se aceptaron el 2026-11-16.

## Convenciones

- Un archivo por decisión, con el nombre `NNNN-titulo-corto.md` y numeración correlativa.
- Estados posibles: **Propuesta**, **Aceptada**, **Aceptada, modificada por ADR-NNN (decisiones)**, **Sustituida por ADR-NNN** y **Obsoleta**. Si un ADR se aceptó con algún cambio respecto a su recomendación, el estado lo dice: "Aceptada, con un cambio en S14".
- Una decisión aceptada no se reescribe. Cuando un ADR posterior la cambia, la precisa o cierra algo que dejaba aplazado, se hacen tres cosas, sin borrar el texto original:
  1. En la decisión afectada se añade, en cursiva, una línea con la fecha y el origen: *Precisada*, *Sustituida*, *Añadida*, *Cerrado* o *Confirmada el AAAA-MM-DD (ADR-NNN, decisión): resumen del cambio*.
  2. Si la cambia o la sustituye, el estado del ADR anterior pasa a "Aceptada, modificada por ADR-NNN (decisiones)". Cerrar un punto aplazado no cambia el estado.
  3. Se anota en la columna "Cambios posteriores" de este índice.
- Si cambia un ADR entero, se añade uno nuevo que lo sustituye y el anterior pasa a "Sustituida por ADR-NNN".
- Convención fijada el 2026-11-19 a partir de lo que ya se hacía (tarea T-28 del [análisis de la aplicación](../../planning/analisis/informe-de-analisis-y-tareas.md)).
- Solo se marca como aceptada una decisión con confirmación explícita de quien decide.
- Los códigos como C-05, G-03, P4 o R-2 remiten a los hallazgos de la auditoría inicial, en [`docs/auditoria/`](../auditoria/).
