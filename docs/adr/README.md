# Registro de decisiones de arquitectura

Cada archivo de esta carpeta recoge una decisión de arquitectura aceptada, con su contexto, las alternativas consideradas y sus consecuencias.

## Índice

| ADR | Decisión | Estado |
|---|---|---|
| [ADR-001](0001-backend-nestjs.md) | Backend sobre NestJS, Node.js y TypeScript | Aceptada |
| [ADR-002](0002-orm-drizzle.md) | Drizzle como capa de acceso a datos sobre PostgreSQL | Aceptada |
| [ADR-003](0003-realtime-websocket-nativo.md) | WebSocket nativo con protocolo propio | Aceptada |
| [ADR-004](0004-autenticacion-sesion-cookie.md) | Sesión de servidor con cookie | Aceptada |
| [ADR-005](0005-organizacion-del-repositorio.md) | Un solo repositorio con espacios de trabajo | Aceptada |
| [ADR-006](0006-renderizado-del-frontend.md) | Frontend renderizado en el navegador, con páginas públicas pregeneradas | Aceptada |
| [ADR-007](0007-linea-base.md) | Línea base de acuerdos de arquitectura | Aceptada |
| [ADR-008](0008-alcance-del-mvp.md) | Alcance del MVP | Aceptada |
| [ADR-009](0009-reglas-de-dominio.md) | Reglas de dominio de salas, partidas y relojes | Aceptada |
| [ADR-010](0010-persistencia-de-partida.md) | Persistencia de partida | Aceptada |
| [ADR-011](0011-convenciones-y-glosario.md) | Convenciones de nombres, identificadores y glosario | Aceptada |
| [ADR-012](0012-decisiones-de-arranque.md) | Decisiones de arranque del Hito 1 | Aceptada |
| [ADR-013](0013-decisiones-del-hito-2.md) | Decisiones del Hito 2, salas y tiempo real | Aceptada |
| [ADR-014](0014-decisiones-del-hito-3.md) | Decisiones del Hito 3, Cuatro en raya en tiempo real | Aceptada |
| [ADR-015](0015-decisiones-del-hito-4.md) | Decisiones del Hito 4, reconexión y recuperación | Aceptada |

## Decisiones aplazadas

El alojamiento del backend, el de PostgreSQL, las copias de seguridad, la supervisión y los objetivos de disponibilidad están **aplazados** hasta que haya algo construido que revisar. Mientras tanto se trabaja en local. El análisis previo está en [`docs/auditoria/despliegue-y-requisitos.md`](../auditoria/despliegue-y-requisitos.md). Tendrán su propio ADR cuando se retomen.

## Propuestas pendientes de confirmación

Las elecciones W1 a W9, tomadas al construir el Hito 4 ([ADR-015, sección 13](0015-decisiones-del-hito-4.md#13-lo-que-resultó-al-construir)). Las decisiones V1 a V12 de ADR-015, K1 a K22 de ADR-014 con sus elecciones L1 a L7, y las elecciones C1 a C5 de ADR-013 se aceptaron el 2026-11-16.

## Convenciones

- Un archivo por decisión, con el nombre `NNNN-titulo-corto.md` y numeración correlativa.
- Estados posibles: **Propuesta**, **Aceptada**, **Sustituida por ADR-NNN** y **Obsoleta**.
- Una decisión aceptada no se reescribe. Si cambia, se añade un ADR nuevo que la sustituye y se actualiza el estado del anterior.
- Solo se marca como aceptada una decisión con confirmación explícita de quien decide.
- Los códigos como C-05, G-03, P4 o R-2 remiten a los hallazgos de la auditoría inicial, en [`docs/auditoria/`](../auditoria/).
