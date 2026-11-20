# ADR-022: Cinco a ciegas y jugadas fuera de turno

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-20 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Parte de** | La petición del 2026-11-20 de probar a llevar a la plataforma un juego de deducción comercial que el usuario tiene en casa |
| **Depende de** | Contrato del motor (M7, M8, M10, M11), regla 7.18 (ADR-009), regla 8.11 (ADR-010), ADR-018 (Z1 a Z8), ADR-019 (F3, F9, X15, X16), ADR-020 (DO18 a DO21), `docs/guia-nuevo-juego.md` |
| **Revisado sobre** | `main` en `3387f24` |

Las decisiones de este ADR se llaman **CA1 a CA21** (de "Cinco a ciegas"). Se aceptaron todas tal como se recomiendan (sección 7).

---

## 1. Contexto

### 1.1 El juego de origen

Quien decide tiene el juego de mesa **Got Five!**, de Yoann Levet, publicado por Blue Orange en 2026: de 2 a 4 jugadores, desde 8 años, unos 15 minutos. Es un juego de **deducción con información oculta invertida**: cada jugador ve los números de los demás, pero no los suyos, y gana quien adivina primero sus cinco números.

Las reglas se leyeron en el reglamento oficial en inglés (edición de EE. UU. y de Reino Unido) y en una reseña. Resumen con nuestras palabras:

- **Material.** 60 fichas numeradas del 1 al 60, todas distintas, de 5 colores. Cada ficha lleva además 1, 2 o 3 puntos. Cada jugador tiene un atril de 5 huecos con una zona de 6 muescas para colocar pistas, una pantalla, una hoja con las 60 fichas para tachar y un rotulador.
- **Preparación.** Cada jugador recibe, sin mirarlas, una ficha de cada color. Otro jugador se las ordena de menor a mayor en el atril, con los números hacia fuera: **todos ven sus números menos él**. Se ponen 5 fichas más boca arriba, una de cada color. Cada uno tacha en su hoja todo lo que ve.
- **Turno.** Dos pasos, en este orden:
  1. **Revelar:** saca una ficha boca abajo del color que elija y la pone boca arriba con las demás.
  2. **Pedir una pista** sobre una de las 6 fichas boca arriba, a un jugador de al lado. Hay dos pistas:
     - **Ordenar:** el otro coloca esa ficha en la muesca del atril de quien pregunta que le corresponde por orden. Así se sabe entre qué dos números propios cae.
     - **Comparar:** quien pregunta la pone junto a una de sus fichas, y el otro dice si tienen el mismo número de puntos.
- **Final.** En cualquier momento, también fuera de su turno, un jugador puede cantar que tiene sus cinco y decirlos en orden. Si acierta, gana. Si falla, queda fuera y mira el resto de la partida. Si todos menos uno han fallado, gana el que queda. Cada jugador tiene un solo intento.
- **Azar.** Solo el reparto inicial y la ficha que sale al revelar. No hay dados ni cartas.

### 1.2 Puntos que el reglamento no aclara

| # | Asunto | Lo que dice el reglamento | Cómo lo resuelve este ADR |
|---|---|---|---|
| A1 | Qué pasa con la ficha usada en la pista | No lo dice, pero afirma que siempre hay 6 para elegir | Sale del montón boca arriba y queda junto al atril de quien preguntó (CA8) |
| A2 | A cuál de los dos vecinos se pregunta | "A uno de los de al lado" | En línea no importa: responde el servidor (CA7) |
| A3 | Qué hace quien falla | "Mira desde fuera" | Se salta su turno y ve sus números (CA11) |
| A4 | Un color o el pozo agotados | Nada | CA12 |
| A5 | Dos que cantan a la vez | Nada | El servidor las ordena por llegada (CA9) |
| A6 | Cuántas fichas tienen 1, 2 o 3 puntos | La hoja las lista, pero el reglamento no da el reparto | **Lo dio el usuario el 2026-11-20** con su juego: el color sigue el número de 5 en 5 y los puntos van por tramos de 5 números (CA3) |
| A7 | Quién empieza | "El más joven" | La plataforma no conoce edades: empieza el asiento 0, que la plataforma sortea (CA5) |

### 1.3 Lo que pone a prueba en la plataforma

Comparado con los tres juegos que ya hay:

