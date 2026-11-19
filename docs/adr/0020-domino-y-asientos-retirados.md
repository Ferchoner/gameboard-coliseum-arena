# ADR-020: Dominó y asientos retirados con más de dos jugadores

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-19 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Parte de** | La [propuesta de los próximos juegos](../../planning/propuesta-de-juegos.md) y [ADR-019](0019-batalla-naval-y-jugadas-simultaneas.md), sección 0: F6, F7 y F8 ya están aceptadas |
| **Depende de** | Contrato del motor (M7, M8, M11), regla 7.18, 7.30, 7.32 y 7.13 (ADR-009), ADR-015 (W6), ADR-018 (Z1, Z2), análisis del 2026-11-19 (GO-7, T-24) |
| **Revisado sobre** | `main` en `de875ee` |

Las decisiones de este ADR se llaman **DO1 a DO22**. Las letras que quedaban libres en el repositorio se confunden con números (I, O), y G ya la usa la propuesta del Hito 7.

---

## 1. Contexto

El Dominó es el segundo juego elegido (F1). Ya está decidido:

- **F6:** la partida se juega hasta **100 puntos**, en tiempo real y por turnos.
- **F7:** de **2 a 4 jugadores**; con 4, en parejas.
- **F8 (cierra W6):** con más de dos jugadores, quien pierde por abandono **se queda en la sala como retirado** hasta que la partida termina, y deja de contar para su límite de partidas (7.30).
- **F3 y F9:** sin opciones en la versión 1, y la regla de derechos común.

El Dominó es el primer juego que pone a prueba tres cosas a la vez: **azar** con la semilla que la plataforma ya guarda (Z1), **mano oculta** y **más de dos jugadores**. Las dos primeras no necesitan cambios en la plataforma. La tercera, sí.

### Lo que falla hoy con tres o más jugadores (T-24)

Revisado en el código actual:

1. **La plataforma no recuerda quién se retiró.** El conjunto de retirados solo existe dentro de una llamada (`game-sessions.service.ts:837`). Si en una partida de 3 C se rinde y la partida sigue, C puede rendirse otra vez, o perder después por abandono. Las dos cosas llaman de nuevo a `retireSeat` sobre un asiento ya retirado, y el contrato del motor lo prohíbe (M11).
2. **El retirado cuenta como rival conectado.** Al decidir si un ausente pierde por abandono, el servidor busca cualquier otro jugador conectado (`:534`), y el retirado vale.
3. **Quien abandona y no termina la partida no sale de la sala.** La salida de la regla 7.32 se calcula solo en la retirada que termina la partida (`:839` y `:861`). Si C abandona y la partida sigue, al terminar ya nadie se acuerda de que C abandonó.
4. **El retirado sigue contando para su límite** (7.30), porque el límite cuenta las pertenencias a salas no cerradas (`rooms.service.ts:472`).
5. **Nadie ve que un jugador se retiró.** La vista de la partida (`MatchPlayer`) no lo dice.

La retirada sí se guarda ya en `match_retirements`, con su motivo y su versión (Z2). Lo que falta es usarla.

## 2. Resumen

