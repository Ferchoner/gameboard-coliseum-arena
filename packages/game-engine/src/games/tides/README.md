# Mareas (`tides`, versión `1.0.0`)

Es el quinto juego de la plataforma: colocación de dados y control de islas, de 2 a 4 jugadores. Cada ronda, cada jugador tira sus barcas y sus dados de clima y los coloca de uno en uno; al final de la ronda, quien domina una isla se la queda. Las decisiones están en [ADR-023](../../../../../docs/adr/0023-mareas-colocacion-de-dados-y-control-de-islas.md) (MA1 a MA20) y el catálogo propio, en su [anexo](../../../../../docs/adr/0023-anexo-catalogo-mareas.md). Las reglas de la plataforma (relojes, retiradas y abandono) están en [ADR-009](../../../../../docs/adr/0009-reglas-de-dominio.md) y no se repiten aquí.

## Origen y nombre

Sus reglas siguen las del juego de mesa Brew, de Stevo Torres (Pandasaurus Games, 2021), sin ninguna relación con su autor ni con su editorial. El tema (un archipiélago de pescadores), los nombres, las islas, las aves, los encargos, el puerto y la presentación son propios; no se copia ninguna carta del original (ADR-023, MA1 a MA4). La marca no aparece en la aplicación, que muestra un aviso neutro: «Inspirado en un juego de mesa comercial. Si te gusta, apoya a sus autores comprando el original». No es asesoría legal.

## Piezas

- **Dados.** Cada jugador tiene 4 **barcas** (`0B0` a `0B3` para el asiento 0) y 2 dados de **clima** (`0W0` y `0W1`). Las barcas tienen dos caras de cada figura: **red** (`NET`), **ancla** (`ANCHOR`) y **vela** (`SAIL`). El clima, dos de cada: **calma** (`CALM`), **tormenta** (`STORM`) y **brisa** (`BREEZE`).
- **Ingredientes.** Pescado (`FISH`), sal (`SALT`) y algas (`ALGAE`), más la **perla** (`PEARL`), que vale por cualquiera al pagar. Cada jugador empieza con una perla.
- **Islas.** 20, de las cuatro estaciones (primavera, verano, otoño e invierno; dos son de dos estaciones). Con 2 jugadores entran las 12 marcadas «2+»; con 3, también las 4 «3+»; con 4, las 20. Cada casilla pide una figura de barca y da un ingrediente o un ave. Valen de 3 a 8 puntos.
- **Aves.** 36, en cuatro montones por estación: 12 tipos, 3 de cada. Cada estación tiene un ave con poder al colocar, una con casilla propia y una que da puntos.
- **Encargos.** 32, con su coste (2 a 5 ingredientes), sus puntos (1 a 7) y un uso de una vez.

El catálogo entero está en `catalog.ts` y en el anexo.

## Reglas