| Rasgo | ¿Ya lo hay? | Dónde |
|---|---|---|
| De 2 a 4 jugadores | Sí | Dominó (ADR-020) |
| Información oculta por asiento | Sí, con `getView` | Batalla naval y Dominó. Aquí al revés: lo oculto a cada asiento es **lo suyo** |
| Azar con la semilla de la plataforma | Sí | `packages/game-engine/src/random.ts` (DO15) |
| Asientos que quedan fuera con la partida en marcha | Sí, por retirada | T-24 (DO18 a DO21). Aquí, además, por fallar la adivinanza, que decide el motor (CA20) |
| Un turno en dos pasos del mismo asiento | Sí | X16: la versión del asiento vuelve a contar desde su jugada |
| **Una jugada de un asiento al que no le toca** | **No** | Cantar fuera de turno. Es lo único nuevo (CA9, CA19) |

---

## 2. Resumen

| ID | Asunto | Recomendación |
|---|---|---|
| **Derechos y presentación** | | |
| CA1 | Encaje con la regla de derechos (F9) | **Contradicción con F9**, que pide mecánicas tradicionales o de dominio público, y esta es moderna. Recomiendo **enmendar F9** para admitir mecánicas modernas si todo lo demás es propio: nombre, arte, textos y catálogo de fichas |
| CA2 | Nombre e identificador | "**Cinco a ciegas**", `blind-five`, versión `1.0.0`, alta inactiva. La marca no aparece en la aplicación; solo una línea de origen en el `README.md` del motor |
| CA3 | Catálogo de fichas | El **patrón** del original, que es aritmético: palo según el número de 5 en 5 y puntos por tramos de 5 números. Salen 5 palos de 12 fichas, con 4 de 1, 2 y 3 puntos en cada palo. **Colores, nombres y formas propios** |
| **El juego** | | |
| CA4 | Jugadores | De 2 a 4, cada uno por su cuenta |
| CA5 | Preparación y orden | Como el original. Empieza el asiento 0 y siguen 1, 2, 3. En la revancha los asientos rotan (K11) |
| CA6 | Turno | Dos acciones: `REVEAL` (elige palo) y después `CLUE`. El asiento sigue activo entre las dos |
| CA7 | Quién da la pista | **El servidor**, que conoce todo. No hay vecino al que preguntar |
| CA8 | La ficha de la pista | Sale del montón boca arriba y queda, pública, junto al atril de quien preguntó |
| CA9 | Cuándo se canta | **En cualquier momento**, también fuera de turno, como en el original. Necesita T-25 (CA19) |
| CA10 | Cantar mal escrito | Cinco números distintos del 1 al 60 en orden ascendente; si no, se rechaza **sin** eliminar |
| CA11 | Quien falla | Queda fuera: se salta su turno, ve sus números y sigue viendo la partida. Su atril sigue a la vista de los demás. Si queda uno solo, gana |
| CA12 | Palo o pozo agotados | Un palo agotado no se puede elegir. Sin pozo, se salta el revelado. Sin fichas boca arriba, solo se puede cantar |
| CA13 | Retiradas (tiempo, rendición, abandono) | Con 2, regla 7.18. Con 3 o 4, como quien falla (CA11) |
| CA14 | Controles de tiempo | Tiempo real: 10, 15 y 20 minutos. Por turnos: 12, 24 y 36 horas |
| CA15 | Acciones, eventos, vista y rechazos | Sección 3.6 |
| CA16 | La hoja de deducción | En el navegador. Tacha sola lo que es público; las deducciones las marca el jugador. **No deduce por él** |
| CA17 | Tablero | Sección 3.8 |
| CA18 | Hacer trampa con dos cuentas | Riesgo conocido y aceptado en la versión 1: jugar entre conocidos. Sin medida técnica |
| **Plataforma** | | |
| CA19 | Jugadas fuera de turno (T-25) | El motor puede aceptar jugadas de un asiento que no está activo; esas jugadas no gastan reloj. Enmienda del contrato y un cambio pequeño en la página de la partida |
| CA20 | Quien queda fuera por el motor | Sin cambio de plataforma: el motor lo lleva dentro y `retireSeat` sobre ese asiento no cambia nada |
| CA21 | Entrega | Dos pull requests: primero T-25, después el juego, inactivo |

Ninguna decisión añade dependencias. CA19 cambia el significado documentado de `activeSeats` y la página de la partida, pero no la forma de la interfaz del motor, de la API ni de los mensajes.

---

## 3. El juego

### 3.1 Derechos (CA1, CA2, CA3)

**Contradicción detectada.** F9 (ADR-019, sección 0), aceptada el 2026-11-19, dice que todos los juegos usan "mecánicas tradicionales o de dominio público". Got Five! es un diseño de 2026 con autor y editorial. Llevarlo a la plataforma, aunque sea con otro nombre, **no cabe en F9 tal como está**.

Lo que se protege y lo que no, en general (no es asesoría legal):