| ID | Asunto | Recomendación |
|---|---|---|
| **El juego** | | |
| DO1 | Nombre e identificador | "Dominó", `dominoes`, versión `1.0.0`, alta inactiva |
| DO2 | Fichas y reparto | Doble seis, 28 fichas. Siete a cada jugador. El pozo: 14 fichas con 2 jugadores, 7 con 3 y ninguna con 4 |
| DO3 | Parejas | Con 4: asientos 0 y 2 contra 1 y 3, frente a frente. Los asientos los sortea la plataforma; en la revancha rotan y las parejas siguen juntas |
| DO4 | Orden de juego | Por número de asiento: 0, 1, 2, 3 y vuelta a empezar |
| DO5 | Quién sale | Primera mano: quien tiene el doble más alto, y sale con él. Si nadie tiene un doble (solo posible con 2 o 3), la ficha con más puntos. Manos siguientes: quien ganó la anterior, con la ficha que quiera. Si la anterior quedó empatada, vuelve a salir quien salió en ella |
| DO6 | Jugar | Una ficha que case con uno de los dos extremos. Si se puede jugar, hay que jugar. Sin "cuatro lados": la línea solo tiene dos extremos |
| DO7 | Robar y pasar | **Automáticos.** Si a un jugador le toca y no puede jugar, el motor roba por él hasta que puede o se acaba el pozo; si sigue sin poder, pasa. Los demás ven cuántas robó y que pasó, nunca cuáles |
| DO8 | Fin de la mano | Dominó: alguien se queda sin fichas. Tranque: nadie puede jugar y el pozo está vacío; gana quien (o la pareja que) suma menos puntos en la mano. Empate en el tranque: nadie anota |
| DO9 | Puntos | Quien gana la mano anota los puntos que les quedan **a sus rivales** (con 4, a los dos de la otra pareja). En el tranque, igual |
| DO10 | Fin de la partida | Gana el primero (o la primera pareja) que llega a **100 puntos** al acabar una mano (F6). No hay empate posible: en cada mano anota uno solo |
| DO11 | Retiradas | Con 2: pierde quien se retira (7.18). Con 4: pierde su pareja y la partida termina. Con 3: sus fichas salen del juego sin mostrarse, se salta su turno y siguen los otros dos; si queda uno, gana |
| DO12 | Tiempos y jugadores | De 2 a 4. Tiempo real: 10, 15 o 20 minutos por jugador. Por turnos: 12, 24 o 36 horas |
| DO13 | Acción y eventos | Una sola acción: jugar una ficha en un extremo. Eventos públicos de ficha jugada, robo, pase, fin de mano y mano nueva |
| DO14 | Vista | La mano propia, cuántas fichas tiene cada uno, la línea, el pozo, los puntos y el resumen de la última mano |
| DO15 | Azar | Un generador con semilla dentro del estado del juego. Va en el paquete del motor para que lo usen los juegos siguientes |
| DO16 | Tablero | La mano abajo, la línea que se parte en varias filas, y un botón por extremo cuando la ficha cabe en los dos |
| DO17 | Derechos | Juego tradicional; nombre genérico; fichas dibujadas en CSS o SVG propios (F9) |
| **Asientos retirados (T-24)** | | |
| DO18 | Dónde se guarda quién se retiró | Una columna `game_sessions.retired_seats`, con la sesión, como `active_since` |
| DO19 | Lo que ya no le pasa a un retirado | No puede volver a rendirse (la orden repetida devuelve la partida como está), no pierde por abandono, no vale como rival conectado y no recibe aviso de turno |
| DO20 | Sala y límite (F8 y W6) | Se queda en la sala, puede seguir viendo la partida y no cuenta para su límite. **Al terminar la partida sale de la sala**, como en la regla 7.32, sea cual sea el motivo de su retirada. Si era el anfitrión, la sala se cierra |
| DO21 | Que se vea | `MatchPlayer` gana el campo `retired`. El retirado ve "Te retiraste. La partida sigue sin ti." y no tiene botón de rendirse; los demás ven quién se retiró |
| DO22 | Empezar sin la sala llena | No cambia: la partida empieza con la sala llena. Quien crea la sala elige 2, 3 o 4 plazas |
| **Entrega** | | |
| — | Dos PR | Primero T-24 (DO18 a DO22), con su enmienda del contrato. Después el Dominó (DO1 a DO17), inactivo |

## 3. El juego

### 3.1 Reglas (DO2 a DO10)

**Fichas.** Las 28 del doble seis, de [0|0] a [6|6]. Cada ficha vale la suma de sus dos lados.

**Reparto.** Al empezar cada mano se barajan las 28 y se reparten 7 a cada jugador. Las que sobran forman el pozo: 14 con 2 jugadores, 7 con 3, ninguna con 4.

