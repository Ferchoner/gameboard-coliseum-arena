# Cinco a ciegas (`blind-five`, versión `1.0.0`)

Es el cuarto juego de la plataforma y el primero con jugadas fuera de turno. Es un juego de deducción en el que lo oculto a cada jugador es **lo suyo**: ve los números de los demás, pero no los propios. Las decisiones están en [ADR-022](../../../../../docs/adr/0022-cinco-a-ciegas-y-jugadas-fuera-de-turno.md) (CA1 a CA21). Las reglas de la plataforma (relojes, retiradas y abandono) están en [ADR-009](../../../../../docs/adr/0009-reglas-de-dominio.md) y no se repiten aquí.

## Origen y nombre

Se inspira en el juego de mesa de deducción Got Five!, de Yoann Levet (Blue Orange, 2026), sin ninguna relación con su autor ni con su editorial. El nombre, el arte, los textos y la presentación son propios, y la marca no aparece en la aplicación ([ADR-019](../../../../../docs/adr/0019-batalla-naval-y-jugadas-simultaneas.md), F9, enmendada por ADR-022, CA1). Las reglas de este documento están escritas para la plataforma. No es asesoría legal.

## Fichas

- 60 fichas, del 1 al 60, todas distintas.
- **Cinco palos de 12 fichas.** El palo va de 5 en 5: 1, 6, 11, 16… son `S1`; 2, 7, 12… son `S2`; 3, 8, 13…, `S3`; 4, 9, 14…, `S4`; y 5, 10, 15…, `S5`.
- **Puntos.** Cada ficha tiene 1, 2 o 3 puntos, por tramos de 5 números que se repiten cada 15: del 1 al 5, 1 punto; del 6 al 10, 2; del 11 al 15, 3; del 16 al 20, otra vez 1, y así hasta el 60. Cada palo tiene 4 fichas de cada número de puntos.

En pantalla, cada palo tiene su color y su figura, sobre fondo liso, para que se distingan sin depender del color (CA3).

## Reglas

- **Jugadores.** De 2 a 4, cada uno por su cuenta.
- **Preparación.**
  - Cada jugador recibe una ficha de cada palo, al azar. Su atril las ordena de menor a mayor.
  - Ve el palo de sus fichas, pero no su número ni sus puntos. Los demás ven las suyas enteras.
  - Se ponen 5 fichas boca arriba, una de cada palo.
  - El resto queda boca abajo en el pozo: 45 fichas con 2 jugadores, 40 con 3 y 35 con 4.
- **Turno.** Empieza el asiento 0 y siguen por número de asiento. En su turno, el jugador:
  1. **Revela** una ficha boca abajo del palo que elija. El azar decide cuál sale. Ahora hay una más boca arriba.
  2. **Pide una pista** sobre una de las fichas boca arriba. La da el servidor, que conoce todos los atriles:
     - **Ordenar:** en cuál de los 6 huecos de su atril cae la ficha (antes del primer número, entre el primero y el segundo, …, después del quinto).
     - **Comparar:** si la ficha tiene los mismos puntos que una de las suyas, la que elija.

  La ficha de la pista sale de las boca arriba y queda, a la vista de todos, junto al atril de quien preguntó. Después le toca al siguiente.
- **Cantar.** En cualquier momento, **también fuera de turno**, un jugador puede cantar sus cinco números de menor a mayor.
  - Si acierta los cinco, gana y la partida termina.
  - Si falla, queda fuera: se salta su turno, no vuelve a cantar y ve sus números. Su atril sigue a la vista de los demás. No se dice cuáles falló.
  - Si queda un solo jugador en juego, gana sin cantar.
  - Cantar algo que no son cinco números distintos del 1 al 60, en orden, se rechaza y no cuenta como intento.
- **Agotamiento.**
  - Un palo sin fichas boca abajo no se puede revelar.
  - Sin pozo, el turno empieza en la pista.
  - Sin pozo ni fichas boca arriba, el jugador al que le toca solo puede cantar. Así la partida siempre termina.
