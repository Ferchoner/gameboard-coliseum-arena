# Protocolo de tiempo real, versión 1

| Campo | Valor |
|---|---|
| **Estado** | Versión 1, aceptada el 2026-11-15 por Fernando Hernandez Argueta |
| **Tipos** | [`02-realtime.ts`](02-realtime.ts). Contiene solo tipos, sin lógica |
| **Sustituye a** | El contrato de tiempo real preliminar |
| **Aplica** | ADR-003 (WebSocket nativo), ADR-004 (sesión con cookie), ADR-008 (alcance del MVP), ADR-009 (reglas de dominio), ADR-010 (reglas 8.9, 8.11 y 8.12) y ADR-011 (convenciones 9.10 y 9.16 a 9.18) |
| **Resuelve** | Hallazgos C-03 (parte de tiempo real), C-04, C-11 y C-16; pendiente P4 (semántica del protocolo); efecto R-4 (aviso de turno) |

**Cómo leer este documento.** Todo lo que deriva de una decisión aceptada cita su ADR o su regla. Las decisiones de diseño propias de este entregable están en la [sección 11](#11-decisiones-de-diseño-propias-de-este-entregable).

Los códigos de error de este documento son provisionales en su redacción: el catálogo único de errores, que es un entregable posterior, los reúne con los de la API y los del motor.

---

## 1. Para qué sirve cada canal

| Canal | Qué lleva |
|---|---|
| **API REST** | Todo lo que crea o cambia cuentas y salas: registrarse, iniciar sesión, crear una sala, entrar, salir y marcarse listo. También las consultas: catálogo, lista de salas, historial y "mis partidas" |
| **WebSocket** | Recibir en vivo lo que cambia en una sala o en una partida, y las dos órdenes de una partida en curso: jugar y rendirse |

Una misma operación no existe en los dos canales. Entrar a una sala es una operación de la API que cambia la pertenencia; suscribirse a una sala por WebSocket solo pide recibir sus cambios. Esto resuelve el hallazgo C-04.

---

## 2. Conexión

### Apertura

| Asunto | Regla | Origen |
|---|---|---|
| Dirección | `wss://<host de la API>/realtime?protocolVersion=1` | |
| Identidad | La cookie de sesión, que el navegador envía sola en el handshake. No existe ningún mensaje de autenticación | ADR-003, condición 5.4; ADR-004 |
| Origen | El servidor rechaza el handshake si la cabecera `Origin` no está en su lista de orígenes permitidos | ADR-004, condición 5.5 |
| Sin sesión válida | El servidor rechaza el handshake. El navegador no informa del motivo, así que el cliente comprueba su sesión con la API antes de reintentar | ADR-003, condición 5.4 |
| Versión no admitida | El servidor acepta la conexión y la cierra de inmediato con el código 4002 | |
| Primer mensaje | El servidor envía `CONNECTION_ESTABLISHED` | |

Un jugador puede tener varias conexiones abiertas a la vez, por ejemplo dos pestañas (7.25). La conexión es de toda la aplicación, no de una pantalla: el cliente la abre al iniciar sesión y la mantiene mientras la aplicación esté abierta.

### Latidos

El servidor envía `SERVER_HEARTBEAT` a intervalos regulares. Si el cliente pasa más del doble de ese intervalo sin recibir ningún mensaje, da la conexión por perdida y reconecta.

El servidor detecta las conexiones muertas con los pings propios de WebSocket, a los que el navegador responde solo. El cliente no envía latidos.

### Reconexión

1. El cliente reintenta con espera progresiva: 1 segundo, 2, 4, y así hasta un máximo de 30 segundos, con una variación aleatoria en cada espera.
2. El servidor no recuerda las suscripciones de una conexión anterior. Al reconectar, el cliente vuelve a suscribirse a lo que estaba mostrando y recibe su estado completo actual (7.28).
3. No hay reenvío de mensajes perdidos. El cliente vuelve a pedir "mis partidas" a la API, porque pudo perderse avisos personales.
4. Si tenía una jugada enviada sin respuesta, la reenvía con el mismo `requestId`. El servidor no la aplica dos veces (8.12).

### Cierre

| Código | Significado | Qué hace el cliente |
|---|---|---|
| 1008 | El cliente incumplió el protocolo de forma repetida | No reconecta solo |
| 1009 | Envió un mensaje demasiado grande | No reconecta solo |
| 1012 | El servidor se reinicia | Reconecta con espera progresiva |
| 4001 | La sesión de autenticación terminó: caducó, se cerró o la cuenta fue suspendida | No reconecta. Lleva a la pantalla de inicio de sesión |
| 4002 | Versión del protocolo no admitida | No reconecta. Pide recargar la aplicación |
| 4003 | Demasiadas conexiones abiertas para el mismo jugador | No reconecta solo |

Cualquier otro cierre se trata como un corte de red: el cliente reconecta con espera progresiva.

Al revocar o caducar una sesión de autenticación, el servidor cierra sus conexiones con el código 4001. Además revalida la sesión de cada conexión abierta de forma periódica (ADR-004, condición 5.8).

---

## 3. El sobre

Todos los mensajes son objetos JSON en texto. Los nombres de campo van en `camelCase` (9.2). Las fechas son textos ISO 8601 en UTC y las duraciones, enteros en milisegundos (9.3).

### Orden: del cliente al servidor

| Campo | Obligatorio | Descripción |
|---|---|---|
| `type` | Sí | Nombre de la orden, en imperativo (9.18) |
| `requestId` | Sí | UUID generado por el cliente (9.4). Identifica la orden y su respuesta |
| `roomId` | En las órdenes de sala | (9.17) |
| `matchId` | En las órdenes de partida | (9.17) |
| `payload` | Solo en `SUBMIT_ACTION` | |

### Notificación: del servidor al cliente

| Campo | Presente | Descripción |
|---|---|---|
| `type` | Siempre | Nombre de la notificación, como hecho ocurrido (9.18) |
| `serverTime` | Siempre | Hora del servidor al enviar el mensaje |
| `requestId` | Solo en la copia de quien envió la orden que la provocó | |
| `roomId` | En las notificaciones de sala | (9.17) |
| `matchId` | En las notificaciones de partida | (9.17) |
| `payload` | Según el tipo | |

Ningún nombre de mensaje se usa en las dos direcciones (9.18). El sobre no lleva la versión del protocolo, que se fija al conectar, ni ningún identificador de jugador: el servidor conoce al jugador por su sesión (acuerdo B11). Tampoco lleva el identificador de la sesión de juego, que es interno (9.16).

### Toda orden recibe exactamente una respuesta

Es una notificación con el mismo `requestId`: la que confirma la orden, o `COMMAND_REJECTED`. La respuesta va solo a la conexión que envió la orden. Si la orden cambia algo que otros ven, los demás reciben la misma notificación sin `requestId`.

---

## 4. Órdenes

| Orden | Qué pide | Quién puede | Respuesta si se acepta |
|---|---|---|---|
| `SUBSCRIBE_ROOM` | Recibir los cambios de una sala | Un miembro de la sala | `ROOM_SUBSCRIBED`, con el estado completo de la sala |
| `UNSUBSCRIBE_ROOM` | Dejar de recibirlos | Quien esté suscrito | `ROOM_UNSUBSCRIBED` |
| `SUBSCRIBE_MATCH` | Recibir los cambios de una partida | Un participante de la partida | `MATCH_SUBSCRIBED`, con el estado completo desde su asiento |
| `UNSUBSCRIBE_MATCH` | Dejar de recibirlos | Quien esté suscrito | `MATCH_UNSUBSCRIBED` |
| `SUBMIT_ACTION` | Hacer una jugada | Un participante de una partida en curso | `MATCH_UPDATED`, con el estado nuevo |
| `RESIGN_MATCH` | Rendirse (7.19) | Un participante de una partida en curso, sea o no su turno | `MATCH_UPDATED`, con la partida terminada |

Para jugar o rendirse no hace falta estar suscrito a la partida: basta con ser participante.

### `SUBMIT_ACTION`

```json
{
  "type": "SUBMIT_ACTION",
  "requestId": "0b9f3c1e-6a52-4f0e-9d0a-5c2f7e1a8b34",
  "matchId": "7d1c8a90-2f4b-4c6e-8a11-3e5d9f0b6c72",
  "payload": {
    "stateVersion": 7,
    "action": { "type": "DROP_TOKEN", "column": 3 }
  }
}
```

`stateVersion` es la versión del estado que el jugador tenía delante (8.11). La forma de `action` la define cada juego.

El servidor comprueba, en este orden:

| # | Comprobación | Si falla |
|---|---|---|
| 1 | El mensaje está bien formado | `INVALID_MESSAGE` |
| 2 | La partida existe y quien envía es participante | `MATCH_NOT_FOUND` o `PLAYER_NOT_IN_MATCH` |
| 3 | Ese jugador no ha enviado ya una jugada con ese `requestId` en esta partida | No es un fallo. Responde con `MATCH_UPDATED` y el estado actual, sin eventos de juego, y no aplica nada (8.12) |
| 4 | La partida está en curso | `MATCH_NOT_IN_PROGRESS` |
| 5 | `stateVersion` es la versión actual | `STALE_STATE_VERSION`, con la versión actual |
| 6 | El reloj del jugador no está agotado | `CLOCK_EXPIRED`. Además se aplica el vencimiento (7.5) |
| 7 | El motor acepta la acción | `NOT_YOUR_TURN` o `INVALID_ACTION`, con el motivo propio del juego si lo hay |

Si todo se cumple, el servidor guarda la jugada y solo después envía `MATCH_UPDATED` (8.9).

---

## 5. Notificaciones

| Notificación | Qué ha ocurrido | Quién la recibe |
|---|---|---|
| `CONNECTION_ESTABLISHED` | La conexión está lista | La conexión |
| `SERVER_HEARTBEAT` | El servidor sigue ahí | La conexión |
| `COMMAND_REJECTED` | Una orden no se aceptó | Solo quien la envió |
| `ROOM_SUBSCRIBED` | La suscripción a una sala está activa | Solo quien la pidió |
| `ROOM_UNSUBSCRIBED` | La suscripción a una sala terminó | Solo quien la pidió |
| `ROOM_UPDATED` | Algo cambió en la sala: alguien entró, salió, se marcó listo, se conectó o se desconectó, o empezó o terminó una partida | Los suscritos a la sala |
| `ROOM_CLOSED` | La sala se cerró. La suscripción termina con este mensaje | Los suscritos a la sala |
| `MATCH_SUBSCRIBED` | La suscripción a una partida está activa | Solo quien la pidió |
| `MATCH_UNSUBSCRIBED` | La suscripción a una partida terminó | Solo quien la pidió |
| `MATCH_UPDATED` | Algo cambió en la partida: una jugada, su final, su anulación, o un jugador se conectó o se desconectó | Los suscritos a la partida. Cada uno recibe la vista de su asiento |
| `PLAYER_MATCH_UPDATED` | Cambió una partida en la que participas: empezó, cambió a quién le toca o terminó | Todas las conexiones de cada participante, sin necesidad de suscripción |

`ROOM_UPDATED` y `MATCH_UPDATED` llevan siempre el estado completo, nunca solo la diferencia.

### `MATCH_UPDATED`

Es la única notificación con la que cambia una partida. La copia de quien hizo la jugada lleva su `requestId`.

```json
{
  "type": "MATCH_UPDATED",
  "serverTime": "2026-11-15T20:41:07.250Z",
  "requestId": "0b9f3c1e-6a52-4f0e-9d0a-5c2f7e1a8b34",
  "matchId": "7d1c8a90-2f4b-4c6e-8a11-3e5d9f0b6c72",
  "payload": {
    "match": {
      "matchId": "7d1c8a90-2f4b-4c6e-8a11-3e5d9f0b6c72",
      "roomId": "c4e2a7d6-91b3-4f58-a0c7-2b6d8e9f1a05",
      "gameSlug": "four-in-a-row",
      "gameVersion": "1.0.0",
      "mode": "REALTIME",
      "timeControl": { "type": "TOTAL_PER_PLAYER", "totalMs": 600000 },
      "status": "IN_PROGRESS",
      "stateVersion": 8,
      "yourSeat": 0,
      "players": [
        {
          "seat": 0,
          "playerId": "1a6f0c3b-8d27-4e19-b5a4-9c0e2d7f6b81",
          "username": "ana",
          "displayName": "Ana",
          "connected": true,
          "clockRemainingMs": 512000,
          "abandonAt": null
        },
        {
          "seat": 1,
          "playerId": "5e9b2d74-3c10-4a86-9f2e-7b1d4c8a0e63",
          "username": "luis",
          "displayName": "Luis",
          "connected": true,
          "clockRemainingMs": 498250,
          "abandonAt": null
        }
      ],
      "activeSeats": [1],
      "turnDeadlineAt": "2026-11-15T20:49:25.500Z",
      "view": {},
      "result": null,
      "abortReason": null,
      "startedAt": "2026-11-15T20:38:02.000Z",
      "endedAt": null
    },
    "events": [
      { "type": "TOKEN_DROPPED", "seat": 0, "column": 3, "row": 2 }
    ]
  }
}
```

En el ejemplo, `view` aparece vacío. Su contenido es lo que el motor del juego devuelve para ese asiento, y su forma la define cada juego.

Cómo se lee:

| Campo | Significado |
|---|---|
| `stateVersion` | El valor que debe indicar la siguiente jugada. El cliente descarta una notificación cuya versión sea menor que la que ya tiene |
| `activeSeats` | Asientos que pueden jugar ahora. Sus relojes son los que corren |
| `clockRemainingMs` | Tiempo que le queda a cada jugador, medido en el instante `serverTime`. El cliente descuenta desde ahí el de los asientos activos. El tiempo válido es siempre el del servidor (7.4) |
| `abandonAt` | Instante en que un jugador desconectado perderá por abandono. Solo en tiempo real (7.26) |
| `events` | Eventos de juego, para que el cliente pueda mostrar lo ocurrido. Son públicos: todos reciben los mismos |
| `result` | Tiene valor cuando `status` es `FINISHED`. Lleva el motivo y el resultado de cada asiento |

Cuando la partida termina o se anula, el servidor envía un último `MATCH_UPDATED` y la suscripción termina.

### `COMMAND_REJECTED`

```json
{
  "type": "COMMAND_REJECTED",
  "serverTime": "2026-11-15T20:41:09.100Z",
  "requestId": "f2c7d9a1-4b83-4e60-8c15-0a9e3b6d7f42",
  "payload": {
    "code": "INVALID_ACTION",
    "commandType": "SUBMIT_ACTION",
    "reason": "COLUMN_FULL"
  }
}
```

| Código | Cuándo |
|---|---|
| `INVALID_MESSAGE` | El mensaje no es JSON, le falta un campo obligatorio o su tipo no existe |
| `RATE_LIMITED` | Demasiadas órdenes en poco tiempo |
| `INTERNAL_ERROR` | Fallo del servidor. La orden no se aplicó |
| `ROOM_NOT_FOUND` | La sala no existe o está cerrada |
| `PLAYER_NOT_IN_ROOM` | Quien envía no es miembro de la sala |
| `MATCH_NOT_FOUND` | La partida no existe |
| `PLAYER_NOT_IN_MATCH` | Quien envía no es participante de la partida |
| `MATCH_NOT_IN_PROGRESS` | La partida ya terminó o se anuló |
| `STALE_STATE_VERSION` | La jugada se hizo sobre un estado que ya cambió (8.11) |
| `NOT_YOUR_TURN` | Quien envía no puede jugar ahora |
| `CLOCK_EXPIRED` | Su reloj se agotó antes de que llegara la jugada (7.5) |
| `INVALID_ACTION` | La acción está mal formada o las reglas del juego no la permiten |

---

## 6. Vistas

Las tres vistas están definidas campo por campo en [`02-realtime.ts`](02-realtime.ts).

| Vista | Qué contiene | Dónde viaja |
|---|---|---|
| `RoomView` | El estado completo de una sala: juego, modalidad, control de tiempo, capacidad, si admite revancha, estado, anfitrión, miembros con su marca de listo y su presencia, y la partida en curso si la hay | `ROOM_SUBSCRIBED`, `ROOM_UPDATED` |
| `MatchView` | El estado completo de una partida desde un asiento: jugadores con su reloj y su presencia, asientos activos, versión del estado, la vista del juego para ese asiento y el resultado si terminó | `MATCH_SUBSCRIBED`, `MATCH_UPDATED` |
| `MatchSummaryView` | El resumen de una partida: juego, modalidad, estado, si te toca y hasta cuándo, y tus rivales | `PLAYER_MATCH_UPDATED`. También la devolverá la API en "mis partidas" |

El servidor nunca envía el estado completo del juego. Envía a cada conexión lo que el motor devuelve para su asiento, de modo que un juego con información oculta no la revela.

---

## 7. Presencia

| Regla | Origen |
|---|---|
| Un jugador está presente mientras tenga al menos una conexión abierta, muestre lo que muestre | 7.25 |
| La presencia no se guarda. Se muestra en el campo `connected` de las vistas de sala y de partida | 7.24 |
| Cuando un jugador pasa a estar presente o deja de estarlo, los suscritos a sus salas y a sus partidas reciben `ROOM_UPDATED` o `MATCH_UPDATED`. La versión del estado no cambia | |
| En una partida en tiempo real, un jugador sin ninguna conexión durante 2 minutos seguidos pierde por abandono. La vista muestra en `abandonAt` cuándo ocurrirá | 7.26 |
| En una partida por turnos la desconexión no tiene consecuencias | 7.27 |

---

## 8. Recorridos

### Partida en tiempo real

| # | Qué ocurre | Canal | Mensaje |
|---|---|---|---|
| 1 | Ana crea una sala | API | |
| 2 | Ana se suscribe a su sala | WebSocket | `SUBSCRIBE_ROOM`, responde `ROOM_SUBSCRIBED` |
| 3 | Luis entra a la sala | API | Ana recibe `ROOM_UPDATED` |
| 4 | Luis se suscribe a la sala | WebSocket | `SUBSCRIBE_ROOM`, responde `ROOM_SUBSCRIBED` |
| 5 | Los dos se marcan listos | API | Los dos reciben `ROOM_UPDATED` |
| 6 | La partida empieza sola (7.9) | | Los dos reciben `ROOM_UPDATED`, con la sala en `IN_MATCH` y el identificador de la partida, y `PLAYER_MATCH_UPDATED` |
| 7 | Cada uno se suscribe a la partida | WebSocket | `SUBSCRIBE_MATCH`, responde `MATCH_SUBSCRIBED` |
| 8 | Ana juega | WebSocket | `SUBMIT_ACTION`. Los dos reciben `MATCH_UPDATED`; la copia de Ana lleva su `requestId` |
| 9 | La partida termina | | Los dos reciben `MATCH_UPDATED` con el resultado, `PLAYER_MATCH_UPDATED` y `ROOM_UPDATED`, con la sala de vuelta en `WAITING` |

### Partida por turnos

| # | Qué ocurre | Canal | Mensaje |
|---|---|---|---|
| 1 | Ana crea una sala por turnos y cierra la aplicación | API | |
| 2 | Luis entra a la sala. La partida empieza sola (7.10) | API | Luis recibe `PLAYER_MATCH_UPDATED`. Ana no está conectada y no recibe nada |
| 3 | Ana abre la aplicación horas después | API | Pide "mis partidas" y ve que le toca |
| 4 | Ana abre la partida y juega | WebSocket | `SUBSCRIBE_MATCH`, `SUBMIT_ACTION`, responde `MATCH_UPDATED` |
| 5 | Luis tiene la aplicación abierta en otra pantalla | | Recibe `PLAYER_MATCH_UPDATED` con `yourTurn` verdadero. Es el aviso de turno dentro de la aplicación (ADR-008, punto 10) |

---

## 9. Límites

Valores iniciales. Todos son configurables y se ajustarán con datos reales.

| Límite | Valor inicial | Qué ocurre al superarlo |
|---|---|---|
| Tamaño de un mensaje del cliente | 16 KiB | Cierre con el código 1009 |
| Órdenes por conexión | 20 cada 10 segundos | `RATE_LIMITED`. Si se repite, cierre con el código 1008 |
| Conexiones abiertas por jugador | 5 | La conexión nueva se cierra con el código 4003 |
| Suscripciones por conexión | 20 | `RATE_LIMITED` |
| Intervalo de `SERVER_HEARTBEAT` | 25 segundos | |
| Revalidación de la sesión de autenticación | Cada 60 segundos | Cierre con el código 4001 si ya no es válida |

---

## 10. Cambios respecto al contrato preliminar

| Antes | Ahora | Motivo |
|---|---|---|
| `CONNECT`, `AUTHENTICATE`, `CONNECTED`, `DISCONNECTED`, `RECONNECTED` | `CONNECTION_ESTABLISHED`. La identidad va en el handshake y los cortes son hechos del transporte, no mensajes | ADR-003 y ADR-004. Resuelve C-03 y C-16 |
| `JOIN_ROOM`, `LEAVE_ROOM` | `SUBSCRIBE_ROOM`, `UNSUBSCRIBE_ROOM`. Entrar y salir son operaciones de la API | Resuelve C-04 |
| `PLAYER_READY`, `PLAYER_UNREADY` como orden y como aviso | Marcarse listo es una operación de la API. El aviso es `ROOM_UPDATED` | 9.18. Resuelve C-16 |
| `ROOM_STATE`, `PLAYER_JOINED`, `PLAYER_LEFT` | `ROOM_SUBSCRIBED`, `ROOM_UPDATED`, `ROOM_CLOSED` | Un solo aviso con el estado completo |
| `MATCH_STARTING`, `MATCH_STARTED`, `MATCH_PAUSED`, `MATCH_RESUMED` | Desaparecen. El inicio llega en `ROOM_UPDATED` y en `PLAYER_MATCH_UPDATED`. No hay pausas | ADR-009. Resuelve C-11 |
| `PLAYER_ACTION` | `SUBMIT_ACTION`, con la versión del estado | 8.11 y 9.18 |
| `GAME_STATE_UPDATED`, `TURN_CHANGED`, `GAME_FINISHED`, `MATCH_FINISHED` | `MATCH_UPDATED` | Cuatro avisos decían partes de lo mismo. Resuelve C-16 |
| `ERROR` | `COMMAND_REJECTED` | 9.18 |
| No existía | `RESIGN_MATCH` | 7.19 |
| No existía | `PLAYER_MATCH_UPDATED` | ADR-008, punto 10 |
| El sobre llevaba `version` y `sessionId` | Lleva `roomId` o `matchId`. La versión se fija al conectar | 9.10, 9.16 y 9.17 |
| Identificadores como `req_002` o `session_456` | UUID | 9.4 |

---

## 11. Decisiones de diseño propias de este entregable

Estas decisiones no derivan de un ADR: se tomaron al escribir el protocolo. Fueron **aceptadas el 2026-11-15** por Fernando Hernandez Argueta.

| ID | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| T1 | **La API cambia las salas y el WebSocket lleva la partida.** Crear, entrar, salir y marcarse listo son operaciones de la API. Por WebSocket solo viajan las suscripciones y las dos órdenes de una partida: jugar y rendirse | Marcarse listo por WebSocket, como en el contrato preliminar | Cada operación existe en un solo canal. Las operaciones de sala aprovechan lo que la API ya resuelve: errores, límites y reintentos |
| T2 | **Las jugadas se envían solo por WebSocket**, también en las partidas por turnos | Permitir además enviarlas por la API | Una sola vía que programar y probar. Quien tiene la aplicación abierta tiene la conexión abierta |
| T3 | **Un solo aviso con el estado completo** para todo lo que cambia: `MATCH_UPDATED` en la partida y `ROOM_UPDATED` en la sala. Sin envíos parciales | Un aviso por cada tipo de cambio, o enviar solo la diferencia | El cliente siempre sustituye lo que tenía, y no puede quedar desincronizado. Los estados son pequeños |
| T4 | **Aviso personal `PLAYER_MATCH_UPDATED`**, que llega a todas las conexiones de cada participante sin necesidad de suscripción | Que el cliente consulte la API cada cierto tiempo | Es el aviso de turno dentro de la aplicación que pide el alcance del MVP. No añade ningún servicio |
| T5 | **Toda orden recibe exactamente una respuesta** con su mismo `requestId` | Confirmar solo las jugadas | El cliente sabe siempre si una orden llegó, con una sola regla |
| T6 | **Solo los miembros se suscriben a una sala y solo los participantes a una partida** | Permitir mirar a cualquiera | Los espectadores son posteriores al MVP |
| T7 | **El servidor no recuerda suscripciones ni reenvía mensajes perdidos.** Al reconectar, el cliente se suscribe de nuevo y recibe el estado completo | Guardar los mensajes recientes y reenviarlos | Con el estado completo en cada aviso, reenviar no aporta nada |
| T8 | **La versión del protocolo se fija al conectar**, en la dirección, y no viaja en cada mensaje | Un campo de versión en cada mensaje | Una conexión no cambia de versión a mitad |
| T9 | **Latidos del servidor al cliente**, más los pings propios de WebSocket. El cliente no envía latidos | Una orden de latido del cliente | El navegador no deja ver los pings al código de la página, así que el cliente necesita un mensaje para saber que el servidor sigue ahí. El servidor ya sabe del cliente por los pings |
| T10 | **Estar presente es tener una conexión abierta**, muestre lo que muestre | Exigir estar suscrito a la partida | Con la aplicación abierta en cualquier pantalla, el jugador recibe el aviso de turno y puede volver a la partida. Precisa la regla 7.26 |
| T11 | **Una conexión abierta mantiene viva la sesión de autenticación**, y el servidor la revalida cada minuto | Que la sesión solo se renueve con peticiones a la API | Una persona con la aplicación abierta no debe perder la sesión por inactividad. Precisa la condición 5.6 de ADR-004 |
| T12 | **Los relojes viajan como tiempo restante en el instante del mensaje**, y el cliente descuenta desde ahí | Enviar la hora de inicio del turno y que el cliente calcule | El cliente no necesita tener su reloj en hora. La pequeña diferencia por el retraso de red solo afecta a lo que se muestra; el tiempo válido es el del servidor |
| T13 | **A una jugada repetida se responde con el estado actual**, sin eventos de juego | Guardar y reenviar la respuesta original | La regla 8.12 pide devolver la confirmación sin aplicar de nuevo. El estado actual sirve como confirmación y no obliga a guardar respuestas |
| T14 | **Códigos de cierre**: los estándar 1008, 1009 y 1012, y tres propios, 4001, 4002 y 4003 | Solo códigos propios | Usa los estándar donde ya existen |
| T15 | **Valores iniciales de los límites** de la sección 9 | | Son un punto de partida razonable, no el resultado de una medición |
| T16 | **La lista de salas no se actualiza en vivo.** Se consulta a la API | Una suscripción a la lista de salas | Mantiene pequeña la versión 1. Puede añadirse después sin cambiar nada de lo existente |

---

## 12. Asuntos abiertos

| Asunto | Situación |
|---|---|
| **Jugadas simultáneas.** Si dos asientos juegan sobre la misma versión del estado, la segunda jugada recibe `STALE_STATE_VERSION` y hay que reenviarla | Se precisa cuando llegue el primer juego de ese tipo |
| **Aviso de turno con la aplicación cerrada.** Este protocolo solo avisa a quien tiene una conexión abierta | Las notificaciones push son la primera ampliación tras el MVP (ADR-008, punto 12) |
| **Espectadores** | Posterior al MVP. Bastará con ampliar quién puede suscribirse a una partida; el motor ya da una vista para quien no ocupa asiento |
| **Valores definitivos de los límites** | Se ajustan con datos reales tras el corte vertical |