**Parejas (DO3).** Con 4 jugadores, los asientos 0 y 2 son una pareja y los asientos 1 y 3, la otra. Se sientan frente a frente y juegan alternados. La plataforma sortea los asientos en la primera partida y en la revancha los rota uno: las parejas se mantienen y cambia quién empieza (K11). Elegir compañero necesitaría algo nuevo en las salas, y queda fuera.

**Salida (DO5).**

- En la primera mano sale quien tiene el doble más alto, y tiene que salir con él. Con 4 jugadores es siempre el [6|6], porque se reparten todas. Con 2 o 3 puede que nadie tenga un doble: entonces sale quien tiene la ficha con más puntos, y con esa ficha.
- En las manos siguientes sale quien ganó la anterior, con la ficha que quiera. Con parejas, sale el jugador que ganó la mano, no su compañero.
- Si la mano anterior quedó empatada en un tranque, vuelve a salir quien salió en ella.

Es la costumbre más extendida de "sale el que ganó". La alternativa, que salga siempre el siguiente asiento, reparte mejor la salida pero es menos conocida.

**Turno (DO4).** Juegan por orden de asiento. Un asiento retirado (con 3) se salta.

**Jugar (DO6).** En su turno, el jugador pone una ficha que case con uno de los dos extremos de la línea. Si la ficha cabe en los dos, elige el extremo. Si puede jugar, tiene que hacerlo. Los dobles se dibujan atravesados, pero no abren más extremos: no hay "cuatro lados" en la versión 1.

**Robar y pasar (DO7).** Si a un jugador le toca y no tiene ninguna ficha que case, el motor roba por él del pozo, una a una, hasta que saca una que case o se acaba el pozo. Si al final sigue sin poder jugar, pasa, y le toca al siguiente. Nada de esto necesita una acción del jugador:

- No hay nada que decidir: robar y pasar son obligados.
- No gasta su reloj en pulsar botones.
- Con 4 no hay pozo, así que solo hay pases.

Los demás ven cuántas fichas robó y que pasó, nunca cuáles. La alternativa son botones de "Robar" y "Pasar". Es más fiel a la mesa, pero son clics que no deciden nada y cuestan tiempo de reloj.

**Fin de la mano (DO8).**

- **Dominó:** un jugador pone su última ficha. Gana la mano él o, con 4, su pareja.
- **Tranque:** nadie puede jugar y el pozo está vacío. Gana la mano quien suma menos puntos en las fichas que le quedan. Con 4 se suman las de cada pareja. Si hay empate en lo más bajo, la mano no la gana nadie y nadie anota.

**Puntos (DO9).** Quien gana la mano anota la suma de las fichas que les quedan a sus rivales: a todos los demás con 2 o 3, y a los dos de la otra pareja con 4. En el tranque se anota lo mismo. Un retirado no cuenta como rival: sus fichas ya no están en juego.

Es la cuenta más común en México con parejas. La alternativa, que la pareja ganadora anote también las fichas de su compañero, da manos más altas y partidas más cortas.

**Fin de la partida (DO10).** Al terminar cada mano, si alguien (o una pareja) llega a 100 puntos o más, gana la partida. Como en cada mano anota uno solo, no puede haber empate. Si no, empieza otra mano en la misma transición. El resultado por asiento lleva sus puntos (`SeatResult.score`). Con parejas, los dos de la pareja tienen los mismos puntos y el mismo resultado.

### 3.2 Retiradas (DO11)

El motor decide qué pasa al retirar un asiento (M11):

- **Con 2:** termina la partida. Pierde quien se retira y gana el otro (7.18).
- **Con 4, en parejas:** termina la partida. Pierden los dos de la pareja del retirado y ganan los otros dos. Así nunca queda un asiento retirado en una partida que sigue.
- **Con 3:** sus fichas salen del juego sin mostrarse, sus puntos dejan de contar y su turno se salta. La mano sigue con los otros dos, y el tranque y los puntos solo miran a quienes siguen. Si solo queda uno, gana la partida. Al terminar, el retirado pierde.

