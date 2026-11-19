# ADR-019: Batalla naval y jugadas simultáneas

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-19 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Parte de** | La [propuesta de los próximos juegos](../../planning/propuesta-de-juegos.md), con las decisiones F1 a F9 (sección 0) |
| **Depende de** | Contrato del motor (M7 a M11), protocolo (sección 4, `SUBMIT_ACTION`), ADR-010 (regla 8.11), modelo de datos (R10), ADR-018 (Z1 a Z8), `docs/guia-nuevo-juego.md` |
| **Revisado sobre** | `main` en `b9c1e54` |

---

## 0. Los próximos juegos (F1 a F9)

El 2026-11-19 quien decide pidió crear dos o tres juegos más antes de desplegar en servidores. La [propuesta](../../planning/propuesta-de-juegos.md) comparó candidatos y recomendó Damas, Batalla naval y Dominó. Ese día quien decide **eligió Batalla naval y Dominó** (F1) y **aceptó F3 a F9** tal como se recomendaban. F2, las reglas de damas, se retiró con Damas. En la propuesta estas decisiones se llamaron J1 a J9; aquí cambian de letra porque J1 a J5 ya nombran los ajustes del catálogo de errores.

| ID | Decisión |
|---|---|
| F1 | Los próximos juegos son **Batalla naval** y después **Dominó** |
| F2 | *Retirada*: las reglas de damas |
| F3 | La versión 1 de cada juego **no tiene opciones** (`settings` vacío). Las variantes llegan como versiones nuevas del motor. Así no hace falta todavía un formulario de opciones al crear la sala |
| F4 | Batalla naval: **un disparo por turno**, acierte o no |
| F5 | Batalla naval: las dos flotas se colocan **a la vez**, con T-23 (secciones 4 y 5 de este ADR) |
| F6 | Dominó: la partida se juega **hasta 100 puntos** |
| F7 | Dominó: de **2 a 4 jugadores**; con 4, en parejas |
| F8 | Con más de dos jugadores, **quien pierde por abandono se queda en la sala como retirado** hasta que la partida termina, y deja de contar para su límite de partidas (7.30). Cierra W6 de ADR-015 cuando se construya, con T-24 y el Dominó |
| F9 | **Regla de derechos** para todos los juegos: mecánicas tradicionales o de dominio público; nombre genérico en español e identificador genérico en inglés, nunca una marca; arte propio en CSS o SVG; reglas escritas por nosotros en el `README.md` del motor, con una línea sobre su origen. No es asesoría legal. Cierra el resto del pendiente 12 (ADR-008, sección 4) |

El Dominó tendrá su propio ADR, con T-24, antes de construirlo.

## 1. Contexto

Batalla naval es el primer juego nuevo. Pone a prueba dos cosas que el diseño promete y que nadie ha usado todavía:

- **Información oculta.** Cada jugador ve su flota y no la del rival hasta que la hunde.
- **Una fase de jugadas simultáneas.** Los dos colocan la flota a la vez, con dos asientos activos.

La información oculta no necesita cambios en la plataforma: el motor da una vista por asiento (`getView`) y cada conexión recibe solo la suya. La fase simultánea, sí. Hoy pasan dos cosas cuando dos asientos están activos a la vez (análisis del 2026-11-19, GO-6 y T-23):

1. **La segunda jugada se rechaza como obsoleta.** A y B colocan su flota sobre la versión 4. La de A pasa y sube el estado a la versión 5. La de B llega con la versión 4 y recibe `STALE_STATE_VERSION`, aunque nada de lo que B ve haya cambiado. B tiene que volver a enviarla (`game-sessions.service.ts:291`).
2. **El reloj de un asiento rechaza la jugada de otro.** Si se agota el reloj de A, la jugada de B se rechaza con `CLOCK_EXPIRED` aunque a B le quede tiempo, porque el servidor mira la fecha límite común, que es la del primer reloj que se agota (`game-sessions.service.ts:299` y `:1062`).

Para ser justos con el tamaño del problema: el primer caso solo ocurre cuando las dos jugadas se cruzan, porque en cuanto B recibe la jugada de A su aplicación ya envía la versión nueva. Pasa en la práctica cuando los dos pulsan "Listo" casi a la vez, que en la colocación es habitual, o cuando B estaba reconectando. El segundo caso, en un juego de dos, no cambia el resultado (A pierde por tiempo y B gana), pero B recibe un mensaje falso: "se te acabó el tiempo".

