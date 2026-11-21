# Anexo del ADR-023: catálogo de Mareas

| Campo | Valor |
|---|---|
| **Estado** | **Aceptado, versión 0.2** (2026-11-21). **Versión 0.3** del mismo día, tras la simulación del motor: los encargos de 3 o más ingredientes valen 1 punto más (sección 8). Los cambios se enseñan antes de activar el juego |
| **Fecha** | 2026-11-21 |
| **Parte de** | [ADR-023, Mareas](0023-mareas-colocacion-de-dados-y-control-de-islas.md), decisiones MA4 y MA11 |

Este anexo define todo el material del juego: dados, puerto, 20 islas, 36 aves, 32 encargos y 4 cofradías. **Todo es diseño propio.** Las reglas y las mecánicas son las del original, como decidió quien decide el 2026-11-21; las cartas y los personajes, no.

## 0. Criterios

- **Ninguna carta copia otra del original.** No se transcribió ninguna carta; las del original no se conocen carta por carta, y quien decide tiene un ejemplar, que solo sirve como referencia general de rangos (sección 7).
- **Las aves no siguen el reparto del original por estaciones.** En el original cada estación tiene un estilo (puntos, bayas, ingredientes, estorbar). Aquí **cada estación tiene un ave de cada tipo**: una que se dispara al jugar, una con casilla propia y una que da puntos. Los poderes son nuevos.
- **Las cofradías tienen poderes nuevos.** Ninguna repite los cuatro del original (apilar, reclamar empatado, casilla de ingrediente como de criatura, primera baya doble).
- **Puerto propio.** Se conservan los dos tipos de casilla (dos para cualquier dado y tres de clima) y que la tormenta del lado de pleamar retira el clima de las islas, porque es parte de la mecánica; el resto de efectos es nuestro.
- **Valores iniciales.** Se ajustan con la simulación del motor (ADR-023, MA4) antes de activar el juego.

## 1. Dados

| Dado | Cuántos | Caras |
|---|---|---|
| **Barca**, del color del asiento y con su figura | 4 por jugador | 2 red, 2 ancla, 2 vela |
| **Clima**, blanco | 2 por jugador | 2 calma, 2 tormenta, 2 brisa |

Lo que hace cada clima en una isla (es la mecánica del original): **calma**, al recoger, 2 más del mismo ingrediente; **tormenta**, se pone encima de cualquier dado y la casilla se usa como si estuviera libre (el de abajo deja de contar); **brisa**, se pone sobre una casilla con una barca propia, que vuelve a la reserva, y se recoge con normalidad.

## 2. Ingredientes

Pescado, sal y algas, y la **perla**, que vale por cualquiera al cumplir un encargo y no se puede elegir cuando una casilla dice "a elegir". Cada jugador empieza con 1 perla. Sin límite en el suministro.

## 3. Puerto

Cinco casillas por cara. Las dos de cualquier dado nunca se ocupan; las de clima admiten un dado por ronda. Los poderes del clima no se aplican en el puerto.

| Casilla | Pleamar (rondas impares) | Bajamar (rondas pares) |
|---|---|---|
| Cualquier dado, 1 | Recoge 1 ingrediente a elegir | Recoge 2 del mismo ingrediente, a elegir |
| Cualquier dado, 2 | Sube a bordo 1 ave | Cambia hasta 2 ingredientes por otros a elegir |
| Calma | Recoge 1 pescado y 1 algas | Sube a bordo 1 ave y recoge 1 ingrediente a elegir |
| Tormenta | Aparta todos los dados de clima de todas las islas hasta la ronda siguiente | Pon un bajío en hasta 2 casillas vacías de islas |
| Brisa | Recoge 1 sal y apalabra 1 encargo | Apalabra hasta 2 encargos |

## 4. Islas

Cada casilla tiene la figura de barca que admite y lo que da. **Ave** = subir a bordo un ave de uno de los cuatro montones. La marca dice desde cuántos jugadores entra la isla: con 2 se usan las 12 islas "2+"; con 3, también las "3+" (16); con 4, todas (20). Así el mazo da justo cuatro filas de 3, 4 o 5.

