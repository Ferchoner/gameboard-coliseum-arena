# Registro de decisiones y asuntos abiertos

| Campo | Valor |
|---|---|
| **Estado** | Versión 1 |
| **Sustituye a** | El registro inicial de decisiones y preguntas abiertas |

Este documento es un índice. No decide nada: dice dónde está cada decisión y qué sigue abierto. Si discrepa de un ADR o de un contrato, valen ellos.

---

## 1. Decisiones aceptadas

### Arquitectura

Están en [`docs/adr/`](../docs/adr/README.md). Las once primeras se aceptaron el 2026-11-14, las cuatro siguientes, el 2026-11-16, ADR-016, el 2026-11-18, y ADR-017, el 2026-11-19.

| ADR | Decisión |
|---|---|
| ADR-001 | Backend sobre NestJS, Node.js y TypeScript |
| ADR-002 | Drizzle sobre PostgreSQL |
| ADR-003 | WebSocket nativo con protocolo propio |
| ADR-004 | Sesión de servidor con cookie |
| ADR-005 | Un solo repositorio con espacios de trabajo |
| ADR-006 | Frontend renderizado en el navegador, con páginas públicas pregeneradas |
| ADR-007 | Línea base de doce acuerdos |
| ADR-008 | Alcance del MVP |
| ADR-009 | Reglas de dominio de salas, partidas y relojes |
| ADR-010 | Persistencia de partida |
| ADR-011 | Convenciones de nombres y glosario |
| ADR-012 | Decisiones de arranque del Hito 1 (S1 a S25): herramientas, versiones, validación, sesiones y entorno local |
| ADR-013 | Decisiones del Hito 2 (H1 a H20): salas, canal de tiempo real, avisos tras guardar y tareas periódicas. Incluye las elecciones C1 a C5, confirmadas después |
| ADR-014 | Decisiones del Hito 3 (K1 a K22): quién dirige la partida, estado siempre en la base de datos, relojes, el juego Cuatro en raya, frontend y pruebas en navegador. Incluye las elecciones L1 a L7, confirmadas el 2026-11-16 |
| ADR-015 | Decisiones del Hito 4 (V1 a V12): abandono por desconexión con margen de 5 segundos, no descontar el tiempo de una caída del servidor y pruebas de reinicio y de corte de red |
| ADR-016 | Decisiones del Hito 5 (N1 a N12): Cuatro en raya por turnos sin versión nueva, aviso de turno, lo que se ve al entrar, aplicación instalable sin dependencias, abandono en el móvil y pruebas. Aceptadas el 2026-11-18 |
| ADR-017 | Decisiones del Hito 6 (U1 a U18): criterio de aceptación, administración solo por API con una guía, orden para el rol, efectos de suspender y de cambiar el catálogo, correo simulado en archivos, recuperación de contraseña, estadísticas, pantallas y pruebas. Aceptadas el 2026-11-19 |

### Contratos y modelo, versión 1

| Documento | Aceptado | Decisiones propias |
|---|---|---|
| [Modelo de datos](../docs/03-dominio-datos.md) | 2026-11-14 | R1 a R10 |
| [Contrato del motor de juego](../contracts/03-game-engine.md) | 2026-11-15 | M1 a M11 |
| [Protocolo de tiempo real](../contracts/02-realtime.md) | 2026-11-15 | T1 a T16 |
| [API REST](../contracts/01-rest-api.md) | 2026-11-16 | A1 a A17 |
| [Catálogo de errores](../contracts/04-error-catalog.md) | 2026-11-16 | E1 a E8 y los ajustes J1 a J5 |
| [Matriz de permisos](../contracts/05-permissions.md) | 2026-11-16 | P1 a P7 |
| [Arquitectura lógica y módulos](../docs/02-arquitectura.md) | 2026-11-16 | D1 a D6 |

### Decisiones sueltas

Tomadas por quien decide fuera de un ADR. No cambian ningún contrato.