Lo demás que un juego simultáneo necesita ya está: la lista de asientos activos (M10, R10), los relojes que corren a la vez para todos los activos (`match-clock.ts`), y el frontend, que en todos los sitios mira si el asiento está **en** la lista y nunca toma solo el primero (comprobado en `pages/partidas/[matchId].vue`, `utils/matches.ts` y `match-views.ts`).

## 2. Resumen

| ID | Asunto | Recomendación |
|---|---|---|
| **El juego** | | |
| X1 | Nombre e identificador | "Batalla naval", `naval-battle`, versión `1.0.0`, alta inactiva |
| X2 | Tablero | 10 × 10 por jugador. Filas A a J y columnas 1 a 10 en pantalla; 0 a 9 en el motor |
| X3 | Flota | Cinco barcos: 5, 4, 3, 3 y 2 casillas, en horizontal o vertical |
| X4 | Barcos que se tocan | No pueden tocarse, ni en diagonal |
| X5 | Fases | Colocación simultánea (F5) y después disparos por turnos. La flota se envía entera una vez y no se cambia |
| X6 | Quién dispara primero | El asiento 0. En la revancha los asientos rotan (K11), así que se alterna |
| X7 | Disparos | Uno por turno, acierte o no (F4) |
| X8 | Barco hundido | Se anuncia con sus casillas, que pasan a ser públicas |
| X9 | Final | Gana quien hunde toda la flota rival. No hay empate. Retirada: regla 7.18 |
| X10 | Acciones, eventos y vista | Sección 3.4 |
| X11 | Motivos de rechazo | Sección 3.5 |
| X12 | Controles de tiempo | Tiempo real: 10, 15 y 20 minutos. Por turnos: 12, 24 y 36 horas |
| X13 | "Colocar al azar" | Un botón del tablero que propone una colocación; el servidor la valida como cualquier otra |
| X14 | Tablero en el móvil | Las dos cuadrículas, una encima de otra; la del rival, grande en la fase de disparos |
| **Jugadas simultáneas (T-23)** | | |
| X15 | Versión de la jugada con varios asientos activos | Se acepta si el asiento sigue activo desde la versión con la que jugó. Se guarda, por asiento, la versión desde la que está activo |
| X16 | El asiento que juega y sigue activo | Su versión vuelve a contar desde su jugada |
| X17 | Reloj agotado de otro asiento | Se aplica su vencimiento y, si la partida sigue y quien envía sigue activo, se evalúa su jugada en la misma transacción |
| X18 | Entrega | Dos pull requests: primero T-23, después el juego |

Ninguna decisión añade dependencias. X15 a X17 cambian el protocolo y el modelo de datos (sección 5), sin cambiar la interfaz del motor ni la API.

---

## 3. El juego

### 3.1 Reglas (X2 a X9)

- Cada jugador tiene una cuadrícula de 10 × 10 con cinco barcos: uno de 5 casillas, uno de 4, dos de 3 y uno de 2. En pantalla se llaman portaaviones, acorazado, crucero, submarino y destructor; en el motor son `S5`, `S4`, `S3A`, `S3B` y `S2`.
- Los barcos van en horizontal o en vertical, dentro de la cuadrícula, sin solaparse y **sin tocarse, ni en diagonal** (X4). Es la regla más común de "hundir la flota" en español y evita discusiones sobre barcos pegados. *Alternativa:* permitir que se toquen. Es más sencilla de programar, pero un tocado junto a otro barco confunde más.
- **Colocación.** Al empezar, los dos asientos están activos. Cada uno envía su flota entera de una vez, y ya no la cambia. Cuando ha colocado uno, solo queda activo el otro. Cuando han colocado los dos, empieza el turno del asiento 0.
- **Disparos.** El asiento activo dispara a una casilla del rival a la que no haya disparado antes. El resultado es agua, tocado o hundido. Haya acertado o no, el turno pasa al otro (X7, F4).
- **Hundido.** Al hundir un barco se anuncian sus casillas, que desde ese momento ven los dos (X8).
- **Final.** Gana quien hunde los cinco barcos del rival. Como los disparos se alternan, no puede haber empate. Si uno se retira (tiempo, rendición o abandono), pierde y gana el otro (7.18, M11).

### 3.2 Controles de tiempo (X12)

La propuesta inicial decía 5, 10 y 15 minutos. Se corrigió: una partida típica son de 40 a 70 disparos por jugador, más la colocación, y 5 minutos dejarían unos 4 segundos por disparo. Propongo **10, 15 y 20 minutos** en tiempo real, dentro del máximo de 30 (7.2). Por turnos, **12, 24 y 36 horas**, como Cuatro en raya.