- El **nombre** es una marca. No se usa.
- El **arte**, la caja y el **texto del reglamento** tienen derechos de autor. No se copian: arte propio en CSS o SVG y reglas escritas por nosotros.
- Las **mecánicas** en sí, por lo general, no se protegen con derechos de autor. Pero es un terreno gris, y hay editoriales que reclaman cuando un clon digital se parece demasiado al original.

| Opción | A favor | En contra |
|---|---|---|
| **Enmendar F9:** se admiten mecánicas modernas si nombre, arte, textos y catálogo son propios, y la marca no aparece en la aplicación | Permite este juego y otros parecidos. El proyecto es privado, sin fines de lucro y con pocos usuarios | Afloja una regla recién aceptada. Si la plataforma se abre al público, habría que revisarlo |
| Mantener F9 y no traerlo. En su lugar, un juego de deducción tradicional, como Picas y fijas (también llamado Toros y vacas) | Cumple F9 sin cambios | No es el juego que el usuario quiere probar |
| Pedir permiso a la editorial | La vía más segura | Lleva tiempo y puede no haber respuesta |

**Recomendación:** enmendar F9 con este texto: *"Se admiten mecánicas de juegos modernos con nombre, arte, textos y catálogo de piezas propios. La marca original no aparece en la aplicación; el `README.md` del motor dice en una línea en qué juego se inspira, sin dar a entender ninguna relación con su editorial. Antes de abrir la plataforma al público se revisan estos juegos."*

**Nombre (CA2).** "**Cinco a ciegas**", con identificador `blind-five`. Dice lo esencial del juego, que hay que adivinar cinco números sin verlos, y no se parece a la marca. Otras opciones: "Los cinco ocultos" (`hidden-five`) o "Tus cinco" (`your-five`).

**Catálogo (CA3).** El reglamento no publica qué color y qué puntos tiene cada número. **El usuario lo pasó el 2026-11-20 desde su juego**, y es un patrón aritmético:

- **Color:** va de 5 en 5. En el original, 1, 6, 11, 16… son verdes; 2, 7, 12, 17…, rosas; 3, 8, 13, 18…, azules; 4, 9, 14, 19…, rojas; y 5, 10, 15, 20…, naranjas. El 16 es verde (confirmado por el usuario el 2026-11-20).
- **Puntos:** van por tramos de 5 números que se repiten cada 15. Del 1 al 5, 1 punto; del 6 al 10, 2; del 11 al 15, 3; del 16 al 20, otra vez 1, y así hasta el 60.

En el motor, con `n` de 1 a 60:

```ts
const suit = ((n - 1) % 5) + 1;                 // palo 1 a 5
const dots = Math.floor(((n - 1) % 15) / 5) + 1; // 1, 2 o 3 puntos
```

Sale el reparto que se proponía antes de conocerlo: **5 palos de 12 fichas, con 4 fichas de 1, 2 y 3 puntos en cada palo**. Consecuencias para el juego, que conviene que el tablero haga visibles:

- Como cada uno conoce el palo de sus fichas, ya sabe de cada número el resto al dividir entre 5: cada ficha propia tiene **12 candidatos de entrada**, menos los que se ven.
- La pista de comparar dice si el número cae en el mismo tramo de 5, dentro de cada bloque de 15, que la ficha comparada. Si la respuesta es sí, junto con el palo, a esa ficha le quedan **4 candidatos**; si es no, 8.

**Lo que se usa y lo que no.** El patrón es una regla aritmética, no un dibujo ni un texto, y es lo que hace que la deducción funcione. Recomiendo **usar el mismo patrón** con presentación propia:

- Cinco palos con **color y figura propios**, para que se distingan sin depender del color (**pedido por el usuario el 2026-11-20**, para que el juego sea accesible a personas con daltonismo). Todos sobre **fondo liso**: el usuario decidió que la figura basta, sin tramas. Se ven igual en el anverso y en el **reverso**, que es lo único que el dueño ve de sus fichas:

  | Palo | Figura | Color (paleta Okabe-Ito, distinguible con daltonismo) |
  |---|---|---|
  | `S1` | Círculo | Verde azulado `#009E73` |
  | `S2` | Triángulo | Púrpura rojizo `#CC79A7` |
  | `S3` | Cuadrado | Azul `#0072B2` |
  | `S4` | Rombo | Bermellón `#D55E00` |
  | `S5` | Estrella | Amarillo anaranjado `#E69F00` |

  Además, cada palo tiene un nombre que se lee en pantalla y lo dice el lector de pantalla ("círculo", "triángulo"…), y el contraste del número con el fondo cumple WCAG AA. Los colores siguen el orden del original para quien lo conozca, pero no son los mismos.
- Los puntos se dibujan a nuestra manera, en SVG.
- El catálogo va en el código del motor y en su `README.md`, y la hoja de deducción lo muestra.