- **Preparación.** Se baraja el mazo de islas y el de encargos. Se ponen 4 encargos a la vista (el mercado). Las aves se barajan por estación.
- **Ronda.** Se sacan tantas islas como jugadores más una. El puerto está en **pleamar** las rondas impares y en **bajamar** las pares. Todos tiran sus seis dados. Empieza el asiento 0 en la primera ronda y, después, el siguiente cada ronda.
- **Turno.** Quien juega coloca **un dado** de su reserva y, antes o después, puede **cumplir un encargo** y **usar uno** de su mano, una vez cada cosa. Termina con `END_TURN`, o solo cuando ya no le queda nada que hacer. Un turno sin dados se salta; la ronda acaba cuando nadie tiene.
- **Barcas en las islas.** Van en una casilla vacía de su figura y recogen lo que da. En otra figura hay que **forzar**: se paga el ingrediente de la casilla o una perla (en una casilla de ave, solo perla) y no se recoge.
- **Clima en las islas.** Va en una casilla vacía y recoge. La **calma** recoge dos más. La **tormenta** puede ir encima de cualquier dado. La **brisa** puede ir encima de una barca propia, que vuelve a la reserva. Un dado de clima arriba cuenta en contra de quien domina (D8).
- **Dominar una isla.** Gana quien tiene más barcas arriba de sus pilas, si son más que los dados de clima de arriba. Con empate, nadie.
- **El puerto.** Cinco casillas: dos para cualquier dado, que no se bloquean, y una por cara de clima, que se usa una vez por ronda. Sus efectos cambian con la marea (anexo, sección 3). El clima no tiene poderes en el puerto.
- **Aves.** Una casilla de ave sube a bordo la carta de arriba del montón que se elija. Se llevan 3 como mucho: con la cuarta, se suelta una. Las aves a bordo tienen su poder; las sueltas, no. Un ave suelta **anida** en una isla reclamada de su estación, una por isla, en el propio turno o sola al final.
- **Encargos.** Se cumplen pagando su coste justo; la perla cubre cualquier ingrediente. El mercado se repone con el mazo, salvo si el encargo estaba apalabrado (B4). **Apalabrar** revela la carta de arriba: se queda esa o una del mercado, que se repone con la revelada. Usar un encargo lo gira; si el mazo se acaba, los usados se barajan y su dueño se anota sus puntos otra vez (MA15).
- **Bajíos.** Tapan una casilla vacía durante la ronda (B2).
- **Fin de ronda.** Cada isla dominada va a quien la domina; las demás se descartan. Puntúan el Alca y el Flamenco. Todos los dados vuelven a su dueño, estén donde estén (B6).
- **Final.** Cuando el mazo de islas no da para una fila completa (B1): 4 rondas con el mazo de la versión 1.
- **Puntuación.** Islas reclamadas, encargos cumplidos, aves (3 si anidan, 1 si no), las fichas de puntos y 1 punto por cada grupo completo de 3 ingredientes que sobran (B3). Gana quien tiene más puntos; con empate, quien tiene más sobrantes; si siguen empatados, comparten la victoria.
- **Opcional u obligatorio.** Lo que dice «puede» es opcional; lo demás, obligatorio (B7).

## Retiradas

- **Con 2:** pierde quien se retira y gana el otro.
- **Con 3 o 4:** sus barcas salen de las islas y la partida sigue sin su asiento; los dados de clima que puso se quedan. Pierde al final. Si queda uno solo, gana (MA13).

## Azar

El motor arranca un generador con la semilla que le da la plataforma (`src/random.ts`). Con él baraja los mazos, tira los dados y vuelve a tirarlos. El estado del generador va dentro del estado del juego, así que cada transición es determinista.

## Opciones

Ninguna en la versión 1 (MA11). `parseSettings` solo acepta el objeto vacío `{}`. Las cofradías del anexo quedan para otra versión.

## Controles de tiempo

- **Tiempo real:** 15, 20 o 30 minutos por jugador.
- **Por turnos:** no, en la versión 1 (MA12).

## Acciones

```json
{ "type": "PLACE", "die": "0B2", "target": { "kind": "ISLAND", "island": 1, "space": 0 } }
{ "type": "PLACE", "die": "0B2", "target": { "kind": "ISLAND", "island": 1, "space": 2 }, "force": "PEARL" }
{ "type": "PLACE", "die": "0W0", "target": { "kind": "PORT", "space": "CALM" } }
{ "type": "PLACE", "die": "0B1", "target": { "kind": "BIRD", "bird": "B13" } }
{ "type": "FULFIL", "order": "E14", "payment": { "FISH": 1, "PEARL": 1 } }
{ "type": "USE", "order": "E16", "die": "1B0", "to": { "island": 2, "space": 1 } }
{ "type": "NEST", "bird": "B30", "island": "I08" }
{ "type": "RESOLVE", "season": "WINTER" }
{ "type": "END_TURN" }
{ "type": "ROUND_CHOICES", "flamingo": 1 }
```