| # | Nombre | Estación | Marca | Casillas | Casillas (figura → lo que da) | Puntos |
|---|---|---|---|---|---|---|
| I01 | Roca Gris | Primavera | 2+ | 3 | red → pescado, ancla → sal, vela → ave | 4 |
| I02 | Cala Honda | Primavera | 2+ | 4 | red → pescado, red → pescado, ancla → algas, vela → sal | 5 |
| I03 | Isla del Faro | Verano | 2+ | 3 | red → sal, vela → ave, ancla → pescado | 4 |
| I04 | El Arenal | Verano | 2+ | 4 | ancla → sal, ancla → sal, red → algas, vela → ave | 5 |
| I05 | Los Cangrejos | Verano | 2+ | 5 | red → algas, ancla → pescado, vela → algas, red → sal, ancla → ave | 7 |
| I06 | Punta Brava | Otoño | 2+ | 3 | ancla → algas, red → ave, vela → pescado | 4 |
| I07 | Las Salinas | Otoño | 2+ | 4 | vela → sal, ancla → sal, red → sal, vela → algas | 5 |
| I08 | Isla Verde | Invierno | 2+ | 3 | red → algas, ancla → algas, vela → ave | 3 |
| I09 | Bahía Quieta | Invierno | 2+ | 4 | red → pescado, vela → algas, ancla → sal, red → ave | 5 |
| I10 | Peñón Alto | Invierno | 2+ | 4 | vela → pescado, vela → sal, ancla → algas, ancla → ave | 5 |
| I11 | Dos Vientos | Primavera y verano | 2+ | 4 | red → sal, ancla → pescado, vela → algas, vela → pescado | 4 |
| I12 | Las Gemelas | Otoño e invierno | 2+ | 4 | ancla → pescado, red → algas, vela → sal, ancla → ave | 4 |
| I13 | Isla Larga | Primavera | 3+ | 5 | red → algas, ancla → sal, vela → pescado, red → pescado, vela → ave | 7 |
| I14 | Morro Negro | Verano | 3+ | 4 | ancla → algas, red → pescado, red → ave, vela → sal | 5 |
| I15 | Playa Blanca | Otoño | 3+ | 5 | vela → sal, red → sal, ancla → pescado, vela → algas, red → ave | 7 |
| I16 | Arrecife Rojo | Invierno | 3+ | 3 | red → algas, ancla → pescado, vela → sal | 4 |
| I17 | Isla Ballena | Primavera | 4 | 5 | ancla → pescado, ancla → pescado, red → algas, vela → sal, red → ave | 8 |
| I18 | Cayo del Sur | Otoño | 4 | 4 | red → algas, ancla → algas, vela → pescado, vela → ave | 5 |
| I19 | La Encrucijada | Primavera e invierno | 4 | 4 | vela → pescado, red → sal, ancla → algas, red → ave | 4 |
| I20 | Cabo Mayor | Otoño y verano | 4 | 5 | red → pescado, vela → sal, ancla → algas, ancla → sal, vela → ave | 6 |

**Reparto.** 5 islas de 3 casillas, 10 de 4 y 5 de 5; 16 de una estación y 4 de dos. Cada estación aparece en 6 islas. Entre todas las casillas: 27 red, 27 vela y 26 ancla; 22 de sal, 21 de pescado, 21 de algas y 16 de ave. De 3 a 8 puntos (subidos en la versión 0.2, ver sección 8): más cuantas más casillas, y menos en las de dos estaciones, que son más fáciles de aprovechar para las aves.

| Jugadores | Islas | Por estación (primavera, verano, otoño, invierno) | Casillas de ave | Puntos en juego |
|---|---|---|---|---|
| 2 | 12 | 3, 4, 3, 4 | 9 | 55 |
| 3 | 16 | 4, 5, 4, 5 | 12 | 78 |
| 4 | 20 | 6, 6, 6, 6 | 16 | 101 |

