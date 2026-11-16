# Arquitectura lógica y módulos

| Campo | Valor |
|---|---|
| **Estado** | Versión 1, aceptada el 2026-11-16 por Fernando Hernandez Argueta |
| **Sustituye a** | El documento de arquitectura inicial |
| **Recoge** | ADR-001 a ADR-007, el modelo de datos y los cinco contratos |
| **Resuelve** | Hallazgo C-19 (el diagrama dibujaba la base de datos debajo del motor) |

**Cómo leer este documento.** Casi todo resume decisiones ya aceptadas y cita su origen. Lo que este documento añade por su cuenta está en la [sección 9](#9-decisiones-propias-de-este-documento).

---

## 1. Vista general

```mermaid
flowchart LR
    P["Jugador<br/>en su navegador"]
    F["Frontend<br/>Nuxt, archivos estáticos"]
    B["Backend<br/>NestJS, una instancia"]
    D[("PostgreSQL")]
    M["Envío de correo"]

    P -->|carga la aplicación| F
    P -->|API REST, con cookie de sesión| B
    P <-->|WebSocket, con la misma cookie| B
    B --> D
    B -.->|recuperación de contraseña| M
```

| Pieza | Tecnología | Origen |
|---|---|---|
| Frontend | Nuxt, Vue y TypeScript. Se renderiza en el navegador, con las páginas públicas pregeneradas. No tiene servidor propio | ADR-006; ADR-007, acuerdo B9 |
| Backend | NestJS 12 sobre Node.js 26, con TypeScript estricto. Un solo proceso | ADR-001 |
| Base de datos | PostgreSQL, con Drizzle y migraciones SQL versionadas | ADR-002 |
| Tiempo real | WebSocket nativo con protocolo propio | ADR-003 |
| Identidad | Sesión de servidor con cookie | ADR-004 |
| Envío de correo | Solo para recuperar la contraseña. En local se simula. El servicio real se elige con el alojamiento | ADR-008, punto 17 |

El frontend y el backend se alojan por separado, en subdominios de un mismo dominio (ADR-004). Dónde se alojan está aplazado. No hay Redis ni varias instancias en el MVP (ADR-007, acuerdo B7).

---

## 2. Qué va por cada canal

| Canal | Qué lleva | Contrato |
|---|---|---|
| **API REST** | Registro y sesión, cuenta, perfiles, catálogo, salas (crear, listar, ver, entrar, salir, marcarse listo), consulta de partidas, administración | [`01-rest-api.yaml`](../contracts/01-rest-api.yaml) |
| **WebSocket** | Suscripción a salas y partidas, jugadas, rendición, y los avisos en vivo del servidor | [`02-realtime.md`](../contracts/02-realtime.md) |

Cada operación existe en un solo canal. La API cambia las salas; el WebSocket lleva la partida (decisiones T1 y T2 del protocolo).

---

## 3. Dentro del backend

```mermaid
flowchart TB
    API["Controladores de la API"]
    RT["realtime<br/>conexiones, suscripciones y difusión"]
    PLAT["Plataforma<br/>auth · users · profiles · players<br/>games · rooms · statistics · admin"]
    PART["Partida<br/>matches · game-sessions"]
    ENGINE["game-engine<br/>TypeScript puro, sin dependencias"]
    DB[("PostgreSQL")]

    API --> PLAT
    API --> PART
    RT --> PLAT
    RT --> PART
    PLAT -->|"games lee lo que declara cada motor"| ENGINE
    PART -->|"game-sessions pide jugadas y vistas"| ENGINE
    PLAT -->|repositorios| DB
    PART -->|repositorios| DB
```

Las flechas indican quién usa a quién.

- **El motor de juego no tiene ninguna flecha de salida**: no conoce la base de datos, la red ni los demás módulos. Recibe un estado y una jugada, y devuelve el estado nuevo. Quien guarda y quien avisa es la capa de sesión de juego.
- **Los avisos a los clientes van en sentido contrario y no aparecen en el diagrama.** Los módulos no conocen el WebSocket: publican a través de una interfaz de difusión, que `realtime` implementa, y solo después de guardar (regla 7 de la sección 5).

---

## 4. Módulos del backend

| Módulo | Responsabilidad | Tablas que le pertenecen |
|---|---|---|
| `auth` | Registro, inicio y cierre de sesión, sesiones de autenticación, contraseñas y su recuperación. Comprueba sesión y rol en la entrada | `auth_sessions`, `password_reset_tokens` |
| `users` | La cuenta: credenciales, estado y rol | `users` |
| `profiles` | Cómo se presenta la persona | `profiles` |
| `players` | La identidad que participa en salas y partidas | `players` |
| `games` | Catálogo de juegos y versiones. **No contiene reglas** | `games`, `game_versions` |
| `rooms` | Salas: capacidad, pertenencia, marca de listo, cierre por inactividad | `rooms`, `room_players` |
| `matches` | La partida como registro: participantes, asientos, estado y resultado | `matches`, `match_players`, `match_results`, `player_results` |
| `game-sessions` | El estado vivo de una partida: aplica jugadas con el motor, lleva los relojes, detecta vencimientos y abandonos, y recupera tras un reinicio | `game_sessions`, `match_actions`, `server_liveness` |
| `realtime` | Conexiones WebSocket, suscripciones en memoria, presencia y difusión. Es el único módulo que conoce el transporte | Ninguna |
| `statistics` | Contadores por jugador y juego | `game_statistics` |
| `admin` | Operaciones de administración. No tiene datos propios: usa los demás módulos | Ninguna |
| `database`, `config`, `common` | Infraestructura compartida y acotada: conexión, configuración, sobre de respuesta y errores | Ninguna |

`game-engine` no es un módulo del backend: es un paquete aparte que el backend usa (ADR-005). Contiene el contrato del motor y los motores concretos.

Las 17 tablas del [modelo de datos](03-dominio-datos.md) tienen un único módulo dueño.

---

## 5. Dependencias y límites

| # | Regla | Origen |
|---|---|---|
| 1 | El motor de juego no importa NestJS, Drizzle, WebSocket ni ningún módulo del backend. Se comprueba de forma automática | ADR-001, condición 5.5 |
| 2 | El motor conoce asientos, no jugadores ni cuentas. La plataforma traduce | Contrato del motor |
| 3 | La sesión de juego obtiene el motor de un registro, por nombre corto del juego y versión | ADR-007, acuerdo B3 |
| 4 | El resultado por asiento lo determina siempre el motor. La capa de sesión añade el motivo | ADR-009, regla 7.17 |
| 5 | El reloj lo lleva la capa de sesión, no el motor | ADR-009, regla 7.8 |
| 6 | `realtime` es el único módulo que conoce el transporte. Valida el sobre y delega en los servicios de aplicación | ADR-003, condición 5.2 |
| 7 | Todo mensaje saliente pasa por una única interfaz de difusión, y solo después de guardar | ADR-003, condición 5.3; ADR-010, regla 8.9 |
| 8 | Todo acceso a datos pasa por repositorios por módulo. Ningún controlador, gateway ni motor importa Drizzle | ADR-002, condición 5.4 |
| 9 | La identidad sale de la sesión de autenticación. Nunca de un identificador enviado por el cliente | ADR-007, acuerdo B11 |
| 10 | El cliente recibe la vista de su asiento, que calcula el motor. Nunca el estado completo | Contrato del motor; protocolo |
| 11 | Sesión y rol se comprueban en la entrada, en un único sitio para la API y el WebSocket. Pertenencia y estado, en el módulo dueño, dentro de la transacción | Matriz de permisos, sección 7 |
| 12 | PostgreSQL es la fuente de verdad. La memoria es una caché de sesiones de juego que se reconstruye desde la base de datos | ADR-007, acuerdo B6 |

---

## 6. Lo que vive solo en memoria

| Dato | Módulo | Qué pasa si se pierde |
|---|---|---|
| Conexiones abiertas y suscripciones | `realtime` | Los clientes reconectan y se vuelven a suscribir (ADR-003, condición 5.7) |
| Presencia: quién tiene una conexión abierta | `realtime` | Se recalcula con las conexiones nuevas (ADR-009, regla 7.24) |
| Sesiones de juego cargadas | `game-sessions` | Se vuelven a cargar desde la base de datos al necesitarlas (ADR-009, regla 7.22) |
| Temporizadores de reloj y de abandono | `game-sessions` | Una revisión periódica de la base de datos cubre los que se pierdan (ADR-010, regla 8.17) |
| Contadores de los límites de frecuencia | Entrada | Se reinician |

Nada de esto es fuente de verdad.

---

## 7. Organización del repositorio

Un solo repositorio con espacios de trabajo (ADR-005). Los nombres de carpeta son una **propuesta pendiente de confirmación** desde ese ADR.

| Carpeta | Contenido | Puede depender de |
|---|---|---|
| `apps/backend` | El backend, con los módulos de la sección 4 | `packages/contracts`, `packages/game-engine` |
| `apps/frontend` | La aplicación Nuxt | `packages/contracts` |
| `packages/contracts` | Tipos de la API y del protocolo, y el catálogo de errores | Nada del proyecto |
| `packages/game-engine` | Contrato del motor y motores concretos | Nada del proyecto |
| `docs/`, `contracts/`, `planning/` | Documentación, contratos escritos y plan | |

Hoy los contratos están en `contracts/`, como documentos. Al iniciar el Hito 1 sus tipos pasan a los dos paquetes y los documentos se quedan como explicación.

---

## 8. Lo que se decide al iniciar el Hito 1

Estos puntos quedaron aplazados a propósito en sus ADR, para decidirlos con las versiones del momento.

| Asunto | Origen |
|---|---|
| Gestor de paquetes y herramienta para orquestar tareas | ADR-005 |
| Herramienta que comprueba el aislamiento del motor y la regla de dependencias | ADR-001, ADR-005 |
| Librería de validación de datos de entrada | ADR-001 |
| Versión exacta de Drizzle, controlador de PostgreSQL y tamaño del conjunto de conexiones | ADR-002 |
| Gestión de sesiones propia o con librería. La preferencia es propia | ADR-004 |
| Confirmar que el Argon2id incorporado en Node.js 26 está estable | ADR-004, condición 5.9 |
| Si el frontend usa el paquete del motor para mostrar las jugadas válidas | ADR-005 |
| Tipos que hoy están escritos más de una vez, en la API, en el protocolo y en el motor. Pasan a definirse una sola vez | Notas de la API, sección 8 |
| Comprobación de salud del servidor | Notas de la API, sección 5 |

---

## 9. Decisiones propias de este documento

Lo que este documento añade por su cuenta. Fueron **aceptadas el 2026-11-16** por Fernando Hernandez Argueta.

| ID | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| D1 | **El módulo `sessions` pasa a llamarse `game-sessions`** | Mantener `sessions` | El glosario pide no usar "sesión" a secas, porque también existe la sesión de autenticación (ADR-011, sección 6) |
| D2 | **Se retira el módulo `rankings`** de la lista | Dejarlo vacío | La puntuación y la clasificación son posteriores al MVP (ADR-008, punto 14). El módulo se crea cuando haga falta |
| D3 | **Cada tabla pertenece a un solo módulo** (sección 4), y solo ese módulo la lee y la escribe. Los demás se lo piden a través de sus servicios | Permitir que cualquier módulo consulte cualquier tabla | Es lo que mantiene los límites del monolito modular. Sin esta regla, los módulos acaban acoplados por la base de datos |
| D4 | **Una transacción puede abarcar varios módulos.** El módulo que la abre la pasa a los servicios de los otros, y cada uno sigue tocando solo sus tablas | Una transacción por módulo, coordinadas con mensajes | El final de una partida escribe en `game-sessions`, `matches`, `statistics` y `rooms` a la vez, y tiene que ser todo o nada (ADR-010, reglas 8.14 y 8.15) |
| D5 | **El envío de correo es una interfaz pequeña con dos implementaciones**: una simulada para local y otra real, que se escribe cuando se elija el servicio | Acoplar `auth` a un servicio concreto | El servicio real está aplazado con el alojamiento. Así la recuperación de contraseña se puede construir y probar antes |
| D6 | **`game-sessions` es dueño del registro de jugadas y de la anotación de actividad del servidor** | Ponerlos en `matches` y en `common` | El registro de jugadas se escribe en la misma operación que el estado vivo, y la anotación solo existe para ajustar los relojes tras una caída |

---

## 10. Asuntos abiertos

| Asunto | Situación |
|---|---|
| **Quién llama a quién entre `rooms` y `matches`.** `rooms` tiene que arrancar la partida cuando la sala se completa, y el final de la partida tiene que devolver la sala a la espera. Son dos módulos que se necesitan en los dos sentidos | Se resuelve al iniciar el Hito 2. La opción preferente es que `rooms` defina una interfaz pequeña para "empezar partida" y `matches` la implemente, de modo que la dependencia vaya en un solo sentido |
| **Alojamiento, copias de seguridad y supervisión** | Aplazado por decisión de quien decide. Tendrá su propio ADR |
| **Paso a varias instancias.** Hoy la serialización de jugadas, las suscripciones y los temporizadores viven en la memoria de un proceso | Fuera del MVP. La interfaz única de difusión y la revisión periódica de relojes son los dos puntos preparados para ello |