### 3.2 Reglas (CA4 a CA12)

**Preparación (CA5).** Con la semilla de la plataforma:

1. Se baraja cada palo.
2. Cada asiento recibe una ficha de cada palo. Su atril se ordena de menor a mayor, así que el orden de los palos en el atril sí lo conoce su dueño; los números, no.
3. Se ponen boca arriba 5 fichas, una de cada palo.
4. El resto es el pozo, boca abajo: 45 fichas con 2 jugadores, 40 con 3 y 35 con 4.

Empieza el asiento 0 y siguen por número de asiento. La plataforma sortea los asientos y en la revancha los rota (K11), así que quien empieza cambia de una partida a otra.

**Turno (CA6).** Dos acciones del mismo asiento:

1. `REVEAL` con un palo. El motor saca al azar una ficha boca abajo de ese palo y la pone boca arriba. Ahora hay 6.
2. `CLUE` con una de las 6 fichas boca arriba y el tipo de pista:
   - `SORT`: el motor dice en cuál de los 6 huecos del atril cae esa ficha (antes del primer número, entre el primero y el segundo, …, después del quinto).
   - `COMPARE` con una posición del atril (de la 1 a la 5): el motor dice si esa ficha y la del atril tienen los mismos puntos.

Después le toca al siguiente. Entre las dos acciones el asiento sigue activo; X16 ya cubre que dos clics seguidos no apliquen dos jugadas.

*Alternativa:* una sola acción con las dos cosas. Se descarta, porque la pista se elige después de ver qué salió al revelar.

**Quién da la pista (CA7).** En la mesa, el vecino solo hace de árbitro: coloca la ficha donde toca o dice "sí" o "no". No elige nada. En línea, lo hace el servidor, que conoce todos los atriles. Así no hay que esperar a nadie y nadie puede dar una pista falsa.

**La ficha de la pista (CA8).** Sale del montón boca arriba (vuelven a quedar 5) y queda junto al atril de quien preguntó, con la respuesta. Todos la ven. Cada pista que recibió un jugador queda en su historial, a la vista.

**Cantar (CA9, CA10).** `DECLARE` con cinco números:

- Lo puede enviar **cualquier asiento que siga en juego, le toque o no** (CA19). En mitad del turno de otro, también.
- Tiene que ser una lista de 5 números distintos, del 1 al 60, en orden ascendente. Si no, se rechaza con `INVALID_DECLARATION` y **no** cuenta como intento: un error al escribir no debe eliminar a nadie.
- Si los cinco coinciden con su atril, gana y la partida termina.
- Si no, queda fuera (CA11). No se dice cuáles falló: el original tampoco lo dice.
- Si dos cantan casi a la vez, el servidor aplica la que llega primero. La segunda llega con una versión que ya no vale y se rechaza con `STALE_STATE_VERSION`. Si la partida ya terminó, recibe el estado final.

*Alternativa a CA9:* cantar solo en el turno propio. No necesita T-25, pero cambia el juego: quien saca la pista decisiva tendría que esperar una vuelta entera y otro podría ganarle. Con un tercer paso al final de cada turno ("Terminar turno" o "Cantar") se arregla en parte, a cambio de un clic más por turno.

**Quien falla (CA11).**

- Se salta su turno el resto de la partida y no puede volver a cantar.
- Su atril **sigue a la vista** de los demás: sus números siguen fuera del pozo y ayudan a deducir.
- **Ve sus propios números.** Ya está fuera y lo que sabe de los demás ya lo sabía, así que no da ventaja a nadie.
- Sigue en la sala viendo la partida.
- Si queda **un solo** jugador en juego, gana sin cantar. Con 2 jugadores, el que falla pierde en ese momento.

**Agotamiento (CA12).** El reglamento no lo trata. Con 4 jugadores quedan 7 fichas boca abajo de cada palo; con 2, 9.

- Un palo sin fichas boca abajo no se puede elegir (`SUIT_EXHAUSTED`).
- Si el pozo está vacío, el turno empieza directamente en la pista.
- Si además no queda ninguna ficha boca arriba, no hay pista posible: el jugador al que le toca **solo puede cantar**. Como el último que queda gana sin cantar, la partida siempre termina.

En la práctica casi nunca se llega: se canta antes de agotar el pozo.

**Resultado.** Quien acierta, o el último que queda, `WIN`; los demás, `LOSS`. No hay empate ni puntos (`score` sin usar).

### 3.3 Retiradas (CA13)

Tiempo agotado, rendición y abandono los detecta la plataforma, que llama a `retireSeat` (M11):

