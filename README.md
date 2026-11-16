# Plataforma de Juegos de Mesa en Línea

Una plataforma web para jugar juegos de mesa en línea contra otras personas, en tiempo real o por turnos. El primer juego es Cuatro en raya.

**Estado:** la arquitectura está decidida, los contratos están en su versión 1 y está implementado el **corte vertical** completo: el **Hito 1**, la base de la plataforma (cuentas con registro, entrada y salida, catálogo de juegos y un frontend mínimo); el **Hito 2**, las salas y el canal de tiempo real (crear una sala, entrar, salir, marcarse listo y ver los cambios en vivo), y el **Hito 3**, Cuatro en raya en tiempo real (la partida empieza sola cuando todos están listos, con tablero, relojes, rendición, resultado, historial y revancha). Falta el resto del MVP: recuperación ante cortes y reinicios, modalidad por turnos, cuenta, estadísticas y administración. El reparto del resto del MVP en hitos se aceptó al terminar el corte vertical, y el Hito 4 está autorizado. Sus decisiones se aceptaron en ADR-015 y está en construcción. Cada hito se implementa solo cuando se autoriza de forma explícita.

## Qué hay aquí

| Carpeta | Contenido |
|---|---|
| [`docs/`](docs/) | Visión, arquitectura, modelo de datos y flujos |
| [`docs/adr/`](docs/adr/README.md) | Las quince decisiones de arquitectura aceptadas, con sus alternativas y consecuencias |
| [`docs/auditoria/`](docs/auditoria/README.md) | El análisis que precedió a las decisiones. Es histórico y no se mantiene al día |
| [`contracts/`](contracts/) | La API, el protocolo de tiempo real, el contrato del motor de juego, el catálogo de errores y la matriz de permisos |
| [`planning/`](planning/) | El backlog por hitos y el registro de lo decidido y lo abierto |
| [`apps/backend/`](apps/backend/) | El servidor: la API y el canal de tiempo real |
| [`apps/frontend/`](apps/frontend/) | La aplicación web |
| [`packages/contracts/`](packages/contracts/) | Tipos y esquemas de la API y del protocolo, y catálogo de errores. Lo usan el backend y el frontend |
| [`packages/game-engine/`](packages/game-engine/) | El contrato de los motores de juego, su registro y el motor de Cuatro en raya. No depende de nada |
| [`e2e/`](e2e/) | Pruebas en navegador: dos personas juegan una partida entera contra el servidor y la base de datos reales |

## Cómo ejecutarlo en local

