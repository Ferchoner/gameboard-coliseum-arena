# Batalla naval (`naval-battle`, versión `1.0.0`)

El segundo juego de la plataforma y el primero con información oculta y con una fase de jugadas simultáneas. Las decisiones están en [ADR-019](../../../../../docs/adr/0019-batalla-naval-y-jugadas-simultaneas.md) (X1 a X14). Las reglas de la plataforma (relojes, retiradas, abandono) están en [ADR-009](../../../../../docs/adr/0009-reglas-de-dominio.md) y no se repiten aquí.

## Origen y nombre

Es el juego tradicional de lápiz y papel de hundir la flota del rival, anterior a cualquier edición comercial. Se llama "Batalla naval" y su identificador es `naval-battle`, ambos genéricos; no usa el nombre ni el aspecto de ninguna edición comercial. Las reglas de este documento están escritas para la plataforma, y la cuadrícula y los barcos se dibujan en el frontend (ADR-019, F9). No es asesoría legal.

## Reglas

- Dos jugadores. Cada uno tiene una cuadrícula de 10 × 10 con cinco barcos: portaaviones (5 casillas), acorazado (4), crucero (3), submarino (3) y destructor (2). En el motor son `S5`, `S4`, `S3A`, `S3B` y `S2`.
- **Colocación.** Al empezar, los dos asientos están activos a la vez. Cada uno coloca su flota entera de una vez y ya no la cambia. Los barcos van en horizontal o en vertical, dentro de la cuadrícula, sin solaparse y **sin tocarse, ni en diagonal**.
- **Disparos.** Cuando los dos han colocado, dispara el asiento 0. Cada turno es un disparo a una casilla del rival a la que no se haya disparado: agua, tocado o hundido. El turno pasa al otro, acierte o no.
- Cuando se hunde un barco, sus casillas pasan a verlas los dos.
- Gana quien hunde los cinco barcos del rival. No hay empate.
- Si un asiento se retira (tiempo agotado, rendición o abandono), pierde y gana el otro (regla 7.18), también durante la colocación.
- No hay azar: la semilla que recibe el motor no se usa.

## Opciones

Ninguna (ADR-019, F3). `parseSettings` solo acepta el objeto vacío `{}`; cualquier otra cosa da `INVALID_SETTINGS`.

## Controles de tiempo

| Modalidad | Tiempo total por jugador |
|---|---|
| En tiempo real | 10, 15 o 20 minutos |
| Por turnos | 12, 24 o 36 horas |

En la colocación corren los dos relojes a la vez, porque los dos asientos están activos.

## Acciones, eventos y vista

- Acciones: `{ "type": "PLACE_FLEET", "ships": [{ "ship": "S5", "row": 0, "col": 0, "orientation": "H" }, …] }`, con los cinco barcos, y `{ "type": "FIRE", "row": 0..9, "col": 0..9 }`. `H` va hacia la derecha desde la casilla y `V`, hacia abajo.
- Eventos, que son públicos: `FLEET_PLACED` (solo el asiento, sin posiciones), `SHOT_FIRED` (asiento, casilla y resultado `MISS`, `HIT` o `SUNK`) y `SHIP_SUNK` (el dueño del barco, el barco y sus casillas).
- Vista: la fase (`PLACEMENT` o `FIRING`), la lista de barcos, y para cada asiento su cuadrícula: si ya colocó, los disparos recibidos con su resultado, los barcos hundidos y, **solo en la propia**, los barcos. La vista de quien no ocupa asiento no lleva ninguna flota. Además, el último disparo. Los tipos están en [`types.ts`](types.ts).

## Motivos de rechazo

Precisan un rechazo `INVALID_ACTION` (ADR-014, decisión K6; [catálogo de errores](../../../../../contracts/04-error-catalog.md)):

| Motivo | Cuándo |
|---|---|
| `MALFORMED_ACTION` | La acción no tiene la forma de arriba |
| `WRONG_PHASE` | Disparar durante la colocación, o colocar durante los disparos |
| `INVALID_FLEET` | Falta un barco, sobra uno o uno se repite |
| `SHIP_OUT_OF_BOUNDS` | Un barco se sale de la cuadrícula |
| `SHIPS_OVERLAP` | Dos barcos comparten casilla |
| `SHIPS_TOUCHING` | Dos barcos se tocan, también en diagonal |
| `CELL_OUT_OF_RANGE` | Disparo fuera de la cuadrícula |
| `CELL_ALREADY_FIRED` | Ya disparó a esa casilla |

Además, como todo motor: `NOT_YOUR_TURN` si ese asiento no está activo (también si intenta colocar por segunda vez) y `GAME_ALREADY_FINISHED` si el juego terminó.

## Alta en el catálogo

Entra **inactivo**, y su versión sin ser la vigente, con la migración `alta_batalla_naval`. Se activa desde la administración (la versión, que sea la vigente y el juego) después de desplegar el frontend que sabe mostrarlo ([guía para añadir un juego](../../../../../docs/guia-nuevo-juego.md)).

## Pruebas

Las reglas propias, en [`engine.test.ts`](engine.test.ts). Las del contrato las comprueba la batería común con los datos de prueba de `naval-battle@1.0.0` en [`conformance.test.ts`](../../conformance.test.ts).