- **Con 2:** termina la partida. Pierde quien se retira y gana el otro (7.18).
- **Con 3 o 4:** el retirado queda fuera como quien falla (CA11). Si solo queda uno en juego, gana. La plataforma ya guarda y muestra al retirado (T-24, DO18 a DO21).

### 3.4 Controles de tiempo (CA14)

- En la mesa son unos 15 minutos con 4 jugadores. Cada turno son dos decisiones rápidas, pero pensar las deducciones lleva tiempo.
- Una partida típica son de 6 a 12 turnos por jugador. Con 10 minutos, toca a casi un minuto por turno. Pensar durante el turno de los demás no gasta reloj, y cantar fuera de turno tampoco (CA19).
- **Tiempo real:** 10, 15 y 20 minutos por jugador. **Por turnos:** 12, 24 y 36 horas (N1).
- Por turnos, una partida de 4 jugadores con 10 turnos cada uno son unas 40 jugadas por jugador repartidas en días. Cantar fuera de turno ayuda: el que lo tiene claro no espera a que le toque.

### 3.5 Azar

Con el generador de `random.ts` (DO15), cuyo estado va dentro del estado del juego (M7). El azar decide el reparto inicial y qué ficha sale en cada `REVEAL`. Nada más.

### 3.6 Acciones, eventos, vista y motivos de rechazo (CA15)

**Acciones:**

```ts
type BlindFiveAction =
  | { type: 'REVEAL'; suit: Suit }                                  // Suit: 'S1' | 'S2' | 'S3' | 'S4' | 'S5'
  | { type: 'CLUE'; tile: number; clue: 'SORT' }
  | { type: 'CLUE'; tile: number; clue: 'COMPARE'; position: 0 | 1 | 2 | 3 | 4 }
  | { type: 'DECLARE'; numbers: [number, number, number, number, number] };
```

**Eventos de juego**, públicos (M8). Ninguno lleva un número de atril que su dueño no deba ver:

| Evento | Contenido |
|---|---|
| `TILE_REVEALED` | `{ seat, tile }`. La ficha es pública desde ese momento |
| `CLUE_GIVEN` | `{ seat, tile, clue: 'SORT', slot }` o `{ seat, tile, clue: 'COMPARE', position, sameDots }`. Los demás ya ven el atril de `seat`, así que no les da nada nuevo |
| `DECLARED` | `{ seat, numbers, correct }` |
| `SEAT_OUT` | `{ seat, reason: 'WRONG_DECLARATION' \| 'RETIRED' }` |

**Vista de un asiento** (`getView(state, seat)`):

- `ownStand`: los **palos** de sus 5 fichas, en orden, **sin número ni puntos**. Con los números solo si ya está fuera o la partida terminó.
- `rivals`: por cada otro asiento, su atril completo (número, palo y puntos), sus pistas y si está fuera.
- `ownClues`: las pistas que ha recibido.
- `faceUp`: las fichas boca arriba. `supplyBySuit`: cuántas quedan boca abajo de cada palo.
- `step`: `REVEAL`, `CLUE` o `DECLARE_ONLY`, y de quién es el turno.
- `declarations`: los intentos hechos, públicos.
- `catalog`: las 60 fichas con su palo y sus puntos, para la hoja de deducción.

La **vista sin asiento** (`getView(state, null)`) no lleva ningún número de atril: solo palos, fichas públicas y pistas. Al terminar, todos los atriles.

**Lo que hay que vigilar:** es el primer juego en el que lo oculto a un asiento es **lo suyo**. Un error que mande a cada asiento la vista de otro le enseñaría sus propios números. Por eso la prueba en navegador comprueba, en la respuesta REST y en cada `MATCH_UPDATED`, que ningún jugador recibe sus números mientras sigue en juego.

**Motivos de rechazo**, con `INVALID_ACTION` (K6):

| Motivo | Cuándo |
|---|---|
| `MALFORMED_ACTION` | La acción no tiene la forma de arriba |
| `WRONG_STEP` | `CLUE` antes de revelar, o `REVEAL` después |
| `SUIT_EXHAUSTED` | Revelar un palo sin fichas boca abajo |
| `TILE_NOT_FACE_UP` | Pista con una ficha que no está boca arriba |
| `POSITION_OUT_OF_RANGE` | Comparar con una posición que no es de la 1 a la 5 |
| `INVALID_DECLARATION` | Cantar sin 5 números distintos del 1 al 60 en orden |
| `MUST_DECLARE` | Revelar o pedir pista cuando ya no queda ninguna (CA12) |

`REVEAL` o `CLUE` fuera de turno, o cualquier acción de quien ya está fuera: `NOT_YOUR_TURN`, como en todos los juegos.

### 3.7 La hoja de deducción (CA16)