## 5. Aves

36 cartas: 4 estaciones, 3 aves por estación y 3 copias de cada una. Son **aves de paso**: cada una llega al archipiélago en su estación y anida en las islas de esa estación. Cada estación tiene un ave de cada tipo:

- **Al jugar:** se dispara sola cuando pasa algo.
- **Casilla propia:** el ave tiene una casilla en la que solo su dueño puede poner un dado (ADR-023, D5). No es casilla de isla: no cuenta para la mayoría. El dado vuelve al empezar la ronda siguiente.
- **Puntos:** da puntos mientras está a bordo.

Como en el original, el poder solo vale **mientras el ave está a bordo** (máximo 3). Al soltarla pierde el poder; al final puntúa 3 si anida en una isla reclamada de su estación y 1 si no.

| Estación | Ave (3 copias) | Tipo | Poder |
|---|---|---|---|
| Primavera | **Frailecillo** | Al jugar | Cuando colocas una barca con la cara de red, recoges 1 pescado más |
| Primavera | **Págalo** | Casilla propia (dado de clima) | Mueve una barca colocada, de cualquiera, a otra casilla vacía con su misma figura, en la misma isla o en otra. No recoge |
| Primavera | **Alca** | Puntos | Al final de cada ronda, 1 punto por cada isla que hayas reclamado esa ronda |
| Verano | **Charrán** | Al jugar | Cuando colocas un dado en el puerto, recoges 1 sal más |
| Verano | **Cormorán** | Casilla propia (cualquier barca) | Recoge 1 perla |
| Verano | **Gaviota** | Puntos | Cuando cumples un encargo que cuesta 4 o más ingredientes, 2 puntos |
| Otoño | **Pelícano** | Al jugar | Cuando recoges con un dado de calma, recoges 1 más (4 en total) |
| Otoño | **Garza** | Casilla propia (dado de clima) | Recoge 2 ingredientes distintos, a elegir |
| Otoño | **Flamenco** | Puntos | Al final de cada ronda, puedes pagar 1 pescado, 1 sal y 1 algas (no perlas) para ganar 4 puntos |
| Invierno | **Albatros** | Al jugar | Cuando colocas un dado de clima en una isla, puedes poner un bajío en otra casilla vacía de esa isla |
| Invierno | **Petrel** | Casilla propia (cualquier barca) | Apalabra 1 encargo |
| Invierno | **Cuervo marino** | Puntos | Cuando sueltas otra ave, 1 punto |

El Flamenco es la única ave con elección al final de la ronda, así que es la que abre la fase simultánea de MA8. El Albatros y el Flamenco dicen "puedes": son opcionales (B7). El resto se aplica siempre.

## 6. Encargos

32 cartas. Se pagan con ingredientes (la perla vale por cualquiera), puntúan en la mano o usadas y se usan una vez. Los siete usos son la mecánica del original:

| Uso | Qué hace | Cartas |
|---|---|---|
| **Girar** | Pon un dado de tu reserva en la cara que quieras | 5 |
| **Relanzar** | Vuelve a tirar los dados que quieras de tu reserva | 4 |
| **Doble jornada** | Coloca otro dado de tu reserva este turno (un turno menos) | 4 |
| **Remolcar** | Mueve una barca colocada, de cualquiera, a otra casilla vacía de isla. No recoge | 5 |
| **Cruzar** | Intercambia dos barcas colocadas con la misma figura. No recogen | 4 |
| **Amarrar** | Aparta un dado colocado, de cualquiera, hasta la ronda siguiente | 5 |
| **Volver a puerto** | Devuelve a tu reserva una barca tuya colocada (un turno más) | 5 |

Los usos que más estorban o más rinden (doble jornada, remolcar, amarrar) dan un punto menos por el mismo coste. Las cartas de 5 ingredientes llevan un punto extra.

