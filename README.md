# Plataforma de Juegos de Mesa en Línea

Una plataforma web para jugar juegos de mesa en línea contra otras personas, en tiempo real o por turnos. El primer juego es Cuatro en raya.

**Estado:** la arquitectura está decidida y los contratos están en su versión 1. **La implementación no ha empezado**: este repositorio contiene solo documentación y contratos. No se escribe código hasta que se autorice de forma explícita.

## Qué hay aquí

| Carpeta | Contenido |
|---|---|
| [`docs/`](docs/) | Visión, arquitectura, modelo de datos y flujos |
| [`docs/adr/`](docs/adr/README.md) | Las once decisiones de arquitectura aceptadas, con sus alternativas y consecuencias |
| [`docs/auditoria/`](docs/auditoria/README.md) | El análisis que precedió a las decisiones. Es histórico y no se mantiene al día |
| [`contracts/`](contracts/) | La API, el protocolo de tiempo real, el contrato del motor de juego, el catálogo de errores y la matriz de permisos |
| [`planning/`](planning/) | El backlog por hitos y el registro de lo decidido y lo abierto |

## Orden de lectura

1. [`docs/01-vision-alcance.md`](docs/01-vision-alcance.md): qué es el producto y qué entra en el MVP.
2. [`docs/02-arquitectura.md`](docs/02-arquitectura.md): piezas, módulos y límites entre ellos.
3. [`docs/03-dominio-datos.md`](docs/03-dominio-datos.md): modelo de datos.
4. [`docs/04-flujos-y-persistencia.md`](docs/04-flujos-y-persistencia.md): una partida de principio a fin.
5. [`contracts/01-rest-api.md`](contracts/01-rest-api.md) y [`contracts/01-rest-api.yaml`](contracts/01-rest-api.yaml): API REST.
6. [`contracts/02-realtime.md`](contracts/02-realtime.md) y [`contracts/02-realtime.ts`](contracts/02-realtime.ts): protocolo de tiempo real.
7. [`contracts/03-game-engine.md`](contracts/03-game-engine.md) y [`contracts/03-game-engine.ts`](contracts/03-game-engine.ts): contrato del motor de juego.
8. [`contracts/04-error-catalog.md`](contracts/04-error-catalog.md): catálogo de errores.
9. [`contracts/05-permissions.md`](contracts/05-permissions.md): matriz de permisos.
10. [`planning/decisiones-y-pendientes.md`](planning/decisiones-y-pendientes.md): qué está decidido y qué sigue abierto.
11. [`planning/backlog-mvp.md`](planning/backlog-mvp.md): hitos.

Para saber por qué se decidió algo, el ADR correspondiente está en [`docs/adr/`](docs/adr/README.md).

## Decisiones principales

| Asunto | Decisión |
|---|---|
| Backend | NestJS sobre Node.js y TypeScript, como monolito modular |
| Datos | PostgreSQL con Drizzle. La base de datos es la fuente de verdad de toda partida |
| Tiempo real | WebSocket nativo con protocolo propio |
| Identidad | Sesión de servidor con cookie |
| Frontend | Nuxt, renderizado en el navegador |
| Juegos | Cada juego es un motor en TypeScript puro que cumple un contrato. El servidor tiene siempre la autoridad |
| Repositorio | Uno solo, con espacios de trabajo |

## Qué no está decidido

- El alojamiento, las copias de seguridad y la supervisión. Están aplazados y de momento se trabaja en local.
- Algunas propuestas que figuran en los documentos como pendientes de confirmación.

La lista completa está en [`planning/decisiones-y-pendientes.md`](planning/decisiones-y-pendientes.md).

## Avisos

- Los archivos TypeScript de `contracts/` contienen solo tipos. No son una implementación.
- El proyecto es independiente de cualquier otro. No comparte repositorios, bases de datos ni servicios.
- Si un documento discrepa de un ADR o de un contrato, valen el ADR y el contrato.