En la mesa cada uno tacha en su hoja. En línea:

- Una cuadrícula con las 60 fichas del catálogo, agrupadas por palo.
- **Se tacha sola** lo que es público: los atriles de los demás y las fichas reveladas. El reglamento ya pide tacharlas, y hacerlo a mano no aporta nada.
- **Las deducciones las marca el jugador**: tachar, marcar como posible y apuntar sus cinco candidatos en orden. Es el juego en sí. Un ayudante que dedujera solo lo resolvería por él.
- Las marcas se guardan **en el navegador** (`localStorage`, por partida). No son parte del juego y el servidor no las necesita.

*Inconveniente:* en una partida por turnos, si el jugador cambia del móvil al ordenador, no ve sus marcas. Guardarlas en el servidor necesitaría una tabla y una ruta nuevas en la API; queda anotado para una versión futura si hace falta.

### 3.8 Tablero (CA17)

- **Arriba,** los atriles de los rivales, con sus números y debajo sus pistas.
- **En el centro,** las fichas boca arriba y el pozo, con un botón por palo que dice cuántas quedan.
- **Abajo,** el atril propio: cinco fichas de espaldas que muestran solo el palo, con sus pistas colocadas en los 6 huecos y las comparaciones al lado.
- **Siempre visible,** el botón "Cantar mis cinco", que abre los cinco huecos para escribir los números, en orden, con confirmación ("Solo tienes un intento").
- **Hoja de deducción** en un panel que se abre y se cierra; en el móvil, a pantalla completa.
- Colores de asiento con `seat-N` (Z7). Cada palo con su color y su figura, sobre fondo liso (CA3), en SVG propio; los botones de revelar y la hoja de deducción también los usan. Textos en `games/blind-five/texts.ts` y tablero en `GAME_UIS` con la clave `blind-five@1`.

### 3.9 Hacer trampa (CA18)

Este juego es muy frágil en línea: **cualquier rival conoce tus números.**

- Alguien con dos cuentas en la misma partida ve sus propios números desde la otra y gana seguro.
- Dos jugadores pueden contarse los números por otro medio.

La plataforma no lo puede impedir: es la naturaleza del juego. En la mesa pasa lo mismo, pero ahí todos se ven las caras. **Recomendación:** aceptarlo como riesgo conocido en la versión 1, porque hoy se juega entre conocidos, y decirlo en la descripción del juego. Si la plataforma se abre al público, habría que pensar en salas solo con invitación para este juego.

### 3.10 Pruebas

- **Motor:** reparto (una ficha de cada palo por asiento, atriles ordenados, sin repetidas), revelar, las dos pistas con resultado correcto, cantar bien y mal, quien falla se salta, el último gana, agotamiento (CA12), retiradas con 2, 3 y 4, y cada motivo de rechazo.
- **Vista:** ningún asiento en juego recibe sus números; la vista sin asiento no lleva ningún atril.
- **Comprobación común (Z3):** en `FIXTURES`, `candidateActions` devuelve revelar cada palo, pistas con varias fichas, una cantada mal escrita, y de vez en cuando una cantada correcta, que puede calcular del estado.
- **En navegador:** tres jugadores; uno canta fuera de turno, falla y la partida sigue; otro acierta y gana. En cada mensaje que recibe cada jugador, sus números no aparecen.

---

## 4. Plataforma

### CA19. Jugadas fuera de turno (T-25)

**Qué hay hoy.** Revisado en el código:

- El servidor **no** comprueba quién está activo antes del motor: pasa la jugada al motor y es el motor el que responde `NOT_YOUR_TURN` (`game-sessions.service.ts`, `applyPlayerAction`). Un motor podría aceptar ya una jugada de un asiento no activo.
- La versión de la jugada (`acceptsStateVersion`, `active-since.ts`) acepta siempre la versión actual. A un asiento no activo solo le vale la actual, que es lo correcto para cantar.
- El reloj solo descuenta a los asientos activos, así que cantar fuera de turno no gastaría reloj de nadie.
- **Lo que falta:** la página de la partida solo deja enviar jugadas cuando le toca a uno (`canPlay` en `pages/partidas/[matchId].vue`). Y el contrato dice que `activeSeats` son "los asientos que pueden jugar ahora", así que un motor que acepte otras jugadas se saldría de lo escrito.

| Opción | A favor | En contra |
|---|---|---|
| **Admitir jugadas fuera de turno: el motor puede aceptar jugadas de un asiento que sigue en juego aunque no esté activo; no gastan reloj** | El juego queda como el original. El servidor ya lo permite; solo cambian el contrato y una condición de la página. Sirve para otros juegos con "¡lo tengo!" | Cambia el significado documentado de `activeSeats` |
| Que todos los asientos estén siempre activos | Sin cambiar el contrato | Correrían todos los relojes a la vez, y los avisos de turno irían a todos. No sirve |
| Cantar solo en el turno propio | Sin cambios en la plataforma | Cambia el juego (CA9) |