Solo el caso de 3 deja un asiento retirado en una partida que sigue. Es el que necesita T-24.

### 3.3 Tiempos y jugadores (DO12)

- **Jugadores:** `minPlayers` 2 y `maxPlayers` 4. Quien crea la sala elige 2, 3 o 4 plazas, como hoy.
- **Tiempo real:** 10, 15 o 20 minutos por jugador, para toda la partida.
  - Una partida a 100 puntos suele durar de 3 a 6 manos, y cada jugador pone unas 7 fichas por mano.
  - A 10 segundos por ficha, son de 4 a 7 minutos de reloj.
  - Con 2 jugadores y mucho robo, algo más. Robar y pasar no gastan reloj (DO7).
- **Por turnos:** 12, 24 o 36 horas por jugador (N1).
  - Una partida a 100 puntos son unas 30 o 40 jugadas por jugador.
  - Con 36 horas, toca a menos de una hora de media por jugada.
  - Es justo, pero se nota: por turnos, una partida de dominó dura días.

### 3.4 Acción, eventos y vista (DO13, DO14)

**Acción:**

```ts
type DominoesAction = {
  type: 'PLAY';
  tile: [number, number];       // los dos lados, en cualquier orden
  end?: 'LEFT' | 'RIGHT';       // obligatorio solo si la ficha cabe en los dos extremos
};
```

**Eventos**, todos públicos (M8):

| Evento | Contenido |
|---|---|
| `TILE_PLAYED` | Asiento, ficha y extremo |
| `TILES_DRAWN` | Asiento y cuántas robó. Nunca cuáles |
| `PASSED` | Asiento |
| `HAND_ENDED` | Cómo terminó (dominó, tranque o tranque empatado), quién ganó, cuántos puntos anotó y las fichas que le quedaban a cada uno, que al terminar la mano pasan a ser públicas |
| `HAND_STARTED` | Número de mano y quién sale |
| `SEAT_RETIRED` | Asiento retirado, con 3 jugadores |

**Vista** de cada asiento:

- Su mano, con las fichas que puede jugar y en qué extremos. Es una ayuda para el tablero: quien decide si una jugada vale es el servidor (K7).
- Cuántas fichas tiene cada uno de los demás.
- La línea, de izquierda a derecha, con la orientación de cada ficha y los dos extremos.
- Cuántas fichas quedan en el pozo.
- Los puntos de cada jugador o pareja, el número de mano y a qué se juega (100).
- Las parejas, si las hay.
- Los asientos retirados.
- El resumen de la última mano terminada, con las fichas que mostró cada uno, para que el tablero pueda enseñarlo antes de seguir.

La vista sin asiento (`null`) es la misma sin ninguna mano.

**Motivos de rechazo:**

| Motivo | Cuándo |
|---|---|
| `INVALID_ACTION_SHAPE` | La acción no tiene la forma de arriba |
| `TILE_NOT_IN_HAND` | La ficha no es suya |
| `TILE_DOES_NOT_MATCH` | La ficha no casa con el extremo elegido, o con ninguno |
| `END_REQUIRED` | La ficha cabe en los dos extremos y no dijo cuál |
| `MUST_OPEN_WITH` | En la primera mano, la salida no es la ficha obligada |

### 3.5 Azar (DO15)

El motor no puede usar `Math.random` (M7). Recibe la semilla de la plataforma al crear la partida, que ya se guarda con ella (Z1). Con esa semilla arranca un generador pequeño y conocido, cuyo estado (cuatro números) va dentro del estado del juego. Cada mano baraja con él. Así cada transición sigue siendo determinista, y una partida se puede reproducir entera desde su semilla y sus jugadas.

El generador va en el paquete del motor como pieza común (`random.ts`), con sus propias pruebas, para que lo usen los juegos siguientes. La batería común (Z3) ya juega partidas con semillas distintas.

