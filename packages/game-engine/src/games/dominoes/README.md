# Dominó (`dominoes`, versión `1.0.0`)

Es el tercer juego de la plataforma. Es el primero con azar y con más de dos jugadores, y tiene mano oculta. Las decisiones están en [ADR-020](../../../../../docs/adr/0020-domino-y-asientos-retirados.md) (DO1 a DO17). Las reglas de la plataforma (relojes, retiradas y abandono) están en [ADR-009](../../../../../docs/adr/0009-reglas-de-dominio.md) y no se repiten aquí.

## Origen y nombre

El dominó es un juego tradicional, de dominio público. "Dominó" es un nombre genérico y `dominoes`, su identificador en inglés. Las reglas de este documento están escritas para la plataforma y siguen la costumbre más extendida en México. Las fichas se dibujan en el frontend con CSS propio (ADR-019, F9). No es asesoría legal.

## Reglas

- **Fichas.** Las 28 del doble seis, de [0|0] a [6|6]. Cada ficha vale la suma de sus dos lados.
- **Jugadores.** De 2 a 4. Con 4 se juega en parejas: los asientos 0 y 2 contra el 1 y el 3.
- **Reparto.** Al empezar cada mano se barajan las 28 y se reparten 7 a cada jugador. Las que sobran forman el pozo: 14 fichas con 2 jugadores, 7 con 3 y ninguna con 4.
- **Salida.**
  - En la primera mano sale quien tiene el doble más alto, y tiene que salir con él.
  - Si nadie tiene un doble, sale la ficha con más puntos. A igualdad de puntos, la que tiene el lado más alto.
  - En las manos siguientes sale quien ganó la anterior, con la ficha que quiera.
  - Tras un tranque empatado, vuelve a salir quien salió.
- **Turno.** Por orden de asiento: 0, 1, 2, 3 y vuelta a empezar. Un asiento retirado se salta.
- **Jugar.** Cada jugada es una ficha que case con uno de los dos extremos de la línea.
  - Si cabe en los dos extremos y estos son distintos, el jugador dice en cuál.
  - Si los dos extremos son iguales, da lo mismo y no hace falta decirlo.
  - Los dobles no abren más extremos.
- **Robar y pasar.** Son automáticos.
  - A quien le toca y no puede jugar, el motor le roba del pozo, una a una, hasta que puede o el pozo se acaba.
  - Si sigue sin poder, pasa.
  - Los demás ven cuántas robó y que pasó, nunca cuáles.
- **Fin de la mano.**
  - *Dominó:* alguien pone su última ficha.
  - *Tranque:* nadie puede jugar y el pozo está vacío. Gana la mano quien suma menos puntos en su mano; con 4, la pareja que suma menos.
  - *Tranque empatado:* si hay empate en lo más bajo, no gana nadie.
- **Puntos.** Quien gana la mano anota los puntos que les quedan a sus rivales. Con 4, la pareja anota los de la otra pareja, sin contar los de su compañero. En el tranque se anota lo mismo.
- **Fin de la partida.** Gana el primero (o la primera pareja) que llega a **100 puntos** al acabar una mano. En cada mano anota uno solo, así que no hay empate.

### Detalles que el ADR no fijaba

- **Tranque ganado por una pareja.** En la mano siguiente sale el jugador de esa pareja que menos suma. A igualdad, sale el primero en jugar desde quien salió en la mano.
- **Si quien tiene que salir se retiró**, sale el siguiente asiento que sigue en juego.

## Retiradas

Una retirada es un tiempo agotado, una rendición o un abandono.

- **Con 2:** pierde quien se retira y gana el otro (regla 7.18).
- **Con 4:** pierde la pareja del retirado y la partida termina.
- **Con 3:**
  - Las fichas del retirado salen del juego sin mostrarse y su turno se salta.
  - La mano sigue con los otros dos. Ni el tranque ni los puntos cuentan sus fichas.
  - Si le tocaba a él, juega el siguiente.
  - Las manos siguientes se reparten solo entre los dos que siguen: 7 a cada uno y 14 al pozo.
  - Si queda uno solo, gana. Al terminar, el retirado pierde.

## Azar

El motor arranca un generador con la semilla que le da la plataforma (`src/random.ts`, sfc32). El estado del generador va dentro del estado del juego, y cada mano baraja con él. Por eso cada transición es determinista, y una partida se puede reproducir desde su semilla y sus jugadas.

## Opciones

Ninguna (ADR-019, F3). `parseSettings` solo acepta el objeto vacío `{}`.

## Controles de tiempo

| Modalidad | Tiempo total por jugador |
|---|---|
| En tiempo real | 10, 15 o 20 minutos |
| Por turnos | 12, 24 o 36 horas |

Robar y pasar no gastan reloj, porque los hace el motor en la misma transición que la jugada anterior.

## Acción

```json
{ "type": "PLAY", "tile": [2, 5], "end": "LEFT" }
```

`end` solo es obligatorio si la ficha cabe en los dos extremos y estos son distintos. La acción se anota con la ficha ordenada y el extremo usado.

Hay motivos de rechazo propios, todos con el código `INVALID_ACTION`:

- `MALFORMED_ACTION`
- `TILE_NOT_IN_HAND`
- `WRONG_OPENING_TILE`
- `TILE_DOES_NOT_FIT`
- `END_REQUIRED`

## Eventos

Los eventos son públicos y no llevan fichas ocultas.

- `TILE_PLAYED`: una ficha jugada.
- `TILES_DRAWN`: cuántas fichas se robaron.
- `PASSED`: un jugador pasó.
- `HAND_ENDED`: el fin de una mano. Lleva las fichas que le quedaban a cada uno, que al terminar la mano son públicas.
- `HAND_STARTED`: el comienzo de una mano.
- `SEAT_RETIRED`: un asiento se retiró.

## Vista

Cada asiento ve:

- Su mano y las fichas que puede jugar, con sus extremos.
- Cuántas fichas tiene cada uno.
- La línea, sus extremos y cuántas fichas quedan en el pozo.
- Los puntos, las parejas y los retirados.
- El resumen de la última mano.

Quien no ocupa asiento, o se retiró, no ve ninguna mano.
