# Arquitectura lógica y módulos

```text
Nuxt/Vue (plataforma) + cliente del juego
       | REST              | WebSocket
       v                   v
  API controllers      Realtime Gateway
       |                   |
       +--- servicios de aplicación ---+
                         |
              Room / Match / Session
                         |
                   Game Engine
                         |
              ConnectFourEngine
                         |
              PostgreSQL / memoria
```

**REST**: autenticación, perfiles, catálogo, creación/consulta/ingreso/salida de salas, historial y administración.  
**WebSocket**: suscripciones, estado de sala, ready, inicio de partida, acciones, difusión de estados, errores y reconexión.

## Módulos backend
- `auth`: identidad, credenciales, autorización.
- `users`, `profiles`, `players`: cuenta, perfil público, identidad de juego.
- `games`: catálogo y versiones, **no reglas**.
- `rooms`: capacidad, membresía, estado de espera.
- `matches`: registro histórico y resultado.
- `sessions`: coordinación y estado de partidas activas.
- `realtime`: conexiones, autenticación, routing y broadcast.
- `game-engine`: contratos y motores específicos.
- `statistics`, `rankings`: proyecciones derivadas de resultados.
- `admin`: operaciones autorizadas de plataforma.
- `database`, `config`, `common`: infraestructura transversal acotada.

## Dependencias y límites
- Los motores de juegos no importan REST, WebSocket, ORM, servicios de usuarios ni repositorios.
- Los handlers WebSocket delegan reglas y transiciones a servicios de aplicación.
- La sesión usa el motor mediante una interfaz y factory/registry por `gameId` + `gameVersion`.
- `GameResult` alimenta resultados persistidos y posteriormente estadísticas/rating.
- Los servicios deben verificar permisos con identidad autenticada; no confiar en `playerId` enviado por el cliente.
- El estado visible al cliente se deriva mediante una vista por jugador; nunca filtrar información secreta de otros participantes.

## Estructura orientativa
```text
backend/src/{auth,users,profiles,players,games,rooms,matches,sessions,realtime,rankings,statistics,admin,game-engine,database,common,config}
backend/src/game-engine/{core,interfaces,implementations/connect-four}
backend/tests/{unit,integration,e2e,games}
frontend/{pages,components,composables,services/api,services/websocket,games/connect-four}
```

Estructura orientativa, no compromiso con un framework específico.