### 3.6 Tablero (DO16)

- **Arriba,** los rivales con cuántas fichas tienen, sus puntos y quién tiene el turno. Con 4, el compañero enfrente y marcado como tal.
- **En el centro,** la línea. Se parte en varias filas cuando no cabe a lo ancho, en lugar de girar en serpiente. Es menos vistoso, pero se lee igual en un móvil de 390 px, que es lo que más cuesta en este juego.
- **Abajo,** la mano propia como botones. Las fichas que no se pueden jugar salen apagadas. Al pulsar una que cabe en un solo extremo, se juega. Si cabe en los dos, aparecen dos botones: "A la izquierda" y "A la derecha".
- **Al terminar una mano,** un resumen: quién ganó, cuántos puntos anotó y las fichas que le quedaban a cada uno. Se queda visible mientras empieza la siguiente.
- **Fichas** dibujadas con puntos en CSS. No hacen falta imágenes.

### 3.7 Derechos (DO17)

El dominó es un juego tradicional, de dominio público. "Dominó" es un nombre genérico y `dominoes`, su identificador en inglés. Las fichas se dibujan en CSS propio. Las reglas las escribimos nosotros en el `README.md` del motor, con una línea sobre su origen (F9). No es asesoría legal.

### 3.8 Pruebas

- **Motor:**
  - Las reglas de arriba, una por una.
  - Los repartos con semillas fijas.
  - Que la vista de un asiento no lleve nunca las fichas de otro, ni las del pozo.
  - Las retiradas con 2, 3 y 4.
  - La batería común (Z3) con partidas de 2, 3 y 4 jugadores.
- **Frontend:** registro, textos y tablero.
- **En el navegador:** una partida de 3 en tres navegadores. Ninguno recibe las fichas de otro, ni por REST ni por tiempo real. Uno se rinde y los otros dos terminan. Además, que el tablero cabe en un móvil de 390 px.

## 4. Asientos retirados con más de dos jugadores (T-24)

### DO18. Dónde se guarda quién se retiró

Una columna nueva, `game_sessions.retired_seats` (`smallint[]`, vacía al empezar), que se actualiza en la misma transacción que la retirada. La sesión sigue siendo el único sitio que hace falta leer para atender una orden, como con `active_since` (ADR-019).

La alternativa es leerla de `match_retirements`, que ya tiene las retiradas con su motivo. No necesita columna nueva, pero obliga a otra consulta en cada orden y mezcla el registro con el estado.

La migración rellena las sesiones existentes desde `match_retirements`. Hoy siempre está vacía para las partidas en curso, porque con dos jugadores toda retirada termina la partida.

### DO19. Lo que ya no le pasa a un retirado

Con `retired_seats`:

- **Rendirse otra vez:** la orden de un retirado no retira nada y devuelve la partida como está, igual que una orden repetida. No es un error: el jugador ya está fuera.
- **Jugar:** no cambia. Un retirado nunca está entre los activos, así que su jugada ya se rechaza con `NOT_YOUR_TURN`.
- **Abandono:** al desconectarse, no empieza a contar su plazo en esa partida. Y al decidir si un ausente pierde, un retirado conectado no cuenta como rival conectado.
- **Reloj:** no cambia. Su reloj se para al retirarse porque no vuelve a estar activo.
- **Aviso de turno:** no cambia. Solo se avisa a los asientos activos.

### DO20. Sala y límite de partidas (F8 y W6)

F8 decidió que quien pierde por abandono se queda en la sala como retirado hasta que la partida termina, y no cuenta para su límite. Este ADR lo concreta, y lo extiende a toda retirada en una partida que sigue (abandono, rendición o tiempo):

- **Mientras la partida sigue,** el retirado sigue siendo miembro de la sala y puede abrir la partida para verla.
  - Esa pertenencia **no cuenta para su límite** (7.30). Puede entrar en otra sala y jugar otra partida.
  - Sigue sin poder "salir de la sala" mientras hay partida (7.13). No le hace falta, porque ya no cuenta.
