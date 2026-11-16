# D3. Transporte de tiempo real: comparación actualizada

> **Documento histórico de análisis.** Se conserva como registro del razonamiento previo a la decisión. No se mantiene al día. La decisión vigente está en [ADR-003](../adr/0003-realtime-websocket-nativo.md).

**Paso 3 del plan de cierre.** Depende de D1 (NestJS, aprobada).
**Estado:** decidido el 2026-11-14 a favor del WebSocket nativo con protocolo propio. Lo que sigue es el análisis previo a la decisión.
**Datos verificados el 2026-11-14** en el registro de npm y en la documentación oficial de NestJS (fuentes al final).

**Alcance de esta decisión.** Aquí se elige solo el transporte. La semántica del protocolo (acuses de recibo, orden por `stateVersion`, resincronización, heartbeats, límites) se formaliza en el Paso 10 y no queda decidida con esta elección.

---

## 1. Punto de partida en la documentación

| Requisito | Origen |
|---|---|
| Sobre propio con `type`, `version`, `requestId` y `payload` | `contracts/02` § Sobre común |
| Deduplicación y correlación por `requestId` | `contracts/02` § Seguridad; `docs/04` § Jugada confirmada |
| Orden por `stateVersion` y resincronización al reconectar | `contracts/02` § Semántica a fijar |
| Confirmar al cliente solo tras el commit | `docs/04` § Jugada confirmada |
| Vistas personalizadas por jugador | `docs/02` § Dependencias y límites |
| Los handlers delegan en servicios de aplicación | `docs/02` § Dependencias y límites |
| Una sola instancia en el MVP; Redis opcional más adelante | `docs/04` § Persistencia propuesta |

La documentación ya obliga a definir a nivel de aplicación la deduplicación, el orden y la resincronización, con independencia del transporte.

## 2. Qué ofrece NestJS 12

NestJS admite dos plataformas WebSocket de serie y permite escribir adaptadores propios.

| Aspecto | Adaptador `ws` (WebSocket nativo) | Adaptador Socket.IO |
|---|---|---|
| Paquete | `@nestjs/platform-ws` 12.5.0, sobre `ws` 8.x | `@nestjs/platform-socket.io` 12.5.0, sobre `socket.io` 4.8.4 |
| Formato de mensaje | Por defecto `{ event, data }`. Admite un analizador configurable (`messageParser`) para aceptar otro formato | Eventos con nombre del protocolo de Socket.IO |
| Namespaces | No los admite | Sí |
| Salas | No las trae; hay que mantener un registro propio | Sí |
| Autenticación al conectar | Mediante la verificación del cliente en el handshake (`verifyClient`) | Mediante middleware de conexión |

Dos datos de la documentación de NestJS que condicionan el diseño con cualquiera de las dos opciones:

1. **El sobre del contrato es compatible con el adaptador nativo.** El analizador configurable permite recibir el sobre de `contracts/02` tal como está, sin escribir un adaptador propio.
2. **`handleConnection` no sirve como barrera de autenticación.** NestJS no espera a que termine, así que podrían procesarse mensajes de un cliente antes de desconectarlo. La autenticación debe hacerse en el handshake. Esto enlaza con la decisión de autenticación (Paso 4).

## 3. Opciones

### Opción A. WebSocket nativo con el protocolo propio de `contracts/02`

| Ventajas | Desventajas |
|---|---|
| El sobre ya definido se usa sin cambios | Hay que implementar heartbeats y detección de conexiones muertas |
| Protocolo estándar: sirve el cliente nativo del navegador y el cliente WebSocket incorporado en Node.js para las pruebas, sin dependencias en el cliente | Hay que implementar en el frontend la reconexión con espera progresiva |
| Una sola capa de semántica: la del contrato | Hay que mantener el registro de suscripciones por sala y partida |
| Menos dependencias y menos peso | Sin transporte alternativo si un proxy bloquea WebSocket, algo hoy poco frecuente |
| Evolución a varias instancias mediante una interfaz de difusión con Redis detrás | |

### Opción B. Socket.IO

