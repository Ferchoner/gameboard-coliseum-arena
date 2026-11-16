# ADR-001: Backend sobre NestJS, Node.js y TypeScript

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-14 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | Pendiente P1 (framework backend) y vacío G-01 (lenguaje y runtime sin declarar) |
| **Relacionados** | ADR-002 (ORM), ADR-003 (realtime), ADR-004 (autenticación), ADR-005 (organización del repositorio) |

## 1. Contexto

- El proyecto exige un monolito modular para el MVP, un modelo server-authoritative y separación entre plataforma, tiempo real, sesiones y motores de juego (instrucciones del proyecto, reglas 2, 3 y 4).
- `docs/02-arquitectura.md` define 13 módulos de backend con límites de dependencia explícitos. El más estricto es que los motores de juego no importan REST, WebSocket, ORM, servicios de usuarios ni repositorios.
- La documentación nunca declaraba el lenguaje del backend, aunque `contracts/03-game-engine.ts` y todas las candidatas presuponían TypeScript sobre Node.js.
- El frontend preferido es Nuxt, Vue y TypeScript (`docs/01` § Frontend), lo que hace valioso compartir lenguaje y tipos de contrato.
- Supuestos usados en la evaluación: una sola instancia, clientes solo en navegador, cientos de conexiones simultáneas, equipo pequeño.

## 2. Decisión

El backend del MVP se construye con **NestJS sobre Node.js y TypeScript**.

Esto incluye declarar de forma explícita que el lenguaje del backend es TypeScript y el runtime es Node.js.

## 3. Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| Fastify directo | Más ligero, pero la estructura modular, la inyección de dependencias y las convenciones habría que diseñarlas y mantenerlas a mano. La separación entre módulos dependería solo de la disciplina. |
| AdonisJS | Cohesivo, pero acopla la elección de ORM y tiene un ecosistema menor. |
| Hono o Express sin framework | Comparten las desventajas de Fastify directo con menos soporte de esquemas. |

## 4. Consecuencias

**Positivas**
- Los módulos de NestJS se corresponden uno a uno con los de `docs/02`, de modo que los límites de la arquitectura quedan expresados en el código.
- La inyección de dependencias permite sustituir repositorios y servicios en pruebas, lo que favorece la regla 8.
- Gateways WebSocket y guards de autorización comunes a HTTP y WebSocket dentro del mismo framework.
- Convenciones conocidas y muy documentadas.

**Negativas**
- Más código ceremonial que con un framework mínimo.
- Dependencia de decoradores y de `reflect-metadata`.
- Riesgo de que el framework se filtre al dominio.

**Riesgos y mitigaciones**

| Riesgo | Mitigación |
|---|---|
| El motor de juego acaba dependiendo de NestJS | Regla verificable: `game-engine` no importa nada de `@nestjs/*`, del ORM ni del transporte (ver 5.5) |
| Lógica de negocio dentro de controladores o gateways | Los handlers solo delegan en servicios de aplicación, como ya exige `docs/02` § Dependencias y límites |
| Acoplamiento a una versión mayor | Fijar versiones exactas y revisar la guía de migración en cada cambio de versión mayor |

## 5. Subdecisiones

Aceptadas el 2026-11-14 junto con la decisión principal.

Datos verificados el 2026-11-14 en el registro de npm y en las fuentes de la sección 7.

| # | Subdecisión | Decisión | Motivo |
|---|---|---|---|
| 5.1 | Versión de NestJS | Línea 12 (última publicada: 12.5.0) | Es la versión con soporte activo. La línea 11 solo recibe correcciones de seguridad desde agosto de 2026 |
| 5.2 | Versión de Node.js | Node.js 26 | Es la versión LTS activa, con soporte activo hasta octubre de 2027 y de seguridad hasta abril de 2029. NestJS 12 exige 20.19 o 22.12 como mínimo |
| 5.3 | Formato de módulos | ESM | NestJS 12 publica sus paquetes en ESM y Nuxt también es ESM. Los proyectos ESM usan Vitest por defecto, lo que permitiría un solo ejecutor de pruebas en backend y frontend. Salvedad: hay informes de fricción con alias de rutas bajo ESM, por lo que no se usan alias |
| 5.4 | Adaptador HTTP | El adaptador por defecto (Express) | El tráfico de juego va por WebSocket y no pasa por el adaptador HTTP, así que el rendimiento de Fastify no aporta al MVP. Es reversible |
| 5.5 | Aislamiento del motor | `game-engine` es TypeScript puro, sin importar `@nestjs/*`, ORM ni transporte, verificado de forma automática | Protege las decisiones A2 y B2. La herramienta de verificación se elige al iniciar el Hito 1 |
| 5.6 | Configuración de TypeScript | Modo estricto | Coherente con contratos tipados y con la regla 8 |

**Quedan fuera de este ADR, para pasos posteriores:**
- Librería de validación de DTOs (la opción por defecto de NestJS o una basada en esquemas compartibles con el frontend). Se decide al iniciar el Hito 1.
- Organización del repositorio y forma de compartir tipos: ver ADR-005. El gestor de paquetes se decide al iniciar el Hito 1.
- El SDK de observabilidad propio de NestJS 12. No se adopta por ahora (regla 5 del proyecto: evitar dependencias no justificadas).

## 6. Dato relevante para la decisión de autenticación

Desde la versión 12.1, NestJS incluye soporte propio para cookies, protección CSRF y cabeceras de seguridad. Esto redujo las dependencias necesarias para la decisión de sesiones con cookie (ADR-004).

## 7. Referencias

- Auditoría: `docs/auditoria/auditoria-consistencia-y-plan-de-cierre.md`, sección 6, D1.
- `docs/02-arquitectura.md` § Módulos backend y § Dependencias y límites.
- Versiones y soporte de NestJS: https://endoflife.date/nestjs
- Novedades de NestJS 12: https://infoq.com/news/2026/04/nestjs-12-roadmap-esm y https://infoq.com/news/2026/10/nestjs-12-observability
- Versiones y soporte de Node.js: https://endoflife.date/nodejs
- Registro de npm (`@nestjs/core`), consultado el 2026-11-14.
