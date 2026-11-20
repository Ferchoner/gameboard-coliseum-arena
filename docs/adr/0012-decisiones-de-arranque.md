# ADR-012: Decisiones de arranque del Hito 1

| Campo | Valor |
|---|---|
| **Estado** | Aceptada, con un cambio en S14; modificada por ADR-014 (K7) |
| **Fecha** | 2026-11-16 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | Los puntos aplazados al inicio del Hito 1 (`docs/02-arquitectura.md`, sección 8) y las dos propuestas sin confirmar de ADR-004 y ADR-005 |
| **Depende de** | ADR-001 a ADR-007 |

## 1. Contexto

Los ADR anteriores dejaron a propósito varias elecciones para el momento de empezar a construir, de modo que se tomaran con las versiones disponibles ese día. El Hito 1 está autorizado desde el 2026-11-16 con una condición: estas decisiones se presentan antes de escribir código.

Todas las versiones citadas se comprobaron el 2026-11-16 en el registro de npm y en los sitios de cada proyecto. La lista está en la [sección 13](#13-versiones-comprobadas).

## 2. Cómo leer este documento

- Cada decisión tiene un identificador (S1 a S25), sus alternativas y una recomendación.
- Las decisiones S1 a S15 tienen consecuencias que cuesta deshacer o afectan a un ADR. Van explicadas una a una.
- Las decisiones S16 a S25 son menores y fáciles de cambiar. Van en una tabla.
- **Las 25 se aceptaron el 2026-11-16 tal como se recomendaban, con un cambio:** en S14 se añade un modo con HTTPS al entorno local.

## 3. Resumen

| ID | Asunto | Recomendación |
|---|---|---|
| S1 | Nombres de carpetas | Confirmar `apps/backend`, `apps/frontend`, `packages/contracts` y `packages/game-engine` |
| S2 | Tipos escritos dos veces | El paquete de contratos toma del motor los cuatro tipos que comparten. El motor sigue sin depender de nada |
| S3 | Gestor de paquetes | pnpm, con la versión fijada. Sin herramienta de orquestación |
| S4 | Aislamiento del motor | dependency-cruiser, más un paquete del motor sin dependencias y una regla que le prohíbe el reloj y el azar |
| S5 | Versión de TypeScript | 6.0, no 7.0 |
| S6 | Validación de datos de entrada | Zod, con los esquemas en el paquete de contratos |
| S7 | Relación entre el archivo OpenAPI y el código | El archivo sigue siendo el contrato. El código se escribe a mano y unas pruebas comprueban que coincide |
| S8 | Versión de Drizzle | `1.0.0-rc.5`, fijada de forma exacta |
| S9 | Controlador de PostgreSQL | `pg`, con un conjunto de 10 conexiones configurable |
| S10 | Versión de PostgreSQL | 18, en local con Docker Compose |
| S11 | Pruebas que tocan la base de datos | Contra un PostgreSQL real |
| S12 | Gestión de sesiones | Propia, dentro del módulo `auth` |
| S13 | Alcance de la cookie | Solo el host de la API |
| S14 | Entorno local | Frontend y API en dos puertos de `localhost`, con un segundo modo en HTTPS |
| S15 | Hash de contraseñas | El Argon2id incorporado en Node.js |
| S16 a S25 | Decisiones menores | [Sección 8](#8-decisiones-menores) |

---

## 4. Repositorio

### S1. Nombres de las carpetas

Es la propuesta que ADR-005 dejó sin confirmar.

| Opción | A favor | En contra |
|---|---|---|
| **`apps/backend`, `apps/frontend`, `packages/contracts`, `packages/game-engine`** | Es la convención más extendida. Separa a la vista lo que se despliega de lo que se comparte. Es la que ya usan todos los documentos | Ninguna relevante |
| Cuatro carpetas en la raíz (`backend/`, `frontend/`, `contracts/`, `game-engine/`) | Menos niveles | `contracts/` ya existe y contiene los documentos. No se distingue qué es aplicación y qué es paquete |

**Recomendación:** confirmar los nombres propuestos. Los paquetes se llaman `@gameboard/backend`, `@gameboard/frontend`, `@gameboard/contracts` y `@gameboard/game-engine`. Son privados y no se publican.

### S2. Tipos que hoy están escritos dos veces

`MatchMode`, `TimeControl`, `SeatOutcome` y `MatchEndReason` están definidos en el protocolo de tiempo real y también en el contrato del motor, con el mismo contenido. La regla propuesta en ADR-005 decía que el paquete de contratos no depende de nada del proyecto, y con ella no hay forma de definirlos una sola vez.

| Opción | A favor | En contra |
|---|---|---|
| **A. El paquete de contratos los toma del motor** | Una sola definición, en el paquete más básico. El motor sigue sin depender de nada | Cambia la regla propuesta en ADR-005: `contracts` pasa a depender de `game-engine`. El frontend recibe esos tipos del motor a través de `contracts` |
| B. Se mantienen las dos definiciones, con una comprobación automática de que son iguales | Los dos paquetes siguen siendo independientes | Siguen existiendo dos definiciones. Todo cambio se hace dos veces |
| C. Un quinto paquete con los tipos comunes | Ningún paquete depende de otro salvo de ese | Un paquete más para cuatro tipos. El motor dejaría de ser un paquete sin dependencias |

**Recomendación: A.** La regla de dependencias queda así: las aplicaciones dependen de los paquetes, `contracts` puede depender de `game-engine` solo para tipos y listas de valores, y `game-engine` no depende de nada. El motor expone esos tipos por una entrada aparte, de modo que al frontend no le llega el código de ningún juego. *Precisada el 2026-11-16 (ADR-014, K7): el frontend puede importar además directamente del motor, solo tipos; la regla se sigue comprobando de forma automática.*

Las vistas de sala, partida y resumen de partida, que hoy están en la API y en el protocolo, pasan a tener una sola definición en `contracts`, que usan los dos.

### S3. Gestor de paquetes y orquestación de tareas

| Opción | A favor | En contra |
|---|---|---|
| **pnpm** | Cada paquete solo puede importar lo que declara, lo que refuerza el aislamiento del motor. Instalación rápida. Buen soporte de espacios de trabajo | Hay que instalarlo. Node.js 26 ya no trae Corepack |
| npm | Viene con Node.js | Coloca todas las dependencias juntas, así que un paquete puede importar algo que no declaró sin que nadie lo note |
| Yarn | Maduro | No aporta nada sobre pnpm en este proyecto |
| Bun | Muy rápido | Su compatibilidad con NestJS y los decoradores es menos segura. Añadiría un segundo entorno de ejecución |

**Recomendación:** pnpm, con la versión exacta fijada en el campo `packageManager` para que todos usen la misma.

**Orquestación:** ninguna herramienta por ahora. Con cuatro paquetes bastan las órdenes de pnpm para ejecutar una tarea en todos o en uno. Turborepo o Nx se añadirían si las compilaciones llegan a ser lentas, y añadirlos después no obliga a rehacer nada.

### S4. Comprobación del aislamiento del motor y de la regla de dependencias

ADR-001, condición 5.5, exige una verificación automática.

| Opción | A favor | En contra |
|---|---|---|
| **dependency-cruiser** | Las reglas están en un solo archivo y se leen como lo que son: "esta carpeta no puede importar de esta otra". Analiza las importaciones reales. Sirve también para las reglas entre módulos del backend | Una dependencia de desarrollo más |
| Reglas del analizador de código (`eslint-plugin-boundaries` o `no-restricted-imports`) | Sin herramienta nueva | Las reglas quedan repartidas en la configuración del analizador y es más fácil desactivarlas línea a línea |
| Un script propio | Sin dependencias | Hay que mantenerlo y es fácil que se le escape algún caso |

**Recomendación:** dependency-cruiser, junto con tres medidas que no cuestan nada:

1. El paquete del motor no declara ninguna dependencia. Con pnpm, eso le impide importar nada de fuera.
2. Una regla del analizador prohíbe en el motor la hora del sistema, el azar del sistema y los módulos de Node.js. El contrato del motor exige que reciba la hora y la semilla desde la plataforma.
3. Las reglas cubren también los paquetes: `packages/` no importa de `apps/`, y el frontend no importa del backend.

La comprobación se ejecuta con las pruebas y en cada pull request (S23).

### S5. Versión de TypeScript

TypeScript 7.0 es la última versión estable, publicada en 2026, y es mucho más rápida, pero salió sin la interfaz de programación que usan otras herramientas. Su equipo la anuncia para la 7.1, que está en beta.

| Opción | A favor | En contra |
|---|---|---|
| **TypeScript 6.0** | Es la que admiten hoy el analizador de código (`typescript-eslint` exige una versión anterior a la 6.1) y las herramientas de Vue | No es la más reciente |
| TypeScript 7.0 | Compila mucho más rápido | El analizador de código y la comprobación de tipos de Vue no funcionan con ella. Habría que instalar las dos versiones a la vez |

**Recomendación:** 6.0.3. Se revisa cuando salga la 7.1. El equipo de TypeScript recomienda pasar por la 6.0 antes de saltar a la 7, así que no es un desvío.

---

## 5. Validación y contratos

### S6. Librería de validación de datos de entrada

NestJS 12 admite en sus decoradores cualquier librería que siga el estándar Standard Schema. Se comprobó en el paquete `@nestjs/common` 12.5.0.

| Opción | A favor | En contra |
|---|---|---|
| **Zod 4** | Un mismo esquema valida y da el tipo. Sirve igual para la API, para los mensajes del WebSocket y para la configuración. No usa decoradores ni clases, así que el frontend puede usar los mismos esquemas. Está muy extendida | Pesa algo más que Valibot en el navegador |
| class-validator y class-transformer | Es lo tradicional en NestJS | Obliga a escribir una clase por cada cuerpo, aparte de los tipos del contrato. No sirve para el WebSocket sin trabajo extra ni se comparte bien con el frontend |
| Valibot | Muy ligera en el navegador | Menos usada y con menos herramientas alrededor |

**Recomendación:** Zod 4. Los esquemas viven en `packages/contracts`, junto a los tipos. El backend los usa para validar toda entrada y el frontend puede usarlos en sus formularios.

Los fallos de validación se traducen a `VALIDATION_ERROR` con la forma `fields[{field, rule}]` que fija el catálogo de errores.

### S7. Relación entre el archivo OpenAPI y el código

El archivo `contracts/01-rest-api.yaml` es el contrato aceptado. Hay que decidir cómo se mantiene de acuerdo con el código.

| Opción | A favor | En contra |
|---|---|---|
| **A. El archivo es el contrato. Tipos y esquemas se escriben a mano y unas pruebas comprueban que coinciden** | El contrato sigue siendo un documento que se lee y se revisa. Ningún cambio de código lo altera sin que se note | Hay que escribir los tipos una vez a mano. La coincidencia depende de las pruebas |
| B. Generar los tipos a partir del archivo | Los tipos no pueden desviarse | Los tipos generados son menos legibles. Las vistas compartidas con el protocolo quedarían en dos sitios. La validación en ejecución habría que escribirla igual |
| C. Generar el archivo a partir del código | Una sola fuente | El contrato aceptado pasaría a ser un resultado. Sus explicaciones tendrían que mudarse al código |

**Recomendación: A**, con dos comprobaciones automáticas:

1. Toda respuesta real de la API en las pruebas se valida contra el archivo OpenAPI. *Cumplido del todo el 2026-11-19 (análisis, T-02): hasta entonces cada prueba llamaba a la validación a mano y una de cada tres respuestas se quedaba sin comprobar. Ahora la validación va en el único sitio por el que pasan las peticiones de las pruebas (`apps/backend/test/app.ts`), comprueba también que el código de error sea uno de los que enumera la operación, y al terminar informa de las respuestas del contrato que ninguna prueba vio.*
2. Cada esquema de Zod está atado en compilación al tipo del contrato, de modo que no puede aceptar una forma distinta.

**Qué pasa con los archivos de tipos actuales.** `contracts/02-realtime.ts` pasa a `packages/contracts` y `contracts/03-game-engine.ts` pasa a `packages/game-engine`, sin cambiar su contenido, como preveía `docs/02-arquitectura.md`, sección 7. No quedan copias en `contracts/`: los documentos `.md` enlazan a la nueva ubicación. El archivo OpenAPI se queda donde está.

---

## 6. Datos

### S8. Versión de Drizzle

ADR-002 prefería la versión 1.0 definitiva si existía. **No existe todavía.** Hay dos líneas: la estable 0.45.4, de octubre de 2026, y la candidata `1.0.0-rc.5`, también de octubre.

La 1.0 cambia el formato de la carpeta de migraciones y de la tabla que las registra, y mueve de sitio varias piezas.

| Opción | A favor | En contra |
|---|---|---|
| **`1.0.0-rc.5`, fijada de forma exacta** | El proyecto nace con el formato definitivo de migraciones. No hay una migración de herramienta pendiente | Es una versión candidata. Puede traer algún fallo o un cambio menor antes de la definitiva |
| 0.45.4 | Es la versión estable | Garantiza un trabajo de migración a la 1.0, que toca la carpeta de migraciones, justo la pieza que conviene no tocar |

**Recomendación:** `1.0.0-rc.5`, con la misma versión de `drizzle-kit`, fijadas sin rango. Se pasa a la 1.0 definitiva cuando salga. El riesgo está acotado por tres condiciones que ya eran de ADR-002: las migraciones son archivos SQL revisados, todo acceso a datos pasa por repositorios de cada módulo y no se usa la API relacional antigua.

### S9. Controlador de PostgreSQL y conjunto de conexiones

| Opción | A favor | En contra |
|---|---|---|
| **`pg`** | Es el controlador más usado y probado. Trae su propio conjunto de conexiones | Algo más lento que `postgres` en pruebas de rendimiento |
| `postgres` | Más rápido | Prepara las consultas de forma automática y maneja las transacciones de otro modo, lo que da sorpresas con algunos intermediarios de conexiones |

**Recomendación:** `pg`, con un conjunto de 10 conexiones por defecto, configurable por variable de entorno. El valor se revisa con el alojamiento.

### S10. Versión de PostgreSQL y base de datos local

PostgreSQL 18 es la versión estable más reciente (18.7). La 19 está en fase candidata.

| Opción | A favor | En contra |
|---|---|---|
| **PostgreSQL 18, con Docker Compose** | Un archivo deja la base de datos lista con una orden, igual en cualquier ordenador. Soporte hasta 2030 | Requiere tener Docker |
| PostgreSQL instalado a mano | Sin Docker | Cada ordenador queda distinto y hay que documentar los pasos |

**Recomendación:** PostgreSQL 18 con un archivo de Docker Compose. La conexión se configura con una variable de entorno, así que quien prefiera una instalación propia puede usarla. El modelo de datos no usa nada posterior a la versión 16.

### S11. Pruebas que tocan la base de datos

| Opción | A favor | En contra |
|---|---|---|
| **Un PostgreSQL real, con una base de datos aparte para pruebas** | Prueba lo mismo que se ejecutará: restricciones, transacciones y bloqueos | Las pruebas necesitan la base de datos en marcha |
| PGlite, un PostgreSQL dentro del proceso | No necesita nada instalado y es muy rápido | No es el mismo motor en lo que más importa aquí: la concurrencia y los bloqueos |
| Testcontainers, un contenedor por ejecución | Aislamiento total | Exige Docker en todos los entornos y arranca más despacio |

**Recomendación:** PostgreSQL real. Las pruebas del motor y de la lógica pura no usan base de datos. Las de repositorios y de la API usan una base de datos de pruebas a la que se aplican las migraciones al empezar.

---

## 7. Identidad

### S12. Gestión de sesiones

| Opción | A favor | En contra |
|---|---|---|
| **Propia, en el módulo `auth`** | Es poco código: crear, validar, renovar y revocar. Usa la tabla `auth_sessions` tal como está aceptada. La misma función valida la cookie en la API y en la apertura del WebSocket | Hay que escribirla y probarla con cuidado |
| `express-session` con almacén en PostgreSQL | Muy usada | Impone su propia tabla y guarda el identificador sin hash, contra la condición 5.1 de ADR-004. No resuelve el WebSocket |
| Passport | Conocida | Añade una capa pensada para varios métodos de acceso. Aquí hay uno solo |
| Una librería completa de autenticación, como better-auth | Trae registro, sesiones y recuperación | Impone sus tablas y sus rutas, que no son las del modelo de datos ni las de la API aceptados |

**Recomendación:** propia, que era la preferencia de ADR-004. El identificador son 32 bytes aleatorios y en la base de datos se guarda su hash SHA-256.

### S13. Alcance de la cookie de sesión

Es la propuesta que ADR-004 dejó sin confirmar.

| Opción | A favor | En contra |
|---|---|---|
| **Solo el host de la API** | Es el alcance más pequeño posible. Ningún otro subdominio recibe la cookie | El servidor del frontend no la ve. No hace falta, porque el frontend se ejecuta en el navegador (ADR-006) |
| Todo el dominio, compartida entre subdominios | El servidor del frontend podría leerla | Cualquier subdominio la recibe, y uno comprometido podría usarla |

**Recomendación:** solo el host de la API. En producción la cookie se llama `__Host-session`, un prefijo con el que el navegador rechaza la cookie si alguien intenta ampliarle el alcance. En local se llama `session`, porque ese prefijo exige HTTPS. El nombre ya era configurable en la API.

### S14. Entorno local con dos orígenes

ADR-004 pide que en local el frontend y la API estén en dos orígenes del mismo sitio, como en producción, para que CORS, CSRF y la cookie se prueben de verdad.

| Opción | A favor | En contra |
|---|---|---|
| **Dos puertos de `localhost`: la API en el 3000 y el frontend en el 3001** | No requiere configurar nada en el ordenador. Para el navegador son dos orígenes del mismo sitio, igual que dos subdominios | Sin HTTPS. La cookie no lleva `Secure` en local |
| Dos subdominios de `localhost` (`app.localhost` y `api.localhost`) | Se parece más a producción a la vista | El navegador los trata como sitios distintos y no enviaría la cookie. No reproduce producción |
| Dominio local con HTTPS y certificado propio | Es lo más fiel | Hay que instalar un certificado y tocar la configuración del sistema en cada ordenador |

**Recomendación:** dos puertos de `localhost`. El puerto 3000 para la API es el que ya figura en el archivo OpenAPI.

**Decisión (2026-11-16): la opción recomendada, más un modo con HTTPS.** El entorno local tiene dos modos, con el mismo código y distinta configuración:

| Modo | API | Frontend | Cookie |
|---|---|---|---|
| HTTP | `http://localhost:3000` | `http://localhost:3001` | `session`, sin `Secure` |
| HTTPS | `https://localhost:3443` | `https://localhost:3444` | `__Host-session`, con `Secure`, como en producción |

El modo HTTPS usa un certificado local que genera un script del repositorio. Sirve para probar en local la cookie con `Secure` y su prefijo, que el modo HTTP no puede probar. La prueba en Safari con un despliegue real sigue en el Hito 7.

*Ampliada el 2026-11-19 (ADR-021, DL1 a DL4): los dos modos aceptan `--dominio`, que sirve la API en `api.boardgame-coliseum.test` y el frontend en `app.boardgame-coliseum.test` con los mismos puertos, y `pnpm local` arranca lo construido en lugar de los servidores de desarrollo. Lo dicho aquí de `app.localhost` y `api.localhost` sigue valiendo: con un solo nivel bajo `localhost` son sitios distintos.*

### S15. Hash de contraseñas

ADR-004, condición 5.9, pedía confirmar el estado del Argon2id incorporado en Node.js 26. **Está estable.** Se probó en Node.js 26.13.1: reproduce el vector de prueba de la especificación RFC 9106 y tarda unos 35 milisegundos con los parámetros recomendados.

| Opción | A favor | En contra |
|---|---|---|
| **El incorporado en Node.js** | Sin dependencias. Lo mantiene el propio Node.js | Devuelve solo el hash. Guardar la sal y los parámetros junto a él es código propio, unas 40 líneas |
| `@node-rs/argon2` | Guarda sal y parámetros por su cuenta | Es una dependencia con código nativo |

**Recomendación:** el incorporado, con los parámetros mínimos que recomienda OWASP: 19 MiB de memoria, 2 pasadas y 1 hilo. El resultado se guarda en el formato de texto estándar de Argon2, que incluye la sal y los parámetros. Si algún día se suben los parámetros, el hash de cada cuenta se renueva en su siguiente inicio de sesión.

---

## 8. Decisiones menores

Son fáciles de cambiar más adelante.

| ID | Asunto | Recomendación | Alternativa |
|---|---|---|---|
| S16 | Versión de Node.js | La línea 26, fijada en el repositorio a partir de la 26.13 | Ninguna. Es la de ADR-001 |
| S17 | Analizador y formato del código | ESLint con `typescript-eslint` y Prettier, con una sola configuración para todo el repositorio | oxlint, que es el que NestJS 12 propone por defecto, o Biome. Son más rápidos. Se recomienda ESLint porque es el que Nuxt integra de serie y así hay una sola herramienta para todo |
| S18 | Pruebas | Vitest en todos los paquetes, y supertest para las pruebas de la API. Las pruebas en navegador llegan en el Hito 3 | Jest |
| S19 | Comprobación de salud | `GET /health`, fuera de la API versionada. Responde `200` si el servidor y la base de datos contestan y `503` si no. Sin librería | Añadirla a la API v1, o usar `@nestjs/terminus` |
| S20 | Registro de actividad | El de NestJS, en formato JSON y con el identificador de petición en cada línea | pino, que es más rápido y añade una dependencia |
| S21 | Configuración | Variables de entorno validadas con Zod al arrancar. El servidor no arranca si falta alguna. Un archivo `.env.example` en el repositorio | `@nestjs/config` |
| S22 | Generación de identificadores | UUID versión 4, generados por la aplicación | UUID versión 7, que se ordenan por fecha pero revelan cuándo se creó cada cosa |
| S23 | Comprobaciones en cada pull request | GitHub Actions: analizador, tipos, regla de dependencias y pruebas con PostgreSQL | Ejecutarlas solo a mano |
| S24 | Frontend mínimo | Sin librería de componentes ni de estado en el Hito 1. Textos en español, reunidos en un solo lugar. Llamadas a la API con las funciones de Nuxt y los tipos de `contracts` | Elegir ya una librería de componentes. Se propone decidirlo al llegar al tablero, en el Hito 3 |
| S25 | Si el frontend usa el paquete del motor para mostrar las jugadas válidas | Decidirlo en el Hito 3. En el Hito 1 no hay tablero | Decidirlo ahora |

---

## 9. Lo que se comprobó antes de recomendar

| Comprobación | Resultado |
|---|---|
| Argon2id incorporado en Node.js 26.13.1 | Funciona y reproduce el vector de prueba de RFC 9106 |
| Validación con Standard Schema en NestJS 12.5.0 | Los decoradores de cuerpo, consulta y parámetros aceptan un esquema |
| Existencia de Drizzle 1.0 definitiva | No existe. La última candidata es la `rc.5` |
| Compatibilidad de TypeScript 7.0 con las herramientas | `typescript-eslint` exige una versión anterior a la 6.1 |
| Versión estable de PostgreSQL | 18.7. La 19 es candidata |
| Parámetros de Argon2id | Los de la guía de almacenamiento de contraseñas de OWASP |

## 10. Supuestos que se comprueban al montar el proyecto

No se han probado todavía porque exigen tener el proyecto montado. Si alguno falla, se avisa antes de cambiar de opción.

| Supuesto | Si falla |
|---|---|
| Vitest ejecuta el código de NestJS con sus decoradores bajo ESM | Se añade el complemento de SWC para Vitest |
| Drizzle `1.0.0-rc.5` funciona con `pg` y con el modelo de datos aceptado | Se vuelve a la 0.45.4 y se anota la migración pendiente |
| pnpm en su versión actual instala y enlaza los cuatro paquetes sin ajustes | Se fija la versión anterior de pnpm |

## 11. Lo que no se decide ahora

| Asunto | Cuándo |
|---|---|
| Librería de WebSocket y adaptador de NestJS | Hito 2 |
| Dirección de la dependencia entre los módulos `rooms` y `matches` | Hito 2 |
| Librería de componentes del frontend y uso del motor en el navegador | Hito 3. *Cerrado el 2026-11-16 (ADR-014, K7)* |
| Límites de frecuencia de la API | Hito 7, como fija el backlog |
| Alojamiento y prueba en Safari con un despliegue real | Aplazado |

## 12. Efecto sobre los documentos

Hechos al aceptarse las decisiones.

| Documento | Cambio |
|---|---|
| ADR-004 | La propuesta sobre el alcance de la cookie pasa a decisión (S13) |
| ADR-005 | Los nombres de carpeta pasan a decisión (S1). La regla de dependencias cambia: `contracts` puede depender de `game-engine` (S2) |
| `docs/02-arquitectura.md` | Secciones 7 y 8, con lo decidido |
| `contracts/01-rest-api.md` | Se anota la comprobación de salud como operación fuera de la versión 1 (S19). El archivo OpenAPI no cambia |
| `contracts/02-realtime.md` y `contracts/03-game-engine.md` | Enlazan a los archivos de tipos en su nueva ubicación (S7) |
| `planning/decisiones-y-pendientes.md` y `README.md` | Se ponen al día |

## 13. Versiones comprobadas

Comprobadas el 2026-11-16.

| Pieza | Versión |
|---|---|
| Node.js | 26.13.1, LTS activa |
| TypeScript | 6.0.3. La 7.0.2 es la última estable y la 7.1 está en beta |
| pnpm | 12.21.0 |
| NestJS | 12.5.0 |
| Nuxt | 4.6.4, con Vue 3.5.45 |
| Drizzle | `1.0.0-rc.5`. La estable es la 0.45.4 |
| `pg` | 8.23.1 |
| PostgreSQL | 18.7 |
| Zod | 4.6.7 |
| Vitest | 5.1.0 |
| dependency-cruiser | 18.7.2 |
| ESLint y `typescript-eslint` | 10.15.0 y 8.72.2 |
| Prettier | 3.10.1 |