- **Resultado.** Quien acierta, o el último que queda, gana; los demás pierden. No hay empate ni puntos.

## Retiradas

Una retirada es un tiempo agotado, una rendición o un abandono.

- **Con 2:** pierde quien se retira y gana el otro (regla 7.18).
- **Con 3 o 4:** el retirado queda fuera, como quien canta mal. Si le tocaba, juega el siguiente. Si queda uno solo, gana.
- Retirar a quien ya quedó fuera por cantar mal no cambia nada (CA20).

## Azar

El motor arranca un generador con la semilla que le da la plataforma (`src/random.ts`). Con él baraja cada palo al empezar y elige la ficha que sale en cada revelado. El estado del generador va dentro del estado del juego, así que cada transición es determinista.

## Opciones

Ninguna (ADR-019, F3). `parseSettings` solo acepta el objeto vacío `{}`.

## Controles de tiempo

- **Tiempo real:** 10, 15 o 20 minutos por jugador.
- **Por turnos:** 12, 24 o 36 horas por jugador.

Pensar durante el turno de los demás no gasta reloj, y cantar fuera de turno tampoco (contrato del motor, M10; ADR-022, CA19).

## Acciones

```json
{ "type": "REVEAL", "suit": "S3" }
{ "type": "CLUE", "tile": 37, "clue": "SORT" }
{ "type": "CLUE", "tile": 37, "clue": "COMPARE", "position": 2 }
{ "type": "DECLARE", "numbers": [4, 18, 27, 41, 55] }
```

`position` va de 0 a 4, de la ficha menor a la mayor del atril propio. `DECLARE` es la única acción que vale fuera de turno.

## Eventos de juego

Son públicos (contrato, M8). Ninguno lleva un número de atril que su dueño no deba ver.

| Evento | Contenido |
|---|---|
| `TILE_REVEALED` | `{ seat, tile }` |
| `CLUE_GIVEN` | `{ seat, tile, clue: 'SORT', slot }` o `{ seat, tile, clue: 'COMPARE', position, sameDots }` |
| `DECLARED` | `{ seat, numbers, correct }` |
| `SEAT_OUT` | `{ seat, reason }`, con `WRONG_DECLARATION` o `RETIRED` |

## Vista

`BlindFiveView`, en `types.ts`:

- `catalog`: las 60 fichas con su palo y sus puntos, para la hoja de deducción.
- `turn` y `step` (`REVEAL`, `CLUE` o `DECLARE_ONLY`), o `null` al terminar.
- `seats`: de cada asiento, su atril, sus pistas y si está fuera.
  - Del atril propio, mientras se sigue en juego, solo el palo de cada ficha; el número y los puntos van a `null`.
  - Sin asiento, ningún atril se ve hasta el final.
- `faceUp`: las fichas boca arriba. `revealed`: todas las que han estado boca arriba, en orden.
- `supplyBySuit`: cuántas quedan boca abajo de cada palo.
- `declarations` y `winner`.

## Motivos de rechazo

Con el código `INVALID_ACTION`:

| Motivo | Cuándo |
|---|---|
| `MALFORMED_ACTION` | La acción no tiene la forma de arriba |
| `WRONG_STEP` | Pedir pista antes de revelar, o revelar después |
| `SUIT_EXHAUSTED` | Revelar un palo sin fichas boca abajo |
| `TILE_NOT_FACE_UP` | Pista con una ficha que no está boca arriba |
| `POSITION_OUT_OF_RANGE` | Comparar con una posición que no es de 0 a 4 |
| `INVALID_DECLARATION` | Cantar sin cinco números distintos del 1 al 60 en orden |
| `MUST_DECLARE` | Revelar o pedir pista cuando ya no queda ninguna ficha para ello |

Revelar o pedir pista fuera de turno, o cualquier acción de quien ya está fuera, se rechaza con `NOT_YOUR_TURN`.
