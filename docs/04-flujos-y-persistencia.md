# Vertical slice y persistencia

## Vertical slice Connect Four
1. Registro crea User, Profile y Player.
2. Login habilita REST y autenticación de WebSocket.
3. GET games muestra catálogo.
4. POST rooms crea sala WAITING con jugador anfitrión.
5. Segundo jugador se une y ambos se suscriben a actualizaciones.
6. PLAYER_READY modifica estado de sala y emite ROOM_STATE.
7. Inicio atómico crea Match, MatchPlayers y GameSession para versión fija del juego.
8. Factory resuelve ConnectFourEngine, crea estado inicial y publica MATCH_STARTED + vista inicial.
9. Cliente envía PLAYER_ACTION con DROP_TOKEN; servidor autentica, autoriza, serializa y valida.
10. Motor puro calcula nuevo estado, eventos y posible resultado.
11. Se persiste snapshot con versión monotónica, y resultado si terminó; después se difunde.
12. Al finalizar se registran resultados y se actualizan proyecciones de estadísticas/rating mediante proceso idempotente.

## Persistencia propuesta
PostgreSQL: cuentas, catálogo, salas, matches, snapshots, resultados, estadísticas. Memoria de proceso: sesiones activas y conexiones. Redis opcional en etapa de escalamiento, no dependencia inicial.

### Jugada confirmada
- Rechazar `playerId` no autorizado: derivarlo de la sesión autenticada.
- Dedupe por `(sessionId, playerId, requestId)` y conservar resultado de acciones confirmadas para reintentos.
- Serializar acciones por sesión y aplicar optimistic locking por `state_version` en PostgreSQL.
- Calcular la transición con motor puro.
- Persistir snapshot (y resultado final si aplica) en transacción.
- Confirmar al cliente solo tras commit; publicar vistas personalizadas.
- Si el broadcast falla tras commit, el cliente recupera el estado mediante reconexión y versión.

### Recuperación
Tras reinicio, reconstruir sesión desde snapshot persistido y versión de motor compatible. Autenticar reconexión y enviar vista del jugador. Definir ventana de reconexión, turnos, temporizadores, abandono y qué hacer si la versión del motor ya no está disponible.

### Precauciones
No persistir indiscriminadamente mensajes WebSocket. Separar eventos de transporte, dominio y auditoría. Decidir si guardar todas las jugadas para replay; no se ha aprobado event sourcing. En un despliegue de una sola instancia, serialización en memoria más transacción es suficiente para el primer corte; para varias instancias se requiere coordinación distribuida.