Hace falta [Node.js](https://nodejs.org/) 26.13 o posterior de la línea 26, [pnpm](https://pnpm.io/) 12 y [Docker](https://www.docker.com/) para la base de datos. Funciona en Windows, macOS y Linux.

```sh
pnpm install     # instala las dependencias de todos los paquetes
pnpm db:up       # arranca PostgreSQL 18 en Docker
pnpm dev         # compila, aplica las migraciones y arranca la API y el frontend
```

Con eso, el frontend queda en <http://localhost:3001> y la API en <http://localhost:3000>. Son dos orígenes del mismo sitio, igual que en producción (ADR-004). Al cambiar un archivo, lo afectado se vuelve a compilar y se reinicia solo.

### Modo HTTPS

El mismo código se puede probar con HTTPS, que es como funcionará publicado: la cookie de sesión lleva `Secure` y el prefijo `__Host-`.

```sh
pnpm dev:cert    # una sola vez: crea un certificado para localhost en .certs/
pnpm dev:https   # frontend en https://localhost:3444 y API en https://localhost:3443
```

`pnpm dev:cert` usa [mkcert](https://github.com/FiloSottile/mkcert) si está instalado, y entonces el navegador confía en el certificado. En Windows se instala con `winget install FiloSottile.mkcert` o con `choco install mkcert`. Si no lo está, crea con `openssl` un certificado firmado por sí mismo. En ese caso hay que abrir una vez <https://localhost:3443/health> y <https://localhost:3444> y aceptar el aviso del navegador en las dos direcciones. Si no se acepta el de la API, el frontend no puede hablar con ella.

### Configuración

Nada es obligatorio en local. Para cambiar la base de datos, el registro de actividad o los límites de las salas y del canal de tiempo real, copia [`apps/backend/.env.example`](apps/backend/.env.example) como `apps/backend/.env`. Los puertos y los orígenes los fija el modo elegido.

### Órdenes

| Orden | Qué hace |
|---|---|
| `pnpm dev`, `pnpm dev:https` | Arranca el entorno local en HTTP o en HTTPS |
| `pnpm db:up`, `pnpm db:down` | Arranca o detiene la base de datos |
| `pnpm db:migrate` | Aplica las migraciones pendientes |
| `pnpm test` | Ejecuta las pruebas. Las del backend usan la base de datos `gameboard_test`, que `pnpm db:up` crea |
| `pnpm test:e2e` | Ejecuta las pruebas en navegador. Antes hay que construir con `pnpm build`, tener la base de datos en marcha y `pnpm dev` parado, porque usan sus mismos puertos. La primera vez hay que descargar el navegador con `pnpm --filter @gameboard/e2e exec playwright install chromium`. Usan su propia base de datos, `gameboard_e2e`, que crean de cero cada vez |
| `pnpm check` | Todo lo que se comprueba en cada pull request: formato, análisis, reglas de dependencias, compilación, tipos y pruebas |
| `pnpm build` | Compila los paquetes y el backend, y genera el frontend como archivos estáticos en `apps/frontend/.output/public` |
| `pnpm format` | Da formato al código |

## Orden de lectura

1. [`docs/01-vision-alcance.md`](docs/01-vision-alcance.md): qué es el producto y qué entra en el MVP.
2. [`docs/02-arquitectura.md`](docs/02-arquitectura.md): piezas, módulos y límites entre ellos.
3. [`docs/03-dominio-datos.md`](docs/03-dominio-datos.md): modelo de datos.
4. [`docs/04-flujos-y-persistencia.md`](docs/04-flujos-y-persistencia.md): una partida de principio a fin.
5. [`contracts/01-rest-api.md`](contracts/01-rest-api.md) y [`contracts/01-rest-api.yaml`](contracts/01-rest-api.yaml): API REST.
6. [`contracts/02-realtime.md`](contracts/02-realtime.md) y [`packages/contracts/src/realtime.ts`](packages/contracts/src/realtime.ts): protocolo de tiempo real.
7. [`contracts/03-game-engine.md`](contracts/03-game-engine.md) y [`packages/game-engine/src/contract.ts`](packages/game-engine/src/contract.ts): contrato del motor de juego.
8. [`contracts/04-error-catalog.md`](contracts/04-error-catalog.md): catálogo de errores.
9. [`contracts/05-permissions.md`](contracts/05-permissions.md): matriz de permisos.
10. [`planning/decisiones-y-pendientes.md`](planning/decisiones-y-pendientes.md): qué está decidido y qué sigue abierto.
11. [`planning/backlog-mvp.md`](planning/backlog-mvp.md): hitos.
12. [`planning/cierre-hito-0.md`](planning/cierre-hito-0.md): comprobación de que la arquitectura quedó cerrada.

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

La lista completa está en [`planning/decisiones-y-pendientes.md`](planning/decisiones-y-pendientes.md).

## Avisos

- La carpeta `contracts/` contiene los contratos escritos. Sus tipos están en `packages/contracts` y `packages/game-engine`, y hay pruebas que comprueban que el código y los contratos coinciden.
- El proyecto es independiente de cualquier otro. No comparte repositorios, bases de datos ni servicios.
- Si un documento discrepa de un ADR o de un contrato, valen el ADR y el contrato.
