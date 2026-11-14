# D2. ORM o query builder: comparación actualizada

> **Documento histórico de análisis.** Se conserva como registro del razonamiento previo a la decisión. No se mantiene al día. La decisión vigente está en [ADR-002](../adr/0002-orm-drizzle.md).

**Paso 2 del plan de cierre.** Depende de D1 (NestJS sobre Node.js y TypeScript, aprobada).
**Estado:** decidido el 2026-11-14 a favor de Drizzle. Lo que sigue es el análisis previo a la decisión.
**Datos verificados el 2026-11-14** en el registro de npm y en la documentación oficial de cada proyecto (fuentes al final).

---

## 1. Por qué actualizo el análisis de la auditoría

En la auditoría di una recomendación preliminar y me comprometí a verificar el estado real de las candidatas antes de pedirte la decisión. La verificación cambia el panorama en un punto importante: **las dos candidatas principales están en plena transición de versión mayor**, y la de Prisma es mucho más profunda de lo que yo suponía.

También corrijo una afirmación de la auditoría: describí TypeORM como de "mantenimiento irregular". Hoy tiene una línea 1.x con publicaciones recientes. Eso era cierto de su historia, pero no lo he evaluado en su estado actual, así que retiro el juicio.

## 2. Qué exige la documentación del proyecto

| Requisito | Origen |
|---|---|
| PostgreSQL, UUID, `timestamptz` | `docs/03` § Convenciones |
| JSONB para `state` y `settings`, con validación de esquema | `docs/03` § Convenciones |
| Creación atómica de Match, MatchPlayers y GameSession | `docs/04` paso 7 |
| Snapshot más resultado final en una sola transacción | `docs/04` § Jugada confirmada |
| Bloqueo optimista por `state_version` | `docs/04` § Jugada confirmada |
| Control de capacidad de sala bajo concurrencia | `docs/03` § Reglas de integridad |
| Restricciones únicas compuestas y migraciones versionadas | `docs/03`; `planning/backlog-mvp.md` Hito 1 |
| El motor de juego nunca importa el ORM | `docs/02` § Dependencias y límites |

La ruta crítica son tres o cuatro sentencias sensibles a la concurrencia. El resto es acceso a datos convencional.

## 3. Estado actual de las candidatas

| Candidata | Versión estable hoy | Versión mayor en curso | Alcance del cambio |
|---|---|---|---|
| **Drizzle** | `drizzle-orm` 0.45.4 (octubre de 2026); `drizzle-kit` 0.31.11 | 1.0 en candidata de lanzamiento (rc.5, 21 de octubre de 2026) | Acotado, según las notas de la rc.1: se elimina la API de consultas relacionales v1, cambia la configuración de mayúsculas y minúsculas de columnas y se mueven algunas rutas de importación. La herramienta de migraciones también cambia de versión mayor |
| **Prisma** | 7.10.1 (octubre de 2026) | 8.0 en candidata de lanzamiento (rc.33, 6 de noviembre de 2026) | **Profundo.** Cambian la sintaxis del esquema, la API del cliente (deja de generarse `PrismaClient`), los comandos de migración y los códigos de error. La propia documentación lo describe como una migración incremental en paralelo, no como una actualización directa |
| **MikroORM** | 7.2.9 | No identifiqué ninguna | Solo verifiqué la versión publicada, no su hoja de ruta |
| **TypeORM** | 1.1.3 | No identifiqué ninguna | Solo verifiqué la versión publicada |
| **Kysely** | 0.29.9 | No identifiqué ninguna | Es solo query builder; no trae esquema ni migraciones completas |

Detalles relevantes de Prisma:
- Prisma 7 seguirá recibiendo correcciones durante al menos 12 meses desde la salida final de la 8.
- El comando `npm install prisma` instala hoy la candidata de la versión 8, porque la etiqueta `latest` del paquete apunta a ella. Para usar la 7 hay que fijar la versión de forma explícita.
- Según su guía de migración, la versión 8 en su estado actual no ofrece opciones de transacción como el nivel de aislamiento ni transacciones anidadas. A cambio incorpora bloqueo de filas (`forUpdate`) en su API.

## 4. Opciones

### Opción A. Drizzle