| Fecha | Asunto | Decisión | Se aplica en |
|---|---|---|---|
| 2026-11-16 | Reparto del resto del MVP en hitos (B1) | Cuatro hitos, en este orden: reconexión y recuperación, modalidad por turnos, cuenta y administración, y preparación para publicar | [`backlog-mvp.md`](backlog-mvp.md) |
| 2026-11-16 | Alta de juegos y versiones nuevos en el catálogo | Un juego o una versión nuevos llegan con su motor, mediante una migración, y quedan **inactivos**. Desde administración se activan, se desactivan y se elige la versión vigente. El alta no se hace por la API, como ya decía A5. Precisa K5 de ADR-014, que solo decidía el alta de Cuatro en raya, el primer juego, que entró ya activo. *Precisado el 2026-11-18 (ADR-016, N1):* una versión nueva es un cambio de reglas, de estado o de jugadas; los controles de tiempo que admite un juego pueden cambiar sin versión nueva | Cada juego o versión nuevos, y la administración del Hito 6 |

---

## 2. Los quince pendientes iniciales

El registro inicial dejaba quince asuntos por decidir. Así quedaron.

| # | Asunto | Situación | Dónde |
|---|---|---|---|
| 1 | Framework del backend | Cerrado | ADR-001 |
| 2 | Acceso a datos | Cerrado | ADR-002 |
| 3 | Autenticación | Cerrado | ADR-004 |
| 4 | Transporte de tiempo real, confirmaciones y reconexión | Cerrado | ADR-003 y el protocolo |
| 5 | Modelo de despliegue inicial | **Aplazado** | Sección 4 |
| 6 | Reutilización de la sala y revancha | Cerrado | ADR-009, reglas 7.11 y 7.31 |
| 7 | Estados y permisos de salas, partidas y sesiones | Cerrado | ADR-009 y la matriz de permisos |
| 8 | Qué se guarda de una partida y por cuánto tiempo | Cerrado | ADR-010 |
| 9 | Tiempo agotado, abandono, desconexión y recuperación | Cerrado | ADR-009, reglas 7.16 a 7.29 |
| 10 | Clasificación | Cerrado: posterior al MVP | ADR-008, punto 14 |
| 11 | Bots y juego en solitario | Cerrado: posterior al MVP | ADR-008, punto 20 |
| 12 | Licencias y derechos | Cerrado en parte: el nombre del primer juego. El resto, al elegir el segundo juego | ADR-008, sección 4 |
| 13 | Seguridad de las jugadas, límites de frecuencia e información oculta | Cerrado | El protocolo, la API, el contrato del motor y la matriz de permisos |
| 14 | Estadísticas correctas ante reintentos | Cerrado | ADR-010, regla 8.15 |
| 15 | Requisitos medibles de capacidad, latencia y disponibilidad | **Aplazado** | Sección 4 |

Las inconsistencias que el registro inicial pedía normalizar están resueltas. El detalle de cada una está en la auditoría, en [`docs/auditoria/`](../docs/auditoria/README.md).

---

## 3. Propuestas pendientes de confirmación

No son decisiones. No deben tratarse como aprobadas.

