# ADR-003: Tiempo real con WebSocket nativo y protocolo propio

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-14 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | Pendiente P4 en la parte de transporte. La semántica del protocolo se define en `contracts/02-realtime.md` |
| **Depende de** | ADR-001 (NestJS sobre Node.js y TypeScript) |
| **Relacionados** | ADR-004 (autenticación), ADR-009 (reglas de dominio), ADR-010 (persistencia de partida) |

## 1. Contexto

- `contracts/02-realtime.md` define un sobre propio (`type`, `version`, `requestId`, `payload`) y exige semántica de aplicación para deduplicación, orden por `stateVersion` y resincronización.
- `docs/02` exige que los handlers WebSocket deleguen reglas y transiciones en servicios de aplicación.
- `docs/04` exige confirmar al cliente solo tras el commit y difundir vistas personalizadas por jugador.
- El MVP funciona en una sola instancia, con Redis como evolución opcional.
- Requisito añadido el 2026-11-14: además del juego en vivo habrá una modalidad por turnos con un tiempo total por jugador de 12, 24 o 36 horas (tentativo), frente a un máximo de 30 minutos en tiempo real. En ella cada visita del jugador equivale a una reconexión con resincronización desde el estado persistido.
- El análisis completo está en `docs/auditoria/comparacion-realtime.md`.

## 2. Decisión

El canal de tiempo real usa **WebSocket nativo con el protocolo propio** definido en `contracts/02-realtime.md`.

## 3. Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| Socket.IO | Obliga a usar su cliente. Sus acuses y salas se solapan con la semántica del contrato. Su recuperación de conexión no sustituye la resincronización por `stateVersion` |
| SSE más REST | Divide el canal en dos y complica el orden entre acciones y actualizaciones |
| Colyseus | Impone su propio modelo de sala y estado, incompatible con Room, Match, GameSession y el contrato del motor |
| uWebSockets.js | Innecesario a esta escala y fuera de los adaptadores oficiales de NestJS |

## 4. Consecuencias

**Positivas**
- El sobre del contrato se usa sin cambios y hay una sola capa de semántica.
- Protocolo estándar: sirve el cliente nativo del navegador y el cliente WebSocket incorporado en Node.js para las pruebas.
- Menos dependencias, en el servidor y en el cliente.
- El módulo `realtime` queda como gateway fino.

**Negativas**
- Hay que construir heartbeats, reconexión en el cliente y un registro de suscripciones.
- No hay transporte alternativo si un proxy bloquea WebSocket.

**Riesgos y mitigaciones**

| Riesgo | Mitigación |
|---|---|
| Lógica de negocio dentro del gateway | Los handlers solo validan el sobre y delegan (5.2) |
| Mensajes emitidos antes del commit | Toda salida pasa por una única interfaz de difusión (5.3) |
| Mensajes procesados antes de autenticar | Autenticación en el handshake, no en `handleConnection` (5.4) |
| Conexiones muertas que ocupan recursos | Heartbeats con cierre por inactividad (5.6) |
| Mensajes abusivos | Límite de tamaño desde el inicio (5.5); límites de frecuencia definidos en el protocolo |

## 5. Condiciones

Aceptadas el 2026-11-14 junto con la decisión principal.

| # | Condición | Motivo |
|---|---|---|
| 5.1 | Usar el adaptador WebSocket oficial de NestJS, configurando su analizador de mensajes para aceptar el sobre de `contracts/02` | Evita mantener un adaptador propio. Verificado en la documentación de NestJS |
| 5.2 | `realtime` es el único módulo que conoce el transporte. Sus handlers validan el sobre y delegan en servicios de aplicación | `docs/02` § Dependencias y límites |
| 5.3 | Todo mensaje saliente pasa por una única interfaz de difusión; los handlers no responden directamente | Garantiza que solo se confirma tras el commit y deja un punto único donde entraría Redis con varias instancias |
| 5.4 | La autenticación se resuelve en el handshake | La documentación de NestJS advierte que `handleConnection` no actúa como barrera |
| 5.5 | Límite de tamaño de mensaje configurado en el servidor | Protección básica frente a abuso |
| 5.6 | Heartbeats en el servidor y reconexión con espera progresiva en el cliente, como código propio del frontend | Sustituyen lo que Socket.IO traía de serie |
| 5.7 | Registro de suscripciones por sala y por partida en memoria | Coherente con una sola instancia |

**Quedan fuera de este ADR:**
- Semántica del protocolo: acuses, orden, resincronización, intervalos de heartbeat, límites de frecuencia y distinción entre órdenes y notificaciones. Se define en `contracts/02-realtime.md`.
- Aviso de turno a jugadores desconectados en la modalidad por turnos: ver ADR-008.

## 6. Referencias

- `docs/auditoria/comparacion-realtime.md`, con las fuentes consultadas el 2026-11-14.
- `contracts/02-realtime.md`.
- `docs/02-arquitectura.md` § Dependencias y límites.
- `docs/04-flujos-y-persistencia.md` § Jugada confirmada.
- Adaptadores WebSocket de NestJS: https://docs.nestjs.com/websockets/adapter
- Gateways de NestJS: https://docs.nestjs.com/websockets/gateways