| Ventajas | Desventajas |
|---|---|
| Esquema en TypeScript, sin paso de generación de cliente | Su versión estable sigue siendo 0.x y la 1.0 no es definitiva |
| Control directo del SQL en la ruta crítica: actualización condicionada por `state_version`, `RETURNING` y bloqueo de filas | La herramienta de migraciones está cambiando de versión mayor |
| JSONB tipado | Menos convenciones; exige más soltura con SQL |
| Capa fina, fácil de aislar tras repositorios | Comunidad e historial menores que los de Prisma |
| El cambio pendiente a 1.0 es acotado y evitable en gran parte si no se usa la API que desaparece | |

### Opción B. Prisma

| Ventajas | Desventajas |
|---|---|
| La versión 7 es estable y madura | Empezar hoy en la 7 significa asumir después una migración que reescribe esquema, consultas y comandos |
| Muy buena experiencia de desarrollo y documentación | Empezar en la 8 significa construir sobre una candidata con funciones aún ausentes |
| Migraciones maduras en la 7 | Lenguaje de esquema propio; en la 7, cliente generado |
| Comunidad amplia e integración conocida con NestJS | En la 7, menos control del SQL: el bloqueo de filas requiere consultas en crudo. Tipado débil de JSONB |

### Opción C. Evaluar a fondo otra candidata

MikroORM encaja bien con un diseño orientado a dominio, trae bloqueo optimista incorporado y tiene integración con NestJS. No aparece en transición de versión. Su comunidad es menor. Kysely es un query builder tipado sólido, pero obligaría a elegir aparte la solución de migraciones. Si te interesa alguna, preparo una evaluación al mismo nivel que las otras dos antes de decidir.

## 5. Recomendación

**[RECOMENDACIÓN] Opción A, Drizzle.** Mantengo la recomendación preliminar, pero el motivo principal ha cambiado.

1. **Encaje técnico.** La ruta crítica del sistema es una transacción pequeña con bloqueo optimista y snapshot JSONB. Ahí el control directo del SQL vale más que la comodidad.
2. **Menor coste de transición.** Ninguna de las dos candidatas principales ofrece hoy una base estable sin cambio a la vista. El de Drizzle es acotado. El de Prisma equivale a adoptar otra herramienta dentro de uno o dos años, o a construir ahora sobre una candidata con carencias.
3. **Reversibilidad.** El ORM queda detrás de repositorios por módulo y nunca llega al motor, así que un cambio futuro afectaría solo a la capa de persistencia.

**Condiciones que propongo dejar en el ADR-002:**
- La versión exacta se fija al iniciar la implementación (Hito 1), no ahora. Preferencia por la 1.0 definitiva si para entonces existe.
- No usar la API de consultas relacionales v1, que desaparece en la 1.0.
- Las migraciones se generan como archivos SQL, se revisan y se versionan en el repositorio. Así un cambio en la herramienta no invalida las migraciones ya escritas.
- Acceso a datos siempre a través de repositorios por módulo.

**Dónde es más débil esta recomendación.** Es la decisión con menor distancia entre opciones de las cuatro primeras. Si para ti pesa más contar hoy con una versión estable, madura y muy documentada que el coste de migrar más adelante, Prisma 7 es defendible. Si prefieres no depender de ninguna herramienta en transición, la opción C merece la evaluación.

**Coste de reversión:** medio-bajo si se respeta el patrón de repositorios.

## 6. Fuentes

- Registro de npm: `drizzle-orm`, `drizzle-kit`, `prisma`, `@prisma/client`, `@mikro-orm/core`, `typeorm`, `kysely`. Consultado el 2026-11-14.
- Drizzle, últimas publicaciones: https://orm.drizzle.team/docs/latest-releases
- Drizzle, notas de la 1.0.0-rc.1: https://newreleases.io/project/npm/drizzle-orm/release/1.0.0-rc.1
- Prisma, estado de las versiones: https://www.prisma.io/docs/orm/release-status
- Prisma, guía desde la versión 7: https://www.prisma.io/docs/orm/coming-from-prisma-orm-7
- Prisma, sobre la madurez de la versión 8: https://www.prisma.io/blog/is-prisma-8-ready-for-long-lived-production-apps
- Prisma, registro de cambios: https://www.prisma.io/changelog.md