Las elecciones Y1 a Y8 que resultaron al construir el Hito 6, en la [sección 15 de ADR-017](../docs/adr/0017-decisiones-del-hito-6.md#15-lo-que-resultó-al-construir), pendientes de confirmar. Las decisiones U1 a U18 del Hito 6 se aceptaron el 2026-11-19. Las decisiones N1 a N12 del Hito 5 y sus elecciones Q1 a Q6 ([ADR-016, sección 14](../docs/adr/0016-decisiones-del-hito-5.md#14-lo-que-resultó-al-construir)) se confirmaron el 2026-11-18, y las elecciones W1 a W9 del Hito 4, el 2026-11-16.

---

## 4. Aplazado

Por decisión de quien decide, hasta que haya algo construido que revisar. Mientras tanto se trabaja en local.

| Asunto | Nota |
|---|---|
| Alojamiento del backend y de PostgreSQL | Tendrá su propio ADR. El análisis previo está en [`docs/auditoria/despliegue-y-requisitos.md`](../docs/auditoria/despliegue-y-requisitos.md) |
| Copias de seguridad y supervisión | Con el alojamiento |
| Requisitos medibles de capacidad, latencia y disponibilidad | Con el alojamiento |
| Servicio real de envío de correo | Con el alojamiento. En local se simula |

Lo ya aceptado condiciona estas decisiones: un proceso persistente, una sola instancia, y frontend y API en subdominios de un mismo dominio.

---

## 5. Asuntos abiertos

Reunidos de todos los documentos, por el momento en que toca resolverlos.

### Al iniciar el Hito 1

Cerrado. Las decisiones de arranque se aceptaron el 2026-11-16 y están en [ADR-012](../docs/adr/0012-decisiones-de-arranque.md). Con ellas se confirmaron también las dos propuestas que quedaban en ADR-004 y ADR-005.

### Durante la implementación

| Asunto | Cuándo | Dónde está anotado |
|---|---|---|
| Caída solo de la base de datos con el servidor en marcha: su tiempo se descuenta | Con el alojamiento y la supervisión, en el Hito 7 | ADR-015, sección 11 |
| Sacar de la sala a quien abandona una partida de más de dos jugadores que sigue en curso | Con el primer juego de más de dos jugadores | ADR-015, sección 13, W6 |
| Precisar en el protocolo el margen de desconexión y el abandono cuando faltan todos | La próxima vez que se autorice cambiar los contratos | ADR-015, sección 13 |
| Pruebas en navegador en otros navegadores además de Chromium, y en el modo HTTPS | Con la preparación para publicar, en el Hito 7 | ADR-014, sección 13 |
| Librería de componentes del frontend | Con la administración visual o un segundo juego | ADR-014, decisión K7 |
| Cierre de la conexión con el código 1008 cuando un cliente incumple el protocolo de forma repetida. Hoy cada mensaje inválido se rechaza, pero la conexión sigue abierta | Con los límites de frecuencia, en el Hito 7 | ADR-013, decisión H9 y sección 13 |
| Paso de Drizzle a la versión 1.0 definitiva, cuando se publique. Hoy se usa la candidata `1.0.0-rc.5` | Cuando salga | ADR-012, decisión S8 |
| Paso a TypeScript 7, cuando las herramientas lo admitan | Cuando salga la 7.1 | ADR-012, decisión S5 |
| Generar al construir el contenido del catálogo, y no solo la portada. Exige que la API esté disponible al construir. Hoy la portada se genera y la lista de juegos se pide en el navegador | Con el alojamiento | ADR-006; `apps/frontend/nuxt.config.ts` |
| Valores definitivos de los límites de frecuencia y de tamaño | Tras el corte vertical, con datos reales | Protocolo, sección 12; notas de la API, sección 4 |

### Antes de publicar

| Asunto | Dónde está anotado |
|---|---|
| Política de borrado de datos. Durante el MVP se conserva todo | Modelo de datos, sección 11 |
| Registro de acciones de administración | Modelo de datos, sección 11; matriz de permisos, sección 9 |
| Prueba de la cookie de sesión en Safari con un despliegue real | ADR-004 |

### Cuando llegue el juego que lo necesite

| Asunto | Dónde está anotado |
|---|---|
| Jugadas simultáneas: hoy la segunda jugada sobre la misma versión del estado se rechaza y hay que reenviarla | Notas del motor, sección 7; protocolo, sección 12 |
| Jugador retirado en una partida de más de dos que continúa | Notas del motor, sección 7; matriz de permisos, sección 9 |
| Derechos de arte y selección de juegos | ADR-008, sección 4 |

### Posterior al MVP

| Asunto | Dónde está anotado |
|---|---|
| Aviso de turno con la aplicación cerrada, por notificación push | ADR-008, punto 12 |
| Espectadores y salas privadas | Protocolo, sección 12; matriz de permisos, sección 9 |
| Nombre visible de un jugador sin cuenta, como un bot | Modelo de datos, sección 11 |
| Paso a varias instancias del servidor | `docs/02-arquitectura.md`, sección 10 |

---

## 6. Cómo se decide

- Una propuesta no es una decisión hasta que quien decide la confirma de forma explícita.
- Toda propuesta se presenta con sus alternativas, sus consecuencias y una recomendación.
- Una decisión aceptada no se reescribe. Si cambia, se anota el cambio con su fecha en el documento que la contiene, o se añade un ADR que la sustituye.
- No se añade ninguna dependencia, no se cambia ningún contrato y no se implementa nada fuera del alcance sin aprobación previa.
- No se escribe código de un hito hasta recibir su autorización explícita. Los Hitos 1 a 4 están autorizados, todos desde el 2026-11-16, el Hito 5, desde el 2026-11-18, y el Hito 6, desde el 2026-11-19. El Hito 7 no lo está.