En la colocación corren los dos relojes a la vez, porque los dos asientos están activos. Es lo que ya hace `clocksAt`: descuenta el tiempo a todos los activos.

### 3.3 Derechos (F9)

"Battleship" es una marca de un fabricante de juguetes. El juego de lápiz y papel es anterior y su mecánica es genérica. Usamos solo "Batalla naval", con cuadrícula, barcos e iconos dibujados por nosotros en SVG o CSS, y reglas escritas por nosotros en el `README.md` del motor, con una línea sobre su origen tradicional. No es asesoría legal.

### 3.4 Acciones, eventos y vista (X10)

**Acciones:**

```json
{ "type": "PLACE_FLEET",
  "ships": [
    { "ship": "S5",  "row": 0, "col": 0, "orientation": "H" },
    { "ship": "S4",  "row": 2, "col": 0, "orientation": "H" },
    { "ship": "S3A", "row": 4, "col": 0, "orientation": "V" },
    { "ship": "S3B", "row": 4, "col": 2, "orientation": "V" },
    { "ship": "S2",  "row": 9, "col": 8, "orientation": "H" }
  ] }
```

```json
{ "type": "FIRE", "row": 3, "col": 7 }
```

**Eventos de juego**, que son públicos (M8) y por eso no llevan nada que el rival no deba ver:

| Evento | Contenido |
|---|---|
| `FLEET_PLACED` | `{ seat }`. Sin posiciones |
| `SHOT_FIRED` | `{ seat, row, col, result }`, con `result` igual a `MISS`, `HIT` o `SUNK` |
| `SHIP_SUNK` | `{ seat, ship, cells }`: el asiento dueño del barco hundido y sus casillas |

**Vista de un asiento** (`getView(state, seat)`):

- `phase`: `PLACEMENT` o `FIRING`.
- `ownFleet`: sus barcos, con las casillas tocadas, o `null` si aún no ha colocado.
- `ownGrid`: los disparos que ha recibido.
- `rivalGrid`: sus disparos al rival, con el resultado, y los barcos rivales ya hundidos.
- `rivalPlaced`: si el rival ya colocó.
- `fleet`: la lista de barcos y su tamaño, para que el tablero no la repita.

**Nunca** lleva la posición de un barco rival sin hundir. La vista sin asiento (`getView(state, null)`) lleva solo los disparos y los barcos hundidos de los dos lados.

### 3.5 Motivos de rechazo (X11)

Con el código `INVALID_ACTION` (M9; ADR-014, K6):

| Motivo | Cuándo |
|---|---|
| `MALFORMED_ACTION` | La acción no tiene la forma de 3.4 |
| `WRONG_PHASE` | Disparar durante la colocación, o colocar durante los disparos |
| `INVALID_FLEET` | Falta un barco, sobra uno o uno se repite |
| `SHIP_OUT_OF_BOUNDS` | Un barco se sale de la cuadrícula |
| `SHIPS_OVERLAP` | Dos barcos comparten casilla |
| `SHIPS_TOUCHING` | Dos barcos se tocan, también en diagonal (X4) |
| `CELL_OUT_OF_RANGE` | Disparo fuera de la cuadrícula |
| `CELL_ALREADY_FIRED` | Ya disparó a esa casilla |

Colocar dos veces no necesita motivo propio: tras colocar, el asiento deja de estar activo y el motor responde `NOT_YOUR_TURN`, como a cualquier asiento que juega fuera de turno.

### 3.6 Frontend (X13, X14)

- **Colocar.** Elegir barco, girarlo y ponerlo en la cuadrícula; o pulsar "Colocar al azar", que propone una colocación válida. Ese botón usa el azar del navegador, que está permitido porque no decide nada: el servidor valida la flota como cualquier otra (K7). Después, "Listo", que envía `PLACE_FLEET`. Mientras el rival no ha colocado, se ve "Esperando a que el rival coloque su flota".
- **Disparar.** La cuadrícula del rival, grande, para tocar una casilla. La propia, más pequeña, con los disparos recibidos.
- **Móvil.** Las dos cuadrículas una encima de otra. En la colocación, la propia ocupa el ancho; en los disparos, la del rival.
- Colores de asiento con `seat-N` (Z7), textos en `games/naval-battle/texts.ts` y el tablero en `GAME_UIS` con la clave `naval-battle@1`.

### 3.7 Pruebas