| # | Nombre | Coste | Puntos | Uso |
|---|---|---|---|---|
| E01 | Brújula | 1 pescado, 1 sal (2) | 2 | Girar |
| E02 | Carta de mareas | 1 sal, 1 algas (2) | 2 | Girar |
| E03 | Sextante | 2 pescado, 1 sal (3) | 4 | Girar |
| E04 | Catalejo | 2 algas, 1 sal (3) | 4 | Girar |
| E05 | Astrolabio | 1 pescado, 1 sal, 2 algas (4) | 6 | Girar |
| E06 | Dados del puerto | 1 pescado, 1 algas (2) | 2 | Relanzar |
| E07 | Viento de cola | 2 sal, 1 algas (3) | 4 | Relanzar |
| E08 | Canción de faena | 2 pescado, 1 algas (3) | 4 | Relanzar |
| E09 | Fiesta del puerto | 1 pescado, 2 sal, 1 algas (4) | 5 | Relanzar |
| E10 | Faena nocturna | 1 pescado, 1 sal, 1 algas (3) | 3 | Doble jornada |
| E11 | Turno de guardia | 2 pescado, 2 sal (4) | 4 | Doble jornada |
| E12 | Jornada larga | 1 pescado, 3 algas (4) | 4 | Doble jornada |
| E13 | Gran pesquería | 2 pescado, 1 sal, 2 algas (5) | 6 | Doble jornada |
| E14 | Cabo de remolque | 1 pescado, 1 sal (2) | 1 | Remolcar |
| E15 | Corriente traidora | 2 algas (2) | 1 | Remolcar |
| E16 | Remolcador | 1 pescado, 2 sal (3) | 3 | Remolcar |
| E17 | Marejada | 1 pescado, 2 algas (3) | 3 | Remolcar |
| E18 | Deriva | 1 pescado, 2 sal, 1 algas (4) | 4 | Remolcar |
| E19 | Cambio de amarre | 1 sal, 1 algas (2) | 2 | Cruzar |
| E20 | Trueque de barcas | 2 pescado (2) | 2 | Cruzar |
| E21 | Rumbo cruzado | 1 sal, 2 algas (3) | 4 | Cruzar |
| E22 | Baile de proas | 1 pescado, 2 sal, 1 algas (4) | 5 | Cruzar |
| E23 | Nudo marinero | 1 pescado, 1 sal (2) | 1 | Amarrar |
| E24 | Ancla echada | 2 sal (2) | 1 | Amarrar |
| E25 | Red enredada | 2 pescado, 1 algas (3) | 3 | Amarrar |
| E26 | Puerto cerrado | 1 pescado, 1 sal, 2 algas (4) | 4 | Amarrar |
| E27 | Temporal | 2 pescado, 2 sal, 1 algas (5) | 5 | Amarrar |
| E28 | Regreso | 1 pescado, 1 algas (2) | 2 | Volver a puerto |
| E29 | Faro encendido | 2 sal, 1 algas (3) | 4 | Volver a puerto |
| E30 | Bocina del puerto | 1 pescado, 2 algas (3) | 4 | Volver a puerto |
| E31 | La lonja | 2 pescado, 1 sal, 1 algas (4) | 5 | Volver a puerto |
| E32 | Gran regata | 1 pescado, 2 sal, 2 algas (5) | 7 | Volver a puerto |

**Reparto.** 10 cartas de 2 ingredientes, 11 de 3, 8 de 4 y 3 de 5. Entre todas piden 32 pescados, 33 sales y 35 algas. Dan de 1 a 7 puntos, 111 en total (unos 3,5 por carta; en la versión 0.2 eran 89).

## 7. Cofradías (poderes de personaje)

Cuatro patrones con poder propio. Según MA11, no entran en la versión 1 (el formulario de sala todavía no envía opciones), pero quedan diseñados para una `1.1.0`. Cada uno se paga con perlas, salvo el último.