**Recomendación:** la primera. En concreto:

- **Contrato del motor** (`contracts/03-game-engine.md` y el comentario de `GameStatus.activeSeats`): `activeSeats` son los asientos a los que les toca y cuyos relojes corren. Un motor puede aceptar además jugadas de otros asientos que sigan en juego, si sus reglas lo permiten; esas jugadas no gastan reloj y se envían sobre la versión actual. La forma de la interfaz no cambia.
- **Página de la partida:** envía la jugada que emita el tablero mientras la partida está en curso, el asiento no se ha retirado, hay conexión y no hay otra orden esperando. `canPlay` sigue significando "te toca", y el tablero recibe un dato nuevo, `canSend`, con esa otra condición. Los tableros que ya hay no cambian: solo emiten cuando `canPlay`.
- **Nada más cambia:** ni la API, ni los mensajes, ni el catálogo de errores, ni la base de datos. Una jugada fuera de turno sube la versión del estado, y el asiento al que le tocaba conserva la suya (X15 y X16), así que la jugada que estuviera enviando no se rechaza por eso.
- **Pruebas** contra PostgreSQL con un motor falso que acepta una jugada fuera de turno: se acepta, no descuenta reloj, no cambia quién está activo ni rechaza la jugada del que tenía el turno.

### CA20. Quien queda fuera por decisión del motor

Hasta ahora solo la plataforma saca a un asiento de una partida en marcha (T-24). Aquí también lo hace el motor, cuando alguien canta mal.

| Opción | A favor | En contra |
|---|---|---|
| **El motor lo lleva dentro. `retireSeat` sobre un asiento que ya está fuera no cambia nada y no emite eventos** | Sin cambios en la plataforma | La plataforma no sabe que está fuera: le sigue mostrando "Rendirse", puede marcarlo como abandono si cierra la página, y cuenta para su límite de partidas hasta que termine |
| Que `getStatus` diga qué asientos están fuera y la plataforma los trate como retirados | Lo trataría igual que a un retirado (DO19 a DO21) | Cambia la interfaz del motor. Solo lo necesita este juego |

**Recomendación:** la primera. Los efectos son menores y no cambian el resultado: el tablero ya le dice "Fallaste. La partida sigue sin ti.", y si se rinde o abandona después, pierde igual, porque ya había perdido. Queda anotada la segunda por si llega otro juego con eliminaciones.

### CA21. Entrega

Dos pull requests, como en ADR-019 y ADR-020:

1. **T-25**, con la enmienda del contrato, el cambio de la página y sus pruebas.
2. **Cinco a ciegas**: motor, tablero, hoja de deducción, migración de alta **inactiva** (versión con `is_current` a `false`) y pruebas, siguiendo `docs/guia-nuevo-juego.md`. Se activa desde la administración como Batalla naval y Dominó.

---

## 5. Cambios de contrato y de documentos (requieren autorización aparte)

| Documento | Cambio |
|---|---|
| `docs/adr/0019-batalla-naval-y-jugadas-simultaneas.md`, F9 | Enmienda de CA1, con nota y fecha |
| `contracts/03-game-engine.md` y `packages/game-engine/src/contract.ts` (comentario) | Significado de `activeSeats` y jugadas fuera de turno (CA19) |
| `contracts/02-realtime.md` (comprobación 7 y `activeSeats`) y `docs/03-dominio-datos.md` (`active_seats`) | Lo mismo, en el protocolo y el modelo de datos |
| `docs/guia-nuevo-juego.md` | Una línea sobre las jugadas fuera de turno y `canSend` en la sección del tablero |
| `planning/decisiones-y-pendientes.md` | Fila de este ADR; F9 enmendada |
| `planning/backlog-mvp.md` | Tareas de T-25 y del juego |
| `docs/adr/README.md` | ADR-022 en la lista |

---

## 6. Lo que confirmó quien tiene el juego

1. ~~¿Cantas fuera de tu turno?~~ **Respondido el 2026-11-20:** sí, se puede cantar fuera de turno. CA9 y T-25 se mantienen.
2. ~~¿Cuántas fichas tienen 1, 2 y 3 puntos?~~ **Respondido el 2026-11-20** con el patrón completo de colores y puntos (CA3).
3. ~~¿El reverso muestra los puntos?~~ **Respondido el 2026-11-20:** solo el color. Es lo que supone este ADR: el dueño ve el palo de sus fichas, no el número ni los puntos. El usuario pidió además una figura por palo, sobre fondo liso (CA3).
4. ~~¿El 16 es verde?~~ **Respondido el 2026-11-20:** sí.