- **Motor:** reglas de colocación (cada motivo de 3.5), disparos, hundido, final y retirada. La vista de un asiento nunca contiene barcos rivales sin hundir; la vista sin asiento, ninguna flota.
- **Comprobación común (Z3):** en `FIXTURES`, `candidateActions` devuelve en la colocación una flota válida fija y una que se toca (para probar el rechazo), y en los disparos todas las casillas, también las ya disparadas.
- **En navegador:** dos jugadores colocan a la vez, los dos son aceptados y empieza la fase de disparos. Además, una comprobación de que los mensajes que recibe un jugador no contienen las casillas de los barcos del otro sin hundir.

## 4. Jugadas simultáneas (T-23)

### X15. Versión de la jugada con varios asientos activos

La regla 8.11 existe para que una jugada reenviada tarde no se aplique sobre un tablero distinto del que vio el jugador. Con varios asientos activos, la jugada de otro cambia la versión, pero no siempre lo que tenía delante quien todavía no ha jugado.

| Opción | A favor | En contra |
|---|---|---|
| **Guardar, por asiento activo, la versión desde la que lo está.** Aceptar la jugada si el asiento sigue activo y la versión con la que jugó es esa o posterior | Arregla el caso sin tocar el motor. El motor sigue validando la jugada sobre el estado actual, así que nunca se aplica nada ilegal | Una columna nueva en `game_sessions` y una enmienda del protocolo |
| Que el cliente reenvíe solo al recibir `STALE_STATE_VERSION` | Sin cambios en el servidor | Anula 8.11: el cliente reenviaría jugadas sin que el jugador vea el estado nuevo |
| Dejarlo como está y avisar | Sin coste | B pierde su colocación cuando las dos se cruzan, justo al empezar la partida |
| Que cada juego declare en sus metadatos si quiere la regla estricta | Cubre juegos en los que la jugada de otro sí cambia lo que uno ve | Cambia la interfaz del motor. Ningún juego lo necesita hoy |

**Recomendación:** la primera. La regla de aceptación de la versión queda así:

- Si coincide con la versión actual, se acepta, como hoy.
- Si es anterior, se acepta solo si el asiento está activo y lo está **desde esa versión o una anterior**, sin interrupción. Si no, `STALE_STATE_VERSION`, como hoy.
- Si es posterior a la actual, `STALE_STATE_VERSION`, como hoy.

En los juegos por turnos, como Cuatro en raya y Dominó, el único asiento activo pasa a estarlo en la versión actual, así que la regla da exactamente lo mismo que hoy. La cuarta opción queda anotada por si llega un juego que la necesite.

**Datos:** `game_sessions.active_since` (`jsonb`, obligatoria), con la versión desde la que está activo cada asiento de `active_seats`: `{"0": 4, "1": 4}`. Sigue la forma de `clocks`. La migración la rellena en las sesiones en curso con su `state_version` para su único asiento activo, que es lo que vale hoy.

### X16. El asiento que juega y sigue activo

Si un asiento juega y el motor lo deja activo (no pasa en Batalla naval, pero sí en juegos con turno extra), su versión vuelve a contar desde la jugada nueva. Si no, dos clics seguidos con la misma versión aplicarían dos jugadas, y es justo lo que 8.11 evita. Tras una retirada, los asientos que siguen activos conservan su versión; los que pasan a estarlo empiezan en la versión nueva.

### X17. Reloj agotado de otro asiento

| Opción | A favor | En contra |
|---|---|---|
| **Aplicar el vencimiento de los asientos agotados y, si la partida sigue y quien envía sigue activo, evaluar su jugada en la misma transacción** | Nadie pierde una jugada por el reloj de otro. El orden es justo: el vencimiento ocurrió antes de que llegara la jugada | Un camino más en `submitAction` |
| Rechazar con `CLOCK_EXPIRED`, como hoy | Sin cambios | Es falso: a quien envía no se le agotó el tiempo |

**Recomendación:** la primera. La comprobación 6 pasa a mirar solo el reloj **de quien envía**:

- Si su reloj está agotado: `CLOCK_EXPIRED` y se aplica el vencimiento, como hoy.
- Si se agotó el de otro: se aplica su vencimiento. Si con eso la partida terminó, `MATCH_NOT_IN_PROGRESS` (quien envía recibe además el estado final con `MATCH_UPDATED`, y en un juego de dos es quien gana). Si sigue y quien envía sigue activo, se continúa con la comprobación 7 sobre el estado nuevo.

La versión de la jugada se comprueba antes, contra la versión anterior al vencimiento, porque es lo que el jugador tenía delante.

### X18. Entrega

Dos pull requests, en este orden:

1. **T-23**, con la migración de `active_since`, X15 a X17, sus pruebas contra PostgreSQL (dos colocaciones a la vez aceptadas; el mismo asiento con dos clics sobre la misma versión, rechazado; el reloj agotado de otro asiento) y la enmienda de los documentos. Se prueba con un motor falso de dos asientos simultáneos, como ya hace `apps/backend/test/matches.test.ts`.
2. **Batalla naval**: motor, tablero, migración de alta inactiva y pruebas, siguiendo la guía.

Así, si algo falla, se sabe si es de la plataforma o del juego.

## 5. Cambios de contrato y de documentos (requieren autorización aparte)

| Documento | Cambio |
|---|---|
| `contracts/02-realtime.md`, sección 4, `SUBMIT_ACTION` | Comprobación 5: "`stateVersion` es la versión actual o, si el asiento está activo, una versión desde la que lo está sin interrupción". Comprobación 6: "El reloj **de quien envía** no está agotado; si se agotó el de otro asiento activo, se aplica su vencimiento y se sigue si la partida continúa". Sección 12: se cierra el asunto de las jugadas simultáneas |
| `contracts/04-error-catalog.md` | `STALE_STATE_VERSION`: "sobre un estado que ya cambió para ese asiento". `CLOCK_EXPIRED` no cambia, porque ahora sí es siempre el reloj de quien envía |
| `docs/adr/0010-persistencia-de-partida.md`, regla 8.11 | Nota de precisión con X15 y X16 |
| `docs/03-dominio-datos.md` | La columna `game_sessions.active_since` |
| `contracts/03-game-engine.md`, sección 7 | Se cierra el asunto de las jugadas simultáneas, con referencia a este ADR |
| `planning/decisiones-y-pendientes.md` | Fila de este ADR; fuera de pendientes el de las jugadas simultáneas |
| `planning/backlog-mvp.md` | Tareas de T-23 y de Batalla naval |

La interfaz del motor, la API REST y los mensajes del protocolo no cambian de forma: solo cambian las reglas con las que se acepta una jugada.

## 6. Aceptación

El 2026-11-19 quien decide aceptó X1 a X18 tal como se recomiendan, y autorizó los cambios de contrato de la sección 5 y el código de las dos pull requests de X18.

## 7. Lo que resultó al construir

### T-23

- `active_since` sigue la forma de `clocks`: un objeto con el asiento como clave. Las funciones que lo calculan están en `game-sessions/active-since.ts` y son puras.
- Si se agotó el reloj de otro asiento y la partida sigue, la sesión se vuelve a leer dentro de la misma transacción, con la fila ya bloqueada, y la jugada se evalúa sobre lo que dejó el vencimiento.
- Para que ese vencimiento se guarde aunque el motor rechace después la jugada, los rechazos del motor vuelven como rechazo y no como excepción. En el caso normal no cambia nada, porque antes del motor no se ha guardado nada.
- El paquete del motor tiene un segundo motor de pruebas, `createSimultaneousFakeEngine`, en el que todos los asientos están activos a la vez y cada uno juega dos veces. Pasa la comprobación común (Z3) y lo usan las pruebas del servidor de jugadas simultáneas.

### Batalla naval

- El motor está en `packages/game-engine/src/games/naval-battle/` y se registra como `naval-battle@1.0.0`. Su estado guarda las dos flotas y los disparos de cada asiento; quién está activo, los impactos y los barcos hundidos se calculan de nuevo a partir de ahí en una sola pasada, para que la comprobación común (Z3) termine a tiempo.
- Las flotas solo salen del servidor a través de `getView`: cada asiento recibe la suya y, de la rival, solo los barcos hundidos (X10). La prueba en navegador lo comprueba en la respuesta REST y en cada mensaje `MATCH_UPDATED` que recibe cada jugador.
- La migración `alta_batalla_naval` da de alta el juego y su versión inactivos, con la versión **sin ser la vigente**. La base de datos solo admite como vigente una versión activa (`game_versions_current_is_active`), y la plantilla de `docs/guia-nuevo-juego.md` decía lo contrario, así que la migración fallaba. Se corrigieron la plantilla y el orden de activación: primero la versión, después hacerla vigente y por último el juego.
- En el navegador, "Colocar al azar" usa el azar del navegador solo para proponer un borrador; el servidor valida la flota como cualquier otra (X13). En un móvil de 390 px de ancho, las dos cuadrículas caben sin desplazamiento lateral. Esa prueba descubrió en GitHub que la barra superior de todas las páginas se salía del ancho con otras fuentes, porque no se partía en dos líneas; ahora se parte.