`island` es la posición de la isla en la fila. Lo que lleva `USE` según el uso del encargo, y `RESOLVE` según la decisión pendiente, está en `types.ts`. Mientras hay una decisión pendiente, solo vale `RESOLVE`. `ROUND_CHOICES` solo vale en la fase de fin de ronda, cuando alguien lleva un Flamenco y puede pagarlo; esa fase es simultánea.

## Eventos de juego

Son públicos (contrato, M8): `ROUND_STARTED`, `DICE_ROLLED`, `DIE_PLACED`, `GATHERED`, `BIRD_BOARDED`, `BIRD_RELEASED`, `BIRD_NESTED`, `ORDER_PROMISED`, `ORDER_FULFILLED`, `ORDER_USED`, `DIE_MOVED`, `DIE_SET_ASIDE`, `DIE_RETURNED`, `SHOAL_PLACED`, `POINTS_GAINED`, `TURN_ENDED`, `ISLAND_CLAIMED`, `ISLAND_DISCARDED`, `ORDERS_RESHUFFLED`, `SEAT_RETIRED` y `GAME_SCORED`. Su contenido está en `types.ts`. Ninguno lleva la carta revelada al apalabrar hasta que se queda.

## Vista

`TidesView`, en `types.ts`. Todo es público (MA10), también la mano de encargos, salvo la carta revelada al apalabrar: solo la ve quien decide. Lleva la fila con sus pilas, bajíos y quién domina cada isla; el puerto; el mercado; la carta de arriba de cada montón de aves; de cada asiento, su reserva, lo apartado, sus ingredientes, aves, encargos, islas y puntos; el turno, la decisión pendiente y, al final, los ganadores.

## Motivos de rechazo

Con el código `INVALID_ACTION`:

| Motivo | Cuándo |
|---|---|
| `MALFORMED_ACTION` | La acción no tiene la forma de arriba |
| `DIE_NOT_IN_POOL` | El dado no está en la reserva propia |
| `SPACE_OCCUPIED` | La casilla ya tiene un dado y este no puede ir encima |
| `SPACE_SHOALED` | La casilla tiene un bajío |
| `FACE_MISMATCH` | La cara no corresponde a la casilla |
| `CANNOT_FORCE` | Forzar con lo que no toca, o donde no hace falta |
| `CANNOT_AFFORD` | No alcanza para pagar |
| `ALREADY_PLACED` | Ya colocó en este turno |
| `ALREADY_FULFILLED` / `ALREADY_USED` | Ya cumplió o usó un encargo en este turno |
| `MUST_PLACE_FIRST` | Terminar el turno sin haber colocado |
| `PENDING_DECISION` / `NO_PENDING_DECISION` | Hay una decisión por resolver, o no hay ninguna |
| `ORDER_NOT_AVAILABLE` | El encargo no está en el mercado, ni apalabrado, ni en la mano |
| `BAD_TARGET` | La casilla, el dado o la isla no existen o no valen para eso |
| `NEST_NOT_ALLOWED` | El ave no puede anidar en esa isla |
| `PORT_SPACE_USED` | Esa casilla del puerto ya se usó en la ronda |
| `NOT_YOUR_BIRD` | El ave no está a bordo del propio asiento |
| `BAD_PAYMENT` | El pago no es el coste justo |
| `BAD_CHOICE` | La elección no vale para la decisión pendiente |
| `WRONG_PHASE` | La acción no corresponde a la fase de la ronda |

Cualquier acción de un asiento al que no le toca se rechaza con `NOT_YOUR_TURN`.

## Equilibrio

`simulation.ts` juega partidas enteras con jugadores automáticos (MA19). Con jugadores voraces de un paso, el ganador hace de media unos 47 puntos y la media de todos ronda los 40, con 2, 3 y 4 jugadores; las victorias se reparten entre asientos. Una persona juega mejor que esos automáticos, así que se espera un ganador de 55 a 65 puntos, la escala buscada. `legal.ts` da las jugadas posibles de un asiento; lo usan las pruebas y la simulación.