Con esto no quedó ninguna pregunta sobre las reglas.

## 7. Aceptación

El 2026-11-20 quien decide aceptó CA1 a CA21 tal como se recomiendan, incluida la enmienda de F9 (CA1), y autorizó los cambios de contrato de la sección 5 y el código de las dos pull requests de CA21.

Después, el mismo 2026-11-20, quien decide propuso nombrar el juego original en la aplicación y pedir que se marcara "Yo tengo el juego de forma física" antes de jugar. Se valoró y se eligió **"Nombre propio y aviso neutro"**: la marca sigue fuera de la aplicación, y la descripción del catálogo y el pie del tablero dicen, sin la marca, *"Inspirado en un juego de mesa comercial. Si te gusta, apoya a sus autores comprando el original."* La marca, el autor y la editorial solo aparecen en la línea de origen del `README.md` del motor, como pide CA1. No se pide ninguna casilla: no se puede comprobar, y daría a entender un permiso que no existe.

## 8. Lo que resultó al construir

### T-25

- El servidor no tuvo que cambiar: ya pasaba al motor la jugada de cualquier participante, solo descuenta reloj a los asientos activos y a un asiento que no está activo solo le acepta la versión actual. Las pruebas contra PostgreSQL (`apps/backend/test/out-of-turn.test.ts`) lo fijan: la jugada fuera de turno se acepta, no gasta reloj ni cambia la fecha límite del asiento activo, no deja obsoleta la jugada que este tuviera en camino, se rechaza sobre una versión anterior, puede terminar la partida y un retirado ya no puede hacerla.
- El paquete del motor tiene un tercer motor de pruebas, `createOutOfTurnFakeEngine`, en el que cualquiera canta en cualquier momento y quien canta dos veces gana.
- La batería común (Z3) exigía `NOT_YOUR_TURN` a toda acción de un asiento no activo. Ahora los datos de prueba de un juego pueden declarar con `allowedOutOfTurn` cuáles admite fuera de turno; a esas no se les exige, y de vez en cuando la batería juega una desde un asiento que no está activo.
- En la página de la partida, `canSend` (en partida, sin retirarse, con conexión y sin otra orden esperando) es la condición para enviar, y `canPlay` es `canSend` más que le toque. Los tableros que ya había comprueban `canPlay` antes de emitir, para que nada cambie en ellos.

### El juego

- Motor `blind-five` 1.0.0 en `packages/game-engine/src/games/blind-five/`, con 38 pruebas propias y 21 partidas de la batería común (Z3), que declara `DECLARE` como jugada fuera de turno. El palo y los puntos salen del número (CA3): `S1` a `S5` en ciclo y 1, 2 o 3 puntos por bloques de cinco, con el 16 en el palo del 1. Cada palo se baraja aparte con el generador con semilla.
- El motor también gestiona por sí mismo a quien falla al cantar (CA20): queda fuera, ve sus números y, si tenía el turno, pasa al siguiente. Si solo queda uno en juego, gana.
- Ninguna vista lleva los números de un asiento a su dueño mientras sigue en juego, y la vista de quien solo mira no lleva ninguno hasta el final (CA15). La prueba en navegador lo comprueba también en lo que llega por tiempo real.
- Tablero en `apps/frontend/app/games/blind-five/`: cada palo con su color de la paleta Okabe-Ito y su figura (círculo, triángulo, cuadrado, rombo y estrella), sobre fondo liso, también en modo oscuro. La hoja de deducción tacha sola lo que está a la vista y guarda las marcas del jugador en su navegador (CA16); si marca cinco como posibles, el formulario de cantar empieza con ellos.
- El tablero no recibe el identificador de la partida, así que las marcas se guardan por las cinco fichas que empezaron boca arriba y el asiento.
- Alta por migración (`20261120190704_alta_cinco_a_ciegas`) con el juego y su versión inactivos (ADR-018, Z8). Se activa desde administración: la versión, que sea la vigente y el juego.

## Fuentes

- Reglamento oficial, edición de EE. UU.: https://www.blueorangegames.com/webroot/img/games/rules/GOT_FIVE_RULES_USA.pdf
- Reglamento oficial, edición de Reino Unido: https://blueorangegames.eu/wp-content/uploads/2026/02/GOT-FIVE_RULES-UK.pdf
- Reglamento en RulesPal: https://rulespal.com/got-five/rulebook
- Reseña en Meeple Mountain: https://www.meeplemountain.com/reviews/got-five/