| Ventajas | Desventajas |
|---|---|
| Trae reconexión, heartbeats, salas y acuses de recibo | Protocolo propio sobre WebSocket: obliga a usar su cliente en el frontend y en cualquier cliente futuro |
| Transporte alternativo por HTTP | Sus acuses y sus salas se solapan con el sobre y la semántica del contrato, lo que deja dos capas con la misma responsabilidad |
| Adaptador para Redis si algún día hay varias instancias | Su recuperación de conexión no sustituye la resincronización por `stateVersion`, que hay que implementar igualmente |
| Es la opción más documentada en NestJS | Con varias instancias y transporte alternativo exige afinidad de sesión en el balanceador |

### Opción C. Otra

| Alternativa | Valoración |
|---|---|
| SSE para recibir y REST para enviar | Usa solo HTTP, pero divide el canal en dos y complica el orden entre acciones y actualizaciones |
| Colyseus | Trae salas y sincronización de estado, pero impone su propio modelo de sala y estado, que choca con Room, Match, GameSession y con el contrato del motor |
| uWebSockets.js | Máximo rendimiento, innecesario a esta escala y fuera de los adaptadores oficiales de NestJS |

## 4. Recomendación

**[RECOMENDACIÓN] Opción A, WebSocket nativo con el protocolo de `contracts/02`.**

1. **Evita duplicar responsabilidades.** La documentación ya exige deduplicación por `requestId`, orden por `stateVersion` y resincronización propias. Lo que Socket.IO añadiría encima se solapa con eso.
2. **El contrato vigente encaja sin cambios.** El adaptador nativo de NestJS acepta el sobre actual mediante su analizador configurable.
3. **Lo que hay que construir es poco y acotado.** Heartbeats, reconexión en el cliente y un registro de suscripciones en memoria, coherente con una sola instancia.
4. **Menos dependencias** (regla 5) y un módulo `realtime` que queda como gateway fino (regla 2).

**Condiciones que propongo dejar en el ADR-003:**
- `realtime` es el único módulo que conoce el transporte. Sus handlers solo validan el sobre y delegan en servicios de aplicación.
- Todo mensaje saliente pasa por una única interfaz de difusión. Los handlers no responden directamente, porque la confirmación solo se emite tras el commit. Esa interfaz es el punto donde entraría Redis si hubiera varias instancias.
- La autenticación se resuelve en el handshake, no en `handleConnection`.
- Límite de tamaño de mensaje configurado en el servidor desde el inicio.

**Dónde es más débil esta recomendación.** Si prefieres minimizar el código propio de infraestructura y aceptas depender del cliente de Socket.IO, la opción B ahorra la reconexión y los heartbeats. El coste es convivir con dos capas de semántica.

**Coste de reversión:** bajo, siempre que los handlers deleguen en servicios de aplicación y la difusión pase por una interfaz.

## 5. Fuentes

- Adaptadores WebSocket de NestJS: https://docs.nestjs.com/websockets/adapter
- Gateways de NestJS: https://docs.nestjs.com/websockets/gateways
- Registro de npm: `@nestjs/platform-ws`, `@nestjs/platform-socket.io`, `ws`, `socket.io`, `colyseus`. Consultado el 2026-11-14.

---

## 6. Adenda del 2026-11-14: modalidad por turnos con reloj de horas

Después de preparar esta comparación indicaste que las salas admitirán también una modalidad por turnos. Después precisaste que el límite es un tiempo total por jugador, tentativamente de 12, 24 o 36 horas, y de hasta 30 minutos en tiempo real.

**No cambia la recomendación.** Motivos:

1. El aviso a un jugador desconectado de que le toca jugar no lo resuelve ningún transporte WebSocket. Es una capacidad aparte (notificación push, correo o indicador al volver) que se decide en el Paso 6.
2. En esta modalidad cada visita del jugador equivale a una reconexión con resincronización desde el estado persistido. Eso es lo que el protocolo propio ya exige mediante `stateVersion`, y la recuperación de conexión de Socket.IO no lo cubre.
3. Los plazos largos no pueden depender de la conexión ni de temporizadores en memoria. Se resuelven con fechas límite persistidas, fuera del transporte.

El análisis completo del impacto está en la sección 9 de `auditoria-consistencia-y-plan-de-cierre.md`.