| Cofradía | Patrón | Poder |
|---|---|---|
| **La Rosa de los Vientos** | Iria, navegante | Una vez por ronda, por 1 perla, coloca una barca en una casilla de isla de otra figura y **recoge normalmente** (forzar, en cambio, no recoge) |
| **Los Hijos de la Red** | Bruno, pescador | Cuando recoges pescado en una isla, puedes pagar 1 perla para recoger 2 más |
| **La Lonja Vieja** | Celia, comerciante | Al apalabrar un encargo, puedes pagar 1 perla para mirar 3 cartas del mazo en lugar de 1 y quedarte una; las otras vuelven debajo |
| **El Faro del Cabo** | Tomás, viejo lobo de mar | Cada vez que un rival remolca, cruza o amarra una de tus barcas, ganas 1 perla y 1 ingrediente a elegir |

## 8. Lo que falta para cerrar el catálogo

1. **Equilibrio.** Los números son una primera propuesta razonada, sin probar. Con la construcción autorizada, la simulación del motor (ADR-023, MA4) da la tasa de victoria por asiento, los puntos medios por fuente (islas, encargos, aves, fichas, sobrantes) y qué cartas aparecen en las partidas ganadas. Ajustaré los valores con eso y te enseñaré los cambios antes de activar el juego.
2. **Escala de puntos.** Quien decide dio el 2026-11-21 la referencia de su ejemplar: el ganador suele hacer **de 60 a 65 puntos**; la media está **entre 40 y 60**; en una partida muy cerrada, entre 35 y 50, y con números altos, de 45 a 60. Es la escala objetivo de Mareas.

   **Estimación a mano** para quien gana, con unas 24 colocaciones por partida:

   | Fuente | Versión 0.1 | Versión 0.2 |
   |---|---|---|
   | Islas (unas 5 reclamadas) | ~17 | ~22 |
   | Encargos (unos 7 cumplidos, ~2,8 puntos cada uno) | ~20 | ~20 |
   | Aves (4 a 6, la mitad anidando en su estación) | ~11 | ~11 |
   | Poderes de aves que dan puntos | ~4 | ~4 |
   | Ingredientes sobrantes | ~1 | ~1 |
   | **Total** | **~53** | **~58** |

   La 0.1 se quedaba algo corta, así que en la 0.2 **cada isla vale 1 punto más** (de 3 a 8, que además es el rango que una reseña da para los bosques del original). Es una cuenta aproximada: la simulación del motor dirá la cifra real, y si se queda fuera de 55 a 65 para quien gana, se ajustan islas y encargos.
   **Resultado de la simulación (2026-11-21, versión 0.3).** El motor jugó partidas enteras con jugadores automáticos que eligen en cada paso la jugada que más les suma (`simulation.ts`). Con la 0.2, el ganador hacía de media unos 43 puntos y la media de todos, unos 36: los encargos puntuaban poco. En la **0.3, los 22 encargos de 3 o más ingredientes valen 1 punto más** (los de 2 ingredientes, con usos fuertes, se quedan igual). Con 30 partidas por número de jugadores:

   | Jugadores | Ganador (media, mín. y máx.) | Media de todos | Victorias por asiento |
   |---|---|---|---|
   | 2 | 48 (37 a 59) | 45 | 19 y 11 |
   | 3 | 48 (33 a 58) | 41 | 7, 12 y 11 |
   | 4 | 46 (35 a 60) | 39 | 8, 9, 7 y 7 |

   Por fuente, cada jugador saca de media unos 11 a 15 puntos de islas, 18 a 22 de encargos, 4 a 5 de aves, 1 a 5 de fichas y 2 de sobrantes. Contra dos jugadores al azar, el automático gana todas y hace de media 55. Una persona juega mejor que este automático, así que con la 0.3 se espera un ganador de **55 a 65**. Lo confirmará la primera partida de prueba; si se queda corta o larga, el siguiente ajuste es otra vez en los encargos.

3. **Nombres.** Los de las islas, las aves, los encargos y las cofradías son propuestas: cámbialos si quieres.
