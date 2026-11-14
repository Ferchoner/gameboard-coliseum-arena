# Contrato realtime preliminar

Endpoint conceptual: `wss://api.example.com/realtime`. Protocolo `version: 1`.

## Sobre común
```json
{"type":"PLAYER_ACTION","version":1,"requestId":"req_002","sessionId":"session_456","payload":{"action":{"type":"DROP_TOKEN","payload":{"column":4}}}}
```

**Seguridad:** `playerId` NO debe aceptarse como fuente de identidad; el servidor lo deriva de autenticación. `timestamp` del cliente, si se incluye, es informativo. Las acciones usan `requestId` para deduplicación y correlación.

## Eventos
Conexión: CONNECT/AUTHENTICATE/CONNECTED/DISCONNECTED/RECONNECTED (semántica exacta a formalizar; algunos son eventos de transporte, no mensajes de aplicación). Sala: JOIN_ROOM, LEAVE_ROOM, ROOM_STATE, PLAYER_JOINED, PLAYER_LEFT, PLAYER_READY, PLAYER_UNREADY. Match: MATCH_STARTING, MATCH_STARTED, MATCH_PAUSED, MATCH_RESUMED, MATCH_FINISHED. Juego: PLAYER_ACTION, GAME_STATE_UPDATED, TURN_CHANGED, GAME_FINISHED. Errores: ERROR.

## Ejemplo error
```json
{"type":"ERROR","version":1,"requestId":"req_002","payload":{"code":"NOT_YOUR_TURN","message":"It is not your turn."}}
```

## Errores iniciales
UNAUTHORIZED, FORBIDDEN, ROOM_NOT_FOUND, ROOM_FULL, ROOM_ALREADY_STARTED, PLAYER_NOT_IN_ROOM, MATCH_NOT_FOUND, PLAYER_NOT_IN_MATCH, SESSION_NOT_FOUND, NOT_YOUR_TURN, INVALID_ACTION, INVALID_GAME_STATE, GAME_ALREADY_FINISHED, RATE_LIMITED, INTERNAL_ERROR.

## Semántica a fijar
- ACK de acción aceptada vs actualización confirmada.
- Orden y `stateVersion` en mensajes; replay/resync al reconectar.
- Dedupe y expiración de `requestId`.
- Autenticación inicial y renovación durante conexión.
- Heartbeats, presencia y límites de tamaño/frecuencia.
- Suscripciones y filtrado de vistas para evitar revelar cartas/estado oculto.
- El evento `PLAYER_READY` es comando entrante; la notificación saliente debe distinguirse mediante dirección o nombre de evento.