- **Al terminar la partida, sale de la sala**, en la misma transacción, como en la regla 7.32. Si era el anfitrión, la sala se cierra (7.12).
  - Sin esto, al volver la sala a la espera tendría dos salas en tiempo real a la vez y se saltaría su límite.
  - La revancha queda para quienes terminaron la partida. El retirado puede volver a entrar si hay plaza.
- **Para saber quién sale al terminar,** se leen las retiradas guardadas de la partida (Z2), y no solo la última. Hoy solo sale quien abandona en la retirada que termina la partida (problema 3 de la sección 1).

Con dos jugadores no cambia nada: toda retirada termina la partida, y sale de la sala solo quien perdió por abandono, como hasta ahora.

La alternativa es que el retirado se quede en la sala para la revancha y siga contando para su límite. Es más sencilla, pero contradice F8.

Se añade una regla al dominio:

> **7.33.** En una partida que sigue sin él, el asiento retirado sigue en la sala hasta que la partida termina, sin contar para su límite de partidas (7.30). Al terminar, sale de la sala, como en la regla 7.32. *(ADR-020, DO20; cierra W6 de ADR-015 con F8.)*

### DO21. Que se vea

- **Contrato:** el esquema `MatchPlayer` (API REST y `MATCH_UPDATED`) gana un campo obligatorio, `retired: boolean`. Es la única enmienda del contrato de este ADR.
  - Es un campo nuevo en una respuesta, así que no rompe a quien no lo lee.
  - El esquema no admite campos de más (`additionalProperties: false`), y por eso hay que enmendarlo y versionar el cambio en el registro del contrato.
- **Frontend:**
  - Quien se retiró ve "Te retiraste. La partida sigue sin ti." y no tiene botón de rendirse. Sigue viendo la partida hasta el final.
  - Los demás ven "Se retiró" junto al jugador, con su reloj parado.

### DO22. Empezar sin la sala llena

No cambia: una partida empieza cuando la sala está llena (`rooms.service.ts:495`). Para el Dominó basta con que quien crea la sala elija 2, 3 o 4 plazas. Empezar sin llenar necesitaría decidir quién da la señal y qué pasa con las parejas, y ningún juego lo pide todavía.

## 5. Cambios de contrato y de documentos

- `contracts/01-rest-api.yaml`: `MatchPlayer.retired` (DO21). La misma forma llega por `MATCH_UPDATED`, así que `contracts/02-realtime.md` solo la menciona.
- `contracts/03-game-engine.md`: precisar en `retireSeat` que la plataforma garantiza que no lo llama dos veces sobre el mismo asiento (DO18 y DO19).
- `docs/adr/0009`: regla 7.33 (DO20).
- `docs/adr/0015`: W6 cerrada con F8 y DO20.
- `docs/03-dominio-datos.md`: columna `retired_seats`.
- `planning/backlog-mvp.md`: T-24 y Dominó.

## 6. Entrega

Dos PR, en este orden:

1. **T-24 (DO18 a DO22).** Contiene:
   - La columna y su migración.
   - Los filtros de rendición, abandono y límite.
   - La salida de la sala al terminar.
   - El campo `retired`, con su enmienda del contrato.
   - El aviso en el frontend.
   - Las pruebas con el motor de pruebas de 3 jugadores.

   Un día o día y medio.
2. **Dominó (DO1 a DO17).** Contiene:
   - El motor y el generador con semilla.
   - El tablero.
   - El alta inactiva.
   - La prueba en navegador con 3 jugadores.

   De cuatro a cinco días. La línea de fichas en el móvil es lo que más cuesta.

Como Batalla naval, el juego entra **inactivo** y se activa desde la administración, con el orden de la guía.

## 7. Aceptación

El 2026-11-19 quien decide aceptó DO1 a DO22 tal como se recomiendan aquí y autorizó la enmienda del contrato de la sección 5 y el código de las dos PR de la sección 6.
