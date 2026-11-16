# ADR-002: Acceso a datos con Drizzle sobre PostgreSQL

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-14 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | Pendiente P2 (ORM o query builder) |
| **Depende de** | ADR-001 (NestJS sobre Node.js y TypeScript) |
| **Relacionados** | ADR-007 (línea base), ADR-010 (persistencia de partida) |

## 1. Contexto

- La documentación exige PostgreSQL con JSONB, transacciones atómicas para el inicio de partida y para cada jugada confirmada, bloqueo optimista por `state_version` y control de capacidad de sala bajo concurrencia (`docs/03` y `docs/04`).
- La ruta crítica son tres o cuatro sentencias sensibles a la concurrencia. El resto es acceso a datos convencional.
- Al 2026-11-14 las dos candidatas principales están en transición de versión mayor. Drizzle tiene como estable la 0.45.4 y su 1.0 está en candidata de lanzamiento. Prisma tiene como estable la 7.10.1 y su versión 8, también en candidata, reescribe esquema, cliente y comandos de migración.
- El análisis completo está en `docs/auditoria/comparacion-orm.md`.

## 2. Decisión

El acceso a datos del backend se implementa con **Drizzle**.

**PostgreSQL queda ratificado como base de datos del MVP.** Esto resuelve la parte de PostgreSQL del hallazgo C-22 de la auditoría, donde figuraba como "acordado" y como "propuesto" a la vez.

## 3. Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| Prisma 7 | Estable y madura, pero empezar en ella implica asumir más adelante una migración profunda a la versión 8. Menos control del SQL en la ruta crítica y tipado débil de JSONB |
| Prisma 8 | Todavía en candidata de lanzamiento, con funciones ausentes según su propia guía de migración |
| MikroORM, TypeORM, Kysely | No se evaluaron a fondo. Kysely habría obligado a elegir aparte la solución de migraciones |

## 4. Consecuencias

**Positivas**
- Control directo del SQL donde importa: actualización condicionada por `state_version`, devolución de la fila actualizada y bloqueo de filas.
- Esquema definido en TypeScript, sin paso de generación de cliente.
- JSONB tipado para `state` y `settings`.
- Capa fina, sencilla de aislar tras repositorios.

**Negativas**
- La versión estable es 0.x y la 1.0 aún no es definitiva.
- La herramienta de migraciones está cambiando de versión mayor.
- Menos convenciones que un ORM completo; exige más soltura con SQL.

**Riesgos y mitigaciones**

| Riesgo | Mitigación |
|---|---|
| Cambios incompatibles entre la 0.45 y la 1.0 | No usar la API que desaparece (5.2) y fijar la versión exacta al iniciar la implementación (5.1) |
| Cambios en la herramienta de migraciones | Migraciones como archivos SQL revisados y versionados (5.3) |
| El ORM se filtra al dominio o al motor | Acceso a datos solo mediante repositorios por módulo (5.4) |

## 5. Condiciones

Aceptadas el 2026-11-14 junto con la decisión principal.

| # | Condición | Motivo |
|---|---|---|
| 5.1 | La versión exacta se fija al iniciar el Hito 1, con preferencia por la 1.0 definitiva si para entonces existe | Evita decidir hoy sobre una versión que cambiará antes de escribir código |
| 5.2 | No usar la API de consultas relacionales v1 | Las notas de la 1.0.0-rc.1 indican que se elimina |
| 5.3 | Las migraciones se generan como archivos SQL, se revisan y se versionan en el repositorio | Un cambio de herramienta no invalida las migraciones ya escritas |
| 5.4 | Todo acceso a datos pasa por repositorios por módulo; ningún controlador, gateway ni motor importa Drizzle | Mantiene el coste de reversión bajo y respeta `docs/02` § Dependencias y límites |
| 5.5 | El bloqueo optimista se implementa como actualización condicionada por `state_version`, comprobando que se modificó exactamente una fila | Es el mecanismo que describe `docs/04` § Jugada confirmada |

**Quedan fuera de este ADR, para pasos posteriores:**
- Controlador de conexión a PostgreSQL y tamaño del pool. Se decide al iniciar el Hito 1.
- Qué se guarda de cada partida y con qué garantías: ver ADR-010.
- Validación del esquema de los campos JSONB: la realiza el motor al restaurar el estado (ver el contrato del motor).

## 6. Referencias

- `docs/auditoria/comparacion-orm.md`, con las fuentes de versión consultadas el 2026-11-14.
- `docs/03-dominio-datos.md` § Convenciones y § Reglas de integridad.
- `docs/04-flujos-y-persistencia.md` § Jugada confirmada.
