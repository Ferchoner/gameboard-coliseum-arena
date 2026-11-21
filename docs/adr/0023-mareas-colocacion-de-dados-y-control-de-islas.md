# ADR-023: Mareas, colocación de dados y control de islas

| Campo | Valor |
|---|---|
| **Estado** | **Aceptada** el 2026-11-21 por quien decide, con todas las recomendaciones (sección 9). Código autorizado el mismo día; lo que resultó al construir está en la sección 10 |
| **Fecha** | 2026-11-20; revisado el 2026-11-21 con las decisiones de quien decide |
| **Decide** | Fernando Hernandez Argueta |
| **Parte de** | La petición del 2026-11-20 de revisar otro juego comercial ya existente, *Brew*, para llevarlo a la plataforma |
| **Depende de** | Contrato del motor (M7, M8, M10, M11), regla 7.2 (ADR-009), ADR-018 (Z1 a Z8), ADR-019 (F9 enmendada, X15, X16), ADR-020 (DO18 a DO21), ADR-022 (CA1, CA19, aviso neutro), `docs/guia-nuevo-juego.md` |
| **Anexo** | [Catálogo de Mareas](0023-anexo-catalogo-mareas.md): dados, puerto, islas, aves, encargos y cofradías |
| **Revisado sobre** | `main` en `8299e31` (fusión de la PR #20) |

Las decisiones se llaman **MA1 a MA20** (de "Mareas"). Todas quedaron aceptadas el 2026-11-21 (sección 9). Las dudas que quedan sobre las reglas están en la **sección 8**.

**Historia de este borrador.** La primera versión (2026-11-20) proponía el tema Mareas. Quien decide eligió después mantener el tema del original con nombres propios ("Caldero del bosque", decisiones CB). Al ofrecer pasar todas las cartas de su ejemplar se vio que, con el mismo tema, el mismo tablero y las mismas cartas, el resultado sería una copia del original con otros nombres, y eso no se construye. El 2026-11-21 quien decide eligió volver a Mareas: **las mismas reglas y mecánicas, con tema, cartas y personajes propios**.

---

## 0. Qué juego es

*Brew*, de **Stevo Torres**, publicado por **Pandasaurus Games** (Austin, EE. UU.). Arte de Jake Morrison y Andrew Thompson. De 2 a 4 jugadores, desde 10 años, entre 45 y 90 minutos. El reglamento lleva fecha de 2021. **Quien decide confirmó el 2026-11-21 que es este juego.**

Es un juego de **colocación de dados** (cada dado es un trabajador, y la cara que salió decide dónde puede ir) combinado con **control de zonas**: al final de cada ronda, quien tiene mayoría de dados en un bosque se lo queda. Lo distintivo, según las reseñas, son los **dados de elemento neutrales**: cualquiera los coloca, no son de nadie y cuentan *en contra* de quien lidera el bosque.

**Fuentes.** El reglamento oficial en PDF, dos transcripciones y cuatro reseñas (lista al final). Las reglas generales se leen bien; las cartas concretas no se leen en ninguna fuente, y no hacen falta: Mareas tiene las suyas.

La sección 1 describe **el original**, con sus nombres. La sección 4 dice cómo se llama cada cosa en Mareas.

---

## 1. Las reglas del original, con detalle

Resumen con nuestras palabras. Lo que es deducción mía o falta en las fuentes va marcado.

### 1.1 Material

| Pieza | Cantidad |
|---|---|
| Tablero de aldea, de dos caras (día y noche) | 1 |
| Tableros de personaje, de dos caras (con poder y sin poder) | 4 |
| Dados de forraje, del color de cada jugador. Caras con tres símbolos: hoja, piedra y rama | 16 (4 por jugador) |
| Dados de elemento, blancos. Caras con tres símbolos: agua, viento y fuego | 8 (2 por jugador) |
| Cartas de bosque. Cada una tiene casillas, una o dos estaciones, sus puntos y una marca de número de jugadores | 20 |
| Cartas de criatura, en cuatro montones por estación (primavera, verano, otoño, invierno) | 36 |
| Cartas de poción, con coste en ingredientes, puntos y un poder | 32 |
| Fichas de ingrediente: hierba, seta, cristal y baya energética (comodín) | 96 (24 de cada) |
| Fichas de puntos (de 1 y de 3), fichas de quemado, marcador de jugador inicial, cartas de ayuda | 38, 10, 1, 4 |

Las fichas de ingrediente y de puntos se consideran ilimitadas. *No está en las fuentes:* cuántas caras de cada símbolo tiene un dado (supongo dos de cada), cuántas casillas tiene un bosque, cuántas criaturas hay por estación (supongo nueve) y cuántos bosques lleva cada marca de jugadores.

### 1.2 Preparación

1. La aldea en el centro, por el lado de día.
2. Se quitan los bosques cuya marca no corresponde al número de jugadores, se barajan y se sacan boca arriba: **3 bosques con 2 jugadores, 4 con 3 y 5 con 4.**
3. Se barajan las pociones y se ponen 4 boca arriba: es el mercado.
4. Las criaturas, en cuatro montones por estación, boca arriba: siempre se ve la de encima.
5. Cada jugador recibe su tablero de personaje, 4 dados de forraje de su color, 2 dados de elemento, 1 baya y una carta de ayuda. Se decide entre todos si se juega con los poderes de personaje; el reglamento aconseja que no en la primera partida.
6. Empieza quien preparó té o café más recientemente.

### 1.3 Ronda y turno

Se juegan **4 rondas**. Al empezar cada una, **todos tiran sus 6 dados**, que quedan fijos toda la ronda salvo que un poder los cambie.

Por turnos, en el sentido de las agujas del reloj, cada jugador hace, **en el orden que quiera**:

- **Colocar un dado** de su reserva (obligatorio).
- **Preparar una poción** como mucho (opcional).
- **Beber una poción** como mucho (opcional).

Quien no tiene dados se salta el turno y no hace nada más esa ronda: sin dado que colocar no puede preparar ni beber. La ronda acaba cuando nadie tiene dados. Hay poderes que devuelven un dado a la reserva, así que se pueden jugar más de 6 turnos.

### 1.4 Dónde va cada dado

- Un **dado de forraje** va a una casilla de bosque con su mismo símbolo, o a las dos casillas de "cualquier dado" de la aldea.
- Un **dado de elemento** va a cualquier casilla de bosque, sea cual sea su símbolo, o a la casilla de la aldea de su mismo elemento.
- Una casilla con un dado queda ocupada, salvo los poderes que permiten apilar. Las dos casillas de "cualquier dado" de la aldea nunca se ocupan. Las de elemento de la aldea admiten un dado por ronda.
- **Forzar:** se puede poner un dado de forraje en una casilla de otro símbolo pagando el ingrediente de esa casilla (o una baya). Para una casilla de criatura solo vale la baya. Al forzar no se recoge ni se entrena, pero cuenta como colocación para los poderes.

### 1.5 Qué da cada casilla

- **Casilla de ingrediente** (hierba, seta o cristal): se recoge 1 de ese ingrediente.
- **Casilla de criatura:** se entrena una de las cuatro criaturas visibles.
- **Aldea, lado de día** (según una transcripción): las dos de "cualquier dado" dan 1 ingrediente a elegir (no baya) y entrenar una criatura; la de **agua** da 1 de cada ingrediente; la de **fuego** quita todos los dados de elemento de todos los bosques; la de **viento** da 1 seta y deja reservar una poción. El texto del PDF pone "1 de cada ingrediente" en una casilla de "cualquier dado": las fuentes no coinciden (sección 8, C4).
- **Aldea, lado de noche:** la de **fuego** quema todas las casillas vacías de un bosque. Además se leen, sin saber en qué casilla: 1 ingrediente a elegir, revelar y reservar una poción, cambiar 1 ingrediente por otro hasta 3 veces, y 1 ingrediente y entrenar una criatura (C4). La aldea se voltea al acabar cada ronda.

### 1.6 Poderes de los dados de elemento

Solo en los bosques, nunca en la aldea:

- **Agua:** al recoger, 2 más de ese ingrediente (3 en total).
- **Fuego:** se puede poner encima de cualquier dado ya colocado. Se recoge o entrena como si la casilla estuviera libre. El dado tapado deja de contar para el control (pero se puede mover, cambiar o devolver).
- **Viento:** se puede poner sobre una casilla donde hay un dado de forraje propio, que vuelve a la reserva (un turno más esa ronda). Luego se recoge o entrena con normalidad.

### 1.7 Control de los bosques

Al final de la ronda, un jugador **controla** un bosque si cumple las dos condiciones:

1. Tiene allí **más dados de forraje que cada uno de los demás** por separado.
2. Tiene allí **más dados de forraje que dados de elemento hay en total**, incluidos los que puso él.

Solo cuenta el dado de arriba de cada pila. Un empate en cualquiera de las dos condiciones deja el bosque sin dueño. Quien lo controla **lo reclama** (lo pone junto a su tablero y puntúa al final). Los no reclamados se descartan. La ronda siguiente saca una fila nueva.

**Quemar** una casilla vacía la inutiliza: nadie puede poner allí un dado. Las casillas quemadas cuentan como vacías y las fichas no cuentan contra el control. El reglamento dice que la casilla "deja de existir"; quien decide fijó que dure una ronda (B2).

### 1.8 Criaturas

- Al entrenar una, se pone junto al tablero por el lado "entrenada": su poder se puede usar. **Máximo 3 entrenadas.** Al entrenar la cuarta hay que liberar una (puede ser la recién llegada).
- Una criatura **liberada** pierde su poder, no vuelve atrás y sigue puntuando. En cualquier momento se puede mover a un bosque reclamado **de su estación** que no tenga ya criatura (uno por bosque; los de dos estaciones admiten las dos).
- Al final: **3 puntos** por criatura en un bosque y **1** por cada otra. Antes de contar se liberan todas.
- **Tipos de poder** (por estación, tal como se leen en la referencia):
  - *Verano:* quemar una casilla vacía al colocar en un bosque de otoño o en la aldea; cambiar cualquier dado de elemento propio a viento; una casilla extra donde un dado de elemento mueve un dado de forraje colocado.
  - *Primavera:* bayas al final de ronda por cada criatura de verano entrenada; una baya en vez de entrenar; una baya la primera vez que quemas en tu turno; cambiar una seta recogida por una baya; una casilla extra donde un dado de elemento da 2 bayas.
  - *Invierno:* 2 puntos al reclamar un bosque de otoño; 1 punto al preparar una poción; 1 punto al entrenar; al final de ronda, bayas por puntos (1 por 2, 2 por 5); al final de ronda, ingredientes iguales por puntos (2 por 2, 3 por 5).
  - *Otoño:* +1 al recoger en un bosque de verano; +1 ingrediente a elegir al colocar en la aldea; una casilla extra donde un dado de forraje da 3 hierbas; una casilla extra donde un dado de elemento da 1 de cada.

### 1.9 Pociones

- **Preparar:** se paga el coste (la baya vale por cualquier ingrediente), se devuelve al suministro y la poción pasa a la mano. Se repone el mercado.
- **Reservar** (desde ciertas casillas de la aldea): se revela la carta de arriba del mazo y se reserva esa o una del mercado (la revelada ocupa su hueco). Solo su dueño puede prepararla, al mismo coste. Reservada y sin preparar no puntúa ni se puede beber.
- **Beber:** se revela de la mano, se aplica su poder y se guarda boca abajo. Cada poción se bebe una vez. **Puntúa igual en la mano que bebida.**
- **Mano oculta**, sin límite. (Una reseña dice que no hay información oculta: la transcripción manda.)
- Si el mazo se acaba, todos devuelven sus pociones bebidas, cogen fichas por sus puntos y se barajan como mazo nuevo.
- **Siete poderes:** *cambiar* la cara de un dado de la reserva; *relanzar* los dados que quieras de la reserva; *colocar* un dado más (un turno menos); *mover* un dado de forraje colocado a otra casilla vacía (sin recoger); *intercambiar* dos dados de forraje colocados del mismo símbolo; *quitar* un dado colocado hasta la ronda siguiente; *devolver* un dado de forraje propio a la reserva (un turno más). Mover, intercambiar y quitar valen sobre los dados de cualquiera.

### 1.10 Fin de ronda

En este orden: reclamar los bosques controlados y descartar el resto; usar los poderes de fin de ronda de las criaturas; comprobar el final; recoger todos los dados, voltear la aldea, sacar una fila nueva de bosques y pasar el marcador de jugador inicial a la izquierda.

### 1.11 Final y puntuación

Tras la cuarta ronda (cuando el mazo de bosques no da para otra fila; las dos formulaciones del reglamento coinciden si el mazo tiene justo cuatro filas). Se suma:

- Los puntos de las pociones preparadas, en la mano o bebidas.
- Los puntos de los bosques reclamados.
- 3 por criatura en un bosque y 1 por cada otra.
- Las fichas de puntos.
- 1 punto por cada 3 ingredientes sobrantes, bayas incluidas.

Gana quien más tiene. **Desempate:** más ingredientes sobrantes; si siguen empatados, comparten la victoria.


### 1.12 Poderes de personaje (opcionales)

Se pagan con bayas. *Lello:* al colocar un dado de forraje en un bosque, por 1 baya ponerlo encima de otro dado (sin recoger). *Myla:* una vez por ronda, por 2 bayas, reclamar un bosque en el que está empatada. Los otros dos poderes son: por 1 baya, usar una casilla de ingrediente como casilla de criatura, con hasta 4 criaturas entrenadas; y que la primera baya al preparar valga por 2 ingredientes. **Las fuentes no coinciden en cuál es de Lyric y cuál de Wren**, y las cartas llevan un "(MAX 3)" o "(MAX 4)" que no se explica Mareas no los usa: tiene cofradías propias (MA11).

### 1.13 Puntos que el reglamento no aclara: decididos

**Decididos por quien decide el 2026-11-21.**

| # | Asunto | Decisión |
|---|---|---|
| B1 | "4 rondas" frente a "cuando se acabe el mazo de bosques" | **Manda el mazo**: la partida termina cuando el mazo no da para una fila completa. Así, si más adelante se añaden bosques, no hay que cambiar un número de rondas. Con el mazo de la versión 1 salen 4 rondas (MA5) |
| B2 | Quemar: una ronda o para siempre | **Una ronda.** El reglamento dice que la casilla deja de existir, pero como el bosque sale de la fila al acabar la ronda da lo mismo hoy; fijarlo en una ronda evita que algo nuevo cambie su efecto |
| B3 | Puntos por ingredientes sobrantes | **1 punto por cada grupo completo de 3.** Lo que no llega a 3 no da nada |
| B4 | Si preparar una poción reservada repone el mercado | No: no queda ningún hueco nuevo |
| B5 | Si lo pagado al forzar vuelve al suministro | Sí |
| B6 | Cuándo vuelven los dados | Todos, estén donde estén (también en las casillas de las criaturas y los apartados), al empezar la ronda siguiente |
| B7 | Qué poderes son opcionales | Los que dicen "puedes" (en inglés, *may*) son opcionales; el resto se aplica siempre |
| B8 | Si no se puede reponer el mercado o un montón de criaturas | El hueco queda vacío |

Además, el PDF aclara que **se puede preparar una poción y beberla en el mismo turno**, antes o después de colocar, siempre que quede un dado por colocar.

---

## 2. Lo que pone a prueba en la plataforma

| Rasgo | ¿Ya lo hay? | Dónde |
|---|---|---|
| De 2 a 4 jugadores, resultados por asiento | Sí | Dominó (ADR-020) y Cinco a ciegas |
| Azar con la semilla de la plataforma (dados, mazos) | Sí | `packages/game-engine/src/random.ts` (DO15) |
| Turno de varios pasos del mismo asiento | Sí | X16: la versión del asiento vuelve a contar desde su jugada |
| Varios asientos que deciden a la vez | Sí | T-23 (Batalla naval coloca la flota así) |
| Asiento retirado con la partida en marcha | Sí | T-24 (DO18 a DO21) |
| Información oculta | Sí, pero aquí apenas hace falta | MA10 |
| Decisiones encadenadas dentro de un turno (soltar un ave, elegir la casilla de un poder) | **No en otro juego, pero no toca la plataforma**: es estado del motor | MA7 |
| Por turnos con unos 30 turnos por jugador y un reloj total de 12 a 36 h | **Encaja mal** | MA12 |
| Opciones de partida (cofradías) | La API sí; **el formulario de crear sala no envía opciones** | MA11 |
| Un tablero con muchas zonas (puerto, fila de islas, mercado, aves, dados) | **No**: es, con diferencia, el tablero más grande | MA17 |

**Conclusión: no hace falta cambiar la plataforma ni el contrato para una versión 1** en tiempo real y sin cofradías. Lo nuevo es todo del juego: un motor y un tablero bastante más grandes que los anteriores (Dominó tiene 653 líneas de motor y 227 de tablero; calculo de tres a cuatro veces eso) y el equilibrio del catálogo propio.

---

## 3. Resumen de las decisiones

| ID | Asunto | Estado | Decisión o recomendación |
|---|---|---|---|
| **Derechos** | | | |
| MA1 | Tema | **Aceptado** (2026-11-21) | **Tema propio**: un archipiélago de pescadores. Las mismas reglas y mecánicas que el original |
| MA2 | Nombre e identificador | **Aceptado** (2026-11-21) | "**Mareas**", `tides`, versión `1.0.0`, alta inactiva, aviso neutro |
| MA3 | Vocabulario | **Aceptado** (2026-11-21) | Tabla de la sección 4.2 |
| MA4 | Catálogo | **Aceptado** (2026-11-21), anexo versión 0.2 | [Anexo](0023-anexo-catalogo-mareas.md): 20 islas, 36 aves, 32 encargos y puerto de dos caras, sin copiar ninguna carta; equilibrado con simulaciones del motor |
| **El juego** | | | |
| MA5 | Jugadores, filas y final | **Aceptado** (2026-11-21) | 2 a 4; 3, 4 o 5 islas por fila; termina cuando el mazo no da para otra fila (4 rondas con el mazo de la versión 1) |
| MA6 | Forma del turno | **Aceptado** (2026-11-21) | Colocar (obligatorio), cumplir y usar (opcionales) en cualquier orden; **"Terminar turno"** explícito, con fin automático cuando ya no queda nada posible |
| MA7 | Decisiones dentro del turno | **Aceptado** (2026-11-21) | Una **decisión pendiente** en el estado del motor que el mismo asiento resuelve antes de seguir |
| MA8 | Fin de ronda | **Aceptado** (2026-11-21) | Reclamar es automático; las elecciones de fin de ronda se hacen **a la vez**, solo los asientos que tienen alguna |
| MA9 | Aves que anidan | **Aceptado** (2026-11-21) | Jugada libre en el turno propio; al final, el motor coloca las que falten de la forma que más puntúa |
| MA10 | Información | **Aceptado** (2026-11-21) | **Mano de encargos visible para todos**; oculto solo el orden de los mazos |
| MA11 | Cofradías | **Aceptado** (2026-11-21): propias y fuera de la versión 1 | Cuatro cofradías nuevas en el anexo, para una `1.1.0` |
| MA12 | Controles de tiempo | **Aceptado** (2026-11-21) | **Solo tiempo real**: 15, 20 y 30 minutos. Por turnos, no en la versión 1 |
| MA13 | Retiradas | **Aceptado** (2026-11-21) | Con 2, gana el otro. Con 3 o 4, sus barcas salen del tablero, no juega más, pierde y la partida sigue |
| MA14 | Resultado | **Aceptado** (2026-11-21) | Más puntos, `WIN`; desempate por ingredientes sobrantes; empate total, `WIN` compartido; el resto, `LOSS` |
| MA15 | Puntos sin aclarar | **Aceptado** (2026-11-21) | Tabla 1.13 |
| MA16 | Acciones, eventos, vista y motivos de rechazo | **Aceptado** (2026-11-21) | Sección 4.6 |
| MA17 | Tablero | **Aceptado** (2026-11-21) | Escritorio en tres franjas; móvil por pestañas; figura además de color en todo |
| MA18 | Pruebas | **Aceptado** (2026-11-21) | Reglas del motor, batería común, simulación de equilibrio y una prueba en navegador con 3 jugadores |
| **Plataforma** | | | |
| MA19 | Cambios de plataforma | **Aceptado** (2026-11-21) | **Ninguno para la versión 1.** Dos mejoras opcionales y aparte: incremento por jugada y opciones en el formulario de sala |
| MA20 | Entrega | **Aceptado** (2026-11-21) | Una pull request con motor, simulación, tablero y alta inactiva; los ajustes de equilibrio se enseñan antes de activar |

---

## 4. El juego

### 4.1 Derechos (MA1, MA2)

**Decidido el 2026-11-21 (MA1):** Mareas conserva las reglas y las mecánicas del original y tiene tema, nombres, arte, textos, cartas y personajes propios. Encaja en F9 enmendada (ADR-022, CA1), que admite mecánicas de juegos modernos con todo lo demás propio.

**Por qué no el mismo tema.** *Brew* se reconoce por la suma de muchas piezas concretas: su tema, su tablero de aldea, sus cartas. Con el mismo tema y las mismas cartas, aunque cambien los nombres, el resultado sería una copia del juego y no un juego nuevo con una mecánica parecida. Por lo general la idea de un juego no se protege, pero sí su expresión. Esto **no es asesoría legal**. Antes de abrir la plataforma al público se revisan estos juegos, como ya dice F9.

**Qué se conserva:** las reglas de la sección 1. **Qué cambia:** el tema, todos los nombres, el arte, los textos, el puerto, todas las cartas y los personajes.

**MA2.** "**Mareas**", identificador `tides`, versión `1.0.0`, alta **inactiva**. En la descripción del catálogo y al pie del tablero, el aviso neutro que se eligió para Cinco a ciegas: *"Inspirado en un juego de mesa comercial. Si te gusta, apoya a sus autores comprando el original."* La marca, el autor y la editorial, solo en la línea de origen del `README.md` del motor. Otros nombres posibles: "Archipiélago" (`archipelago`), "Cofradías" (`guilds`).

### 4.2 Vocabulario (MA3)

Cada jugador lleva una **cofradía de pescadores** en un archipiélago. Sus barcas salen cada ronda a faenar en las islas; el clima, que no es de nadie, estorba a quien domina una isla.

| Original | Mareas | Figura (accesibilidad) |
|---|---|---|
| Bosque | **Isla** | — |
| Estación (primavera, verano, otoño, invierno) | **Las mismas cuatro estaciones**. Cada isla es buena para anidar en una o dos estaciones, y las aves son de paso: llegan en su estación | Brote, sol, hoja seca y copo, además del color |
| Aldea (día / noche) | **Puerto** (pleamar / bajamar) | Ola alta, ola baja |
| Dado de forraje: hoja, piedra, rama | **Barca**: red, ancla, vela | Las tres figuras; el color es el del asiento |
| Dado de elemento: agua, fuego, viento | **Dado de clima**: calma, tormenta, brisa | Ola, rayo, remolino |
| Hierba, seta, cristal | **Pescado, sal, algas** | Pez, cristal de sal, hoja de alga |
| Baya energética (comodín) | **Perla** | Círculo con brillo |
| Criatura entrenada / liberada / en un bosque | **Ave a bordo / ave suelta / ave que anida** | — |
| Poción: preparar / beber / reservar | **Encargo: cumplir / usar / apalabrar** | — |
| Quemar una casilla | **Bajío** | Rombo tachado |
| Personajes | **Cofradías** con su patrón | — |
| Puntos de victoria | Puntos | — |

Los colores de asiento salen de `--seat-N`; cada asiento lleva además una figura en sus barcas, para no depender del color.

*Revisado el 2026-11-21, a petición de quien decide:* la primera versión usaba "rumbos" (norte, este, sur, oeste) en lugar de estaciones. Se vuelve a las estaciones: son una idea común, no algo propio del original, y en un archipiélago de pescadores tienen sentido (temporadas de pesca, aves que llegan en su estación). No cambia ninguna regla: era solo el nombre de las cuatro categorías. Lo que nos aleja del original no son las estaciones, sino que el reparto de poderes por estación es distinto (anexo, sección 0).

### 4.3 Catálogo (MA4)

**Decidido el 2026-11-21:** propio. Está en el [anexo](0023-anexo-catalogo-mareas.md), con sus criterios: ninguna carta copia otra del original, las aves se reparten por tipo y no por el estilo de cada estación del original, y las cofradías tienen poderes nuevos.

**Equilibrio.** Es el mayor riesgo del juego: un catálogo nuevo sin probar puede tener cartas que deciden la partida. Se comprueba con el propio motor: miles de partidas con jugadores automáticos sencillos (al azar y con una regla "voraz"), mirando la tasa de victoria por asiento, los puntos medios por fuente y qué cartas aparecen en las partidas ganadas. Es una prueba más del paquete del motor, sin dependencias nuevas. No sustituye a jugarlo, pero detecta lo más grosero. El ejemplar de quien decide sirve **solo** para comparar rangos generales (cuántos puntos hace el ganador, entre qué valores van costes y puntos), nunca para copiar cartas.

### 4.4 Reglas que concreta la versión 1 (MA5 a MA15)

**MA5. Jugadores, filas y final.** De 2 a 4. Se sacan 3, 4 o 5 islas por fila. La partida **termina cuando, al acabar una ronda, el mazo no da para una fila completa** (B1). Con el mazo de la versión 1 (12, 16 o 20 islas según los jugadores) eso es siempre tras la cuarta ronda. Empieza el asiento 0, que sortea la plataforma; el marcador pasa al siguiente cada ronda. El puerto empieza en pleamar y se voltea cada ronda.

**MA6. El turno.** El asiento activo puede, en cualquier orden y como jugadas separadas: **colocar** un dado (una vez, obligatorio), **cumplir** un encargo (una vez) y **usar** uno (una vez, también el recién cumplido), además de dejar **anidar** aves (MA9). Termina con **"Terminar turno"**, que solo se acepta tras colocar. Para no obligar a pulsar en balde, el motor termina el turno solo cuando, tras colocar, no queda nada que hacer. Quien no tiene dados se salta sin intervención. "Doble jornada" deja colocar otro dado ese turno; "volver a puerto" recupera una barca y, con ella, un turno.

*Alternativa descartada:* que colocar termine el turno. Es más sencillo, pero quita la libertad de cumplir o usar después de colocar, que el reglamento permite expresamente.

**MA7. Decisiones dentro del turno.** Algunas jugadas abren una elección: al subir la cuarta ave hay que soltar una; el Albatros pregunta si se pone un bajío y dónde. El motor guarda una **decisión pendiente** y solo acepta del mismo asiento la jugada que la resuelve (o la renuncia, si es opcional, B7). Los poderes sin elección se aplican solos. Para la plataforma son jugadas normales del asiento activo.

**MA8. Fin de ronda.** El motor reclama las islas controladas y descarta el resto. Si algún asiento tiene un poder de fin de ronda con elección (el Flamenco), se abre una **fase simultánea**: `activeSeats` lleva solo esos asientos, cada uno envía su elección y, cuando todos han respondido, empieza la ronda siguiente con la tirada de todos los dados. Es el mecanismo de T-23 que usa Batalla naval al colocar la flota. Quien no tiene nada que elegir no entra en la fase ni gasta reloj.

**MA9. Aves que anidan.** Dejar anidar un ave suelta es una jugada libre del asiento activo. Al final, antes de contar, el motor deja anidar las que queden de la forma que **más puntos da** a cada jugador, para que nadie pierda puntos por olvido.

**MA10. Información.** En el original la mano es oculta, pero **todo lo que entra en ella sale de un sitio visible**. En la mesa se esconde; en línea, quien apunta lo sabe todo y quien no, no. Recomiendo **mano visible para todos**. Quedan ocultos solo el orden de los mazos de encargos e islas y los montones de aves bajo la carta visible.

*Alternativa:* mano oculta como en el original, con el número de cartas visible. Más fiel, pero premia la memoria.

**MA11. Cofradías.** **Decidido el 2026-11-21** que son propias: cuatro nuevas en el anexo. Recomiendo dejarlas **fuera de la versión 1**: el reglamento aconseja empezar sin ellas y son una opción de sala que el formulario todavía no envía. Entran en una `1.1.0`, cuando el formulario envíe opciones.

**MA12. Controles de tiempo.** Cada jugador hace unas 25 a 35 jugadas por partida.

- **Tiempo real: 15, 20 y 30 minutos por jugador** (dentro de la regla 7.2).
- **Por turnos: no en la versión 1.** El reloj es total (12, 24 o 36 horas) y no hay incremento por jugada: con unos 30 turnos, 36 horas son algo más de una hora por turno, y con 4 jugadores la partida duraría semanas. La lista de controles por turnos queda vacía, que el registro admite.
- Si se quiere por turnos más adelante, haría falta un **incremento por jugada** en la plataforma, con su propio ADR (cambia la regla 7.2).

**MA13. Retiradas.** Con **2**, gana el otro (regla 7.18). Con **3 o 4**, las barcas colocadas del retirado salen del tablero en ese momento, no juega más turnos ni fases, no reclama islas y su resultado es `LOSS`; los dados de clima que puso se quedan, porque son neutrales. Si era su turno, juega el siguiente. Si solo queda uno, gana.

**MA14. Resultado.** `WIN` para quien más puntos tiene; si empatan, para quien tenga más ingredientes sobrantes; si siguen empatados, `WIN` para todos ellos. Los demás, `LOSS`. La vista final muestra el desglose de puntos.

**MA15.** Tabla 1.13, decidida. Además, si se acaba el mazo de encargos, se hace como en el original: los usados vuelven al mazo y su dueño se anota sus puntos aparte.

### 4.5 Azar

Las tiradas de todos los dados al empezar cada ronda, "relanzar", y el barajado de los mazos de islas, aves y encargos al empezar. Todo con el generador común (`random.ts`) a partir de la semilla de la plataforma (M7, Z1). Cada tirada es un evento público.

### 4.6 Acciones, eventos, vista y motivos de rechazo (MA16)

| Acción | Qué lleva |
|---|---|
| `PLACE` | El dado (barca o clima, por su índice), el destino (casilla de isla, del puerto o de un ave) y, si se fuerza, con qué se paga. Si sube un ave, de qué montón |
| `FULFIL` | El encargo (del mercado o apalabrado) y el pago desglosado, perlas incluidas |
| `USE` | El encargo de la mano y los parámetros de su uso |
| `NEST` | El ave suelta y la isla reclamada |
| `RESOLVE` | La respuesta a la decisión pendiente, o la renuncia |
| `END_TURN` | — |
| `ROUND_CHOICES` | Las elecciones de fin de ronda del asiento |

**Eventos (públicos, M8):** `ROUND_STARTED`, `DICE_ROLLED`, `DIE_PLACED`, `GATHERED`, `BIRD_BOARDED`, `BIRD_RELEASED`, `BIRD_NESTED`, `ORDER_PROMISED`, `ORDER_FULFILLED`, `ORDER_USED`, `SHOAL_PLACED`, `ISLAND_CLAIMED`, `ISLAND_DISCARDED`, `ROUND_SCORED`, `SEAT_RETIRED`, `GAME_SCORED`.

**Vista:** la ronda; el puerto y su cara; la fila de islas con sus casillas, pilas de dados y bajíos; quién domina cada isla en ese momento (calculado por el motor); el mercado, el número de cartas del mazo y la carta visible de cada montón de aves; por asiento, sus dados en reserva con su cara, ingredientes, aves, encargos en mano, usados y apalabrados, islas reclamadas y puntos a la vista; la decisión pendiente, si es del que mira; y el desglose final.

**Motivos de rechazo** (con `INVALID_ACTION`, salvo los de turno): `MALFORMED_ACTION`, `DIE_NOT_IN_POOL`, `SPACE_OCCUPIED`, `SPACE_SHOALED`, `FACE_MISMATCH`, `CANNOT_FORCE`, `CANNOT_AFFORD`, `ALREADY_PLACED`, `ALREADY_FULFILLED`, `ALREADY_USED`, `MUST_PLACE_FIRST`, `NO_DIE_LEFT`, `PENDING_DECISION`, `NO_PENDING_DECISION`, `ORDER_NOT_AVAILABLE`, `BAD_TARGET`, `NEST_NOT_ALLOWED`, `PORT_SPACE_USED`, `NOT_YOUR_BIRD`.

### 4.7 Tablero (MA17)

- **Escritorio, tres franjas:** arriba el puerto, el mercado de encargos y los cuatro montones de aves; en medio la fila de islas, con sus casillas, pilas de dados y quién la domina; abajo la zona propia y un resumen de cada rival.
- **Móvil:** la fila de islas siempre visible con desplazamiento lateral, y el resto en pestañas (Puerto, Encargos, Mi cofradía, Rivales).
- **Interacción:** elegir un dado y después la casilla; las casillas válidas se resaltan con la vista, pero decide el servidor (K7). Para los usos con objetivo, un paso guiado.
- **Accesibilidad:** figura además de color en barcas, climas, estaciones e ingredientes; textos alternativos en cada casilla.

### 4.8 Pruebas (MA18)

- Reglas del motor: colocación y forzado, cada clima, mayorías y empates con pilas, cada ave y cada uso de encargo, fin de ronda y fase simultánea, final por mazo, retiradas con 2, 3 y 4, puntuación y desempates.
- Batería común con sus datos en `FIXTURES`.
- Simulación de equilibrio (MA4).
- Una prueba en navegador: una partida corta de 3 jugadores que coloca, cumple, usa y llega al final de ronda.

---

## 5. Plataforma (MA19)

**Para la versión 1, ningún cambio de plataforma ni de contrato.** Todo lo que pide el juego ya existe: varios jugadores, azar con semilla, turnos de varios pasos (X16), asientos activos a la vez (T-23), retiradas que no terminan la partida (T-24) y vistas por asiento.

Dos mejoras **opcionales, aparte, que no recomiendo hacer ahora**:

| Mejora | Para qué | Qué toca |
|---|---|---|
| Incremento por jugada en el reloj | Modalidad por turnos para juegos largos | Regla 7.2, relojes de la capa de sesión, metadatos del motor, contrato. Necesita su propio ADR |
| Opciones de sala en el formulario | Las cofradías (MA11) y opciones de otros juegos | Página de salas del frontend; la API ya las acepta |

## 6. Entrega (MA20)

Una **pull request** con el motor, su `README.md`, sus pruebas, la simulación de equilibrio, el tablero, sus textos, la prueba en navegador y la migración que lo da de alta **inactivo**. Sin cambios de plataforma. Antes de activar el juego, enseño a quien decide el resultado de la simulación y los ajustes de valores que salgan, como una versión nueva del anexo.

Acompañarían a la PR: el ADR-023 aceptado en `docs/adr/` con su anexo, su línea en el índice de ADR y la mención en `planning/propuesta-de-juegos.md`.

## 7. Lo que necesito de quien decide

1. Revisar el [anexo](0023-anexo-catalogo-mareas.md) y cambiar lo que no te guste (nombres, poderes, valores).
2. Responder las dudas D1 a D10 de la sección 8, o aceptar lo que propongo en cada una.
3. Aceptar, cambiar o rechazar MA2, MA3, MA5 a MA14 y MA16 a MA20.
4. *Opcional:* los rangos generales de tu ejemplar que pide el anexo (sección 8), sin pasar cartas.

Nada de esto autoriza código. La construcción necesita autorización explícita aparte.

---

## 8. Lo que sigue sin estar claro

Revisado el 2026-11-21 con el PDF del reglamento.

### 8.1 Cartas y tableros: resueltos

Las cartas del original (bosques, criaturas, pociones), las dos caras de la aldea y los poderes de los personajes no se leían en ninguna fuente. **Ya no hacen falta**: el anexo define las de Mareas. Las caras de los dados también son nuestras: dos de cada figura.

### 8.2 Reglas que el reglamento no resuelve

Son dudas de mecánica, así que valen para Mareas. Para cada una digo qué propongo si tu reglamento no lo aclara.

| # | Duda | Propuesta |
|---|---|---|
| D1 | La tormenta del puerto aparta los dados de clima de las islas: **¿adónde van?** Si volvieran a la reserva de quien los puso, le darían turnos de más | **Apartados hasta la ronda siguiente**, como hace "amarrar". (El anexo ya lo escribe así) |
| D2 | La brisa devuelve tu barca de esa casilla: **¿vale si tu barca está tapada** por otro dado? | Solo si tu barca está arriba de la pila |
| D3 | **¿Un dado de clima puede ir a una casilla de ave de una isla?** El reglamento dice "cualquier casilla de bosque" | Sí, y sube el ave como cualquier dado |
| D4 | "Remolcar" (mover una barca): **¿también al puerto?** La carta del original dice "casilla vacía de bosque" | Solo a casillas vacías de isla sin bajío; la figura no importa |
| D5 | Las aves con casilla propia: **¿la puede usar otro jugador?** | Solo su dueño. (El anexo ya lo escribe así) |
| D6 | "Doble jornada": **¿dispara los poderes de "cuando colocas"?** | Sí: es una colocación normal |
| D7 | **¿Se puede dejar anidar un ave en el turno de otro?** El reglamento dice "en cualquier momento" | Solo en el turno propio, y al final el motor coloca las que falten (MA9) |
| D8 | Tormenta encima de una pila: **¿cuenta como dado de clima contra quien domina?** | Sí: es el dado de arriba y es de clima |
| D9 | Sobre los personajes, las fuentes se contradicen | **Ya no aplica**: las cofradías son nuestras (MA11) |
| D10 | Final por mazo (B1): **si el mazo tiene cartas pero no para una fila completa**, ¿se juega con una fila más corta? | No: la partida termina, como dice el reglamento ("no se puede sacar una fila nueva") |

---

## 9. Aceptación

El 2026-11-21, a las 3:44 UTC, quien decide aceptó **todas las recomendaciones** de este ADR: MA1 a MA20, las propuestas de las dudas D1 a D10 (sección 8) y el anexo del catálogo en su versión 0.2. Antes había decidido el tema (MA1), las cartas y los personajes propios (MA4, MA11), las estaciones en lugar de rumbos (sección 4.2), los puntos B1 a B8 (sección 1.13) y la escala de puntos (anexo, sección 8).

**No queda autorizado el código.** La pull request de MA20 necesita una autorización explícita aparte, como pide la regla 10 del proyecto.

*Añadida el 2026-11-21:* a las 3:45 UTC, quien decide **autorizó la construcción** ("Sí, construir"): una pull request con el motor, la simulación de equilibrio, el tablero, las pruebas y el alta inactiva, sin cambios de plataforma (MA20).

## 10. Lo que resultó al construir

Ajustes de detalle hechos al construir, dentro de lo aceptado. Ninguno cambia una regla.

| Punto | Qué cambió y por qué |
|---|---|
| Catálogo (MA4) | La simulación dejaba al ganador en unos 43 puntos con la versión 0.2. En la **versión 0.3 del anexo**, los 22 encargos de 3 o más ingredientes valen 1 punto más. Resultado y tabla en el anexo, sección 8 |
| Eventos (MA16, sección 4.6) | Sin `ROUND_SCORED`: los puntos de las aves al final de ronda salen como `POINTS_GAINED`. Se añaden `DIE_MOVED`, `DIE_SET_ASIDE`, `DIE_RETURNED`, `TURN_ENDED` y `ORDERS_RESHUFFLED`, para que el tablero pueda contar lo que pasa |
| Motivos de rechazo (MA16) | Sin `NO_DIE_LEFT`: siempre hay una jugada, porque las dos casillas del puerto para cualquier dado nunca se bloquean. Se añaden `BAD_PAYMENT` (el pago no es el coste justo), `BAD_CHOICE` (la elección no vale para la decisión pendiente) y `WRONG_PHASE` |
| Vista (MA10) | Lleva `revealed`, la carta revelada al apalabrar con su coste y sus puntos, solo para quien decide |
| Pago | `FULFIL` lleva el pago exacto; el tablero propone el más barato (lo básico primero y perlas para el resto) |
| Tablero (MA17) | Las pestañas del móvil son Lo mío, Puerto, Encargos y aves, y Jugadores (sin cofradías en la versión 1). En pantallas anchas, las tres franjas |
| Jugadas posibles | `legal.ts` da las jugadas posibles de un asiento. Lo usan la comprobación común, las pruebas y la simulación; la plataforma no |


---

## Fuentes

- Reglamento oficial en PDF: [copia en 1jour-1jeu](https://cdn.1j1ju.com/medias/9c/35/42-brew-rulebook.pdf), leído como texto (sin iconos).
- Transcripciones: [rulespal.com/brew/rulebook](https://rulespal.com/brew/rulebook) y [texto extraído en lehi-innovation.github.io](https://lehi-innovation.github.io/boardgame-rules/extracted/brew-rules.txt), con su [resumen](https://lehi-innovation.github.io/boardgame-rules/rules/brew/).
- [Ficha de la editorial](https://pandasaurusgames.com/products/brew).
- Reseñas: [The Opinionated Gamers (Dale Yu, 2021)](https://opinionatedgamers.com/2021/09/21/dale-yu-review-of-brew/), [Board Game Quest](https://www.boardgamequest.com/brew-review/), [GeekDad (2021)](https://geekdad.com/2021/11/mixing-up-a-potent-brew/); resumen en [gamerules.com](https://gamerules.com/?p=6009).
