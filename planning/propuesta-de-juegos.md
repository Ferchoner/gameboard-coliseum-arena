# Propuesta: los próximos juegos de la plataforma

| Campo | Valor |
|---|---|
| **Estado** | Aceptada el 2026-11-19 por Fernando Hernandez Argueta, con un cambio: eligió **Batalla naval y Dominó**, sin Damas (F1). F3 a F9, aceptadas tal como se recomiendan; F2, retirada. Batalla naval y T-23 se autorizaron el mismo día ([ADR-019](../docs/adr/0019-batalla-naval-y-jugadas-simultaneas.md)); el Dominó, todavía no |
| **Fecha** | 2026-11-19 |
| **Revisado sobre** | `main` en `b9c1e54` (tras la PR #12 y ADR-018) |
| **Cierra** | El resto del pendiente 12 (derechos de arte y selección de juegos futuros, ADR-008, sección 4) |
| **Decisiones** | Recogidas en [ADR-019](../docs/adr/0019-batalla-naval-y-jugadas-simultaneas.md), sección 0. En la conversación se llamaron J1 a J9; aquí son F1 a F9, porque J1 a J5 ya nombran los ajustes del catálogo de errores |

*Añadida el 2026-11-21:* después de esta propuesta llegaron, cada uno con su ADR y fuera de esta lista, [Cinco a ciegas](../docs/adr/0022-cinco-a-ciegas-y-jugadas-fuera-de-turno.md) (ADR-022) y [Mareas](../docs/adr/0023-mareas-colocacion-de-dados-y-control-de-islas.md) (ADR-023), juego de colocación de dados con las reglas de un juego comercial y tema, cartas y personajes propios.

---

## 1. Resumen

> **Decisión F1 (2026-11-19):** quien decide eligió **Batalla naval y Dominó**. Damas queda fuera y con ella la pregunta F2. Lo que sigue sobre Damas se conserva como referencia de la propuesta original. Orden recomendado ahora: primero Batalla naval y después Dominó (sección 9).

La propuesta original recomendaba **tres juegos, en este orden**, porque cada uno pone a prueba una sola cosa nueva de la plataforma y el riesgo crece poco a poco:

| Orden | Juego | Jugadores | Lo nuevo que valida | Cambios en la plataforma |
|---|---|---|---|---|
| 1 | **Damas** | 2 | Que añadir un juego sigue la guía sin tocar nada común (ADR-018). Jugadas de varios saltos y tablas por regla | Ninguno |
| 2 | **Batalla naval** | 2 | Información oculta (cada uno ve solo su flota) y una fase de jugadas simultáneas (los dos colocan la flota a la vez) | T-23: jugadas simultáneas. Enmienda del protocolo |
| 3 | **Dominó** | 2 a 4 (4 en parejas) | Azar con la semilla guardada (Z1), mano oculta y más de dos jugadores | T-24: asientos retirados. Decidir W6 |

Las tres son mecánicas tradicionales, sin dueño, con nombres genéricos en español. Las tres caben en las dos modalidades (tiempo real hasta 30 minutos por jugador; por turnos con 12, 24 o 36 horas). Las tres son conocidas en México, que es donde estará el piloto.

Con las tres, la plataforma habría probado todo lo que su diseño promete y hoy solo existe en el papel: información oculta, jugadas simultáneas, azar y más de dos jugadores (`docs/01-vision-alcance.md`, línea 17; anexo de juego online, sección 3.5).

Si se prefieren solo dos, la recomendación es **Damas y Dominó**: el Dominó cubre azar, información oculta y más de dos jugadores, y solo quedaría sin validar la jugada simultánea.

---

## 2. Lo que ya está decidido y condiciona la elección

Esto **está aprobado** y la propuesta lo respeta tal como está:

| Qué | Dónde |
|---|---|
| Un juego nuevo llega con su motor y su tablero, entra **inactivo** y se activa desde la administración después de desplegar el frontend | Decisión del 2026-11-16 sobre el catálogo; ADR-018, Z6 y Z8; `docs/guia-nuevo-juego.md` |
| Reloj de **tiempo total por jugador**: hasta 30 minutos en tiempo real; 12, 24 o 36 horas por turnos. El servidor no arranca si un motor declara otra cosa | Regla 7.2; ADR-016, N1; ADR-018, Z4 |
| Motor puro y determinista; el azar sale de la semilla que da la plataforma, que ahora se guarda con la partida | Contrato del motor, M7; ADR-018, Z1 |
| Los eventos de juego son públicos; lo privado solo viaja en la vista de cada asiento | Contrato del motor, M8 |
| Servidor autoritativo: el frontend no decide si una jugada vale ni ejecuta el motor | ADR-014, K7 |
| En un juego de dos, quien se retira pierde y gana el otro | Regla 7.18; contrato, M11 |
| Resultado por asiento: `WIN`, `LOSS` o `DRAW`. Las estadísticas cuentan jugadas, ganadas, perdidas y empatadas | Regla 7.16; ADR-017 |
| Nombres genéricos y arte propio; no usar marcas registradas. "Connect Four" se descartó por eso | ADR-008, sección 4 |
| Sin bots ni juego en solitario en el MVP | ADR-008, punto 20 |
| Sin dependencias nuevas sin justificar | Reglas del proyecto |

## 3. Criterios

1. **Derechos limpios.** Mecánica tradicional o de dominio público, nombre genérico, arte y textos propios.
2. **Encaje en el reloj total.** Que una partida normal quepa en 30 minutos por jugador en tiempo real y tenga sentido por turnos.
3. **Pocos jugadores bastan.** El piloto tendrá pocos usuarios: un juego que exige cuatro personas a la vez casi nunca llenará una sala.
4. **Valida algo nuevo.** Cada juego debería ejercitar una capacidad que Cuatro en raya no usa.
5. **Coste acotado.** Reglas cerradas, sin ambigüedades que obliguen a decisiones largas.
6. **Conocido por los jugadores del piloto.**

## 4. Qué admite hoy la plataforma y qué falta

Comprobado en `main` (`b9c1e54`):

| Capacidad | Estado hoy | Lo que falta | Tarea |
|---|---|---|---|
| Dos jugadores, sin azar ni información oculta | Completo | Nada | |
| Información oculta | El motor da una vista por asiento y cada conexión recibe solo la suya | Una prueba en navegador que lo compruebe (la guía lo recomienda, sección 4) | Con el juego |
| Azar reproducible | Semilla generada por la plataforma y guardada en `matches.seed` (Z1) | Nada | |
| Jugadas simultáneas | El contrato las admite (M10) | La segunda jugada sobre la misma versión se rechaza como obsoleta, y el reloj vencido de un asiento rechaza la jugada de otro | **T-23**, 1 a 2 días, con enmienda del protocolo |
| Más de dos jugadores | Salas de N plazas, colores para 6 asientos, revancha que rota asientos con cualquier número | La plataforma no impide retirar dos veces el mismo asiento en una partida que sigue; falta decidir si quien abandona sale de la sala (W6) | **T-24**, 1 día; **W6** |
| Opciones de juego (`settings`) | La API las acepta y el motor las valida (M6) | El formulario de crear sala no las envía | Solo si un juego tiene opciones |
| Número de jugadores no contiguo (por ejemplo, "2 o 4") | Los metadatos son un rango; el formulario ofrece todos los valores entre el mínimo y el máximo | Cambiar el contrato | No hace falta (ver Dominó) |
| Tablas por acuerdo, ofrecer y aceptar | No existe: solo el asiento activo puede jugar | Una orden nueva de la plataforma | No hace falta en la versión 1 |
| Incremento por jugada (reloj tipo Fischer) | No existe: el reloj es tiempo total | Cambiar el reloj | Solo para ajedrez |

**Recomendación:** que la versión 1 de cada juego no tenga opciones (`settings` vacío, como Cuatro en raya). Así no hace falta el formulario de opciones, y una variante se puede añadir después como versión nueva del motor.

---

## 5. Los tres recomendados

Las estimaciones son una aproximación mía a partir del tamaño de Cuatro en raya y de lo que pide la guía; no están medidas.

### 5.1 Damas

**Reglas propuestas para la versión 1:** tablero de 8 × 8, 12 piezas por bando, captura obligatoria, saltos múltiples en una sola jugada, coronación al llegar al fondo. La variante exacta es una decisión pendiente (F2).

| | |
|---|---|
| **A favor** | La más conocida de las candidatas. Dos jugadores y sin azar: no toca la plataforma, así que valida la guía de ADR-018 de punta a punta (motor, migración inactiva, tablero, activación). Partida de 20 a 40 jugadas por jugador: cabe en 5, 10 o 15 minutos y por turnos |
| **En contra** | No valida nada nuevo de la plataforma. Las reglas de tablas (repetición de posición, muchas jugadas sin capturar) obligan a guardar historial dentro del estado. Las variantes cambian mucho de un lugar a otro |
| **Diseño del motor** | Una acción por jugada completa: `{ "type": "MOVE", "path": [[2,1],[4,3],[6,5]] }`, con todo el recorrido de los saltos. Así un salto múltiple es una sola jugada, un solo cambio de versión y un solo registro en `match_actions`. La vista incluye las jugadas legales del asiento activo, como hoy las columnas libres de Cuatro en raya. Pierde quien no puede mover. Tablas por regla, sin tablas por acuerdo en la versión 1 |
| **Controles de tiempo** | Tiempo real: 5, 10 y 15 minutos. Por turnos: 12, 24 y 36 horas |
| **Derechos** | Juego tradicional, de dominio público. "Damas" es genérico. Tablero y piezas dibujados en CSS o SVG propios |
| **Coste** | Motor y pruebas: 1,5 días. Tablero: 1 día. Sin cambios comunes |
| **Identificador** | `checkers` (el que ya usa de ejemplo la guía) |

### 5.2 Batalla naval

**Reglas propuestas para la versión 1:** tablero de 10 × 10 por jugador y flota de cinco barcos (5, 4, 3, 3 y 2 casillas), sin barcos tocándose. Primero los dos colocan su flota a la vez; después disparan por turnos, un disparo por turno (F4). Gana quien hunde toda la flota rival.

| | |
|---|---|
| **A favor** | Es el juego más pequeño que valida a la vez dos cosas que el diseño promete y que nadie ha probado: **información oculta** (la vista de cada asiento no lleva los barcos del otro; los eventos de disparo dicen agua, tocado o hundido, que es público) y una **fase simultánea** (los dos asientos activos a la vez). Dos jugadores, así que no necesita T-24. No tiene azar en el motor: el botón "colocar al azar" puede vivir en el tablero, porque solo propone una colocación que el servidor valida |
| **En contra** | Necesita **T-23** y una enmienda del protocolo (sección 4, paso 5), que son cambios de contrato y piden su propia autorización. Mucho tablero de interfaz (dos cuadrículas, colocar, girar) y en el móvil el espacio es justo |
| **Alternativa** | Colocar la flota por turnos, primero un asiento y luego el otro. Evita T-23, pero deja sin validar las jugadas simultáneas, que es justo lo que este juego aporta. No la recomiendo |
| **Diseño del motor** | Dos acciones: `PLACE_FLEET` con la flota entera de una vez, y `FIRE` con una casilla. En la fase de colocación, `activeSeats` son los dos asientos. El evento de colocación no lleva posiciones (M8). La vista sin asiento (`getView(null)`) no muestra ninguna flota |
| **Controles de tiempo** | Tiempo real: 5, 10 y 15 minutos. Por turnos: 12, 24 y 36 horas. En la colocación corren los dos relojes, que es lo que precisa T-23 |
| **Derechos** | "Battleship" es una marca de un fabricante de juguetes; el juego de lápiz y papel es anterior y la mecánica es genérica. Usar solo "Batalla naval", con barcos y tablero propios. No es asesoría legal |
| **Coste** | Motor y pruebas: 1 día. Tablero: 1,5 días. T-23: 1 a 2 días. Prueba en navegador de información oculta y fase simultánea: medio día |
| **Identificador** | `naval-battle` |

### 5.3 Dominó

**Reglas propuestas para la versión 1:** fichas del doble seis (28). Con 2 o 3 jugadores, siete fichas cada uno y las demás al pozo, del que se roba si no se puede jugar. Con 4, en parejas (asientos 0 y 2 contra 1 y 3), siete cada uno y sin pozo. Si nadie puede jugar, la mano se cierra (tranque) y gana quien suma menos puntos. La partida dura una mano o varias hasta un tanteo (F6).

| | |
|---|---|
| **A favor** | Muy conocido en México y el más social de los tres. Es el que más ejercita la plataforma: **azar** con la semilla que Z1 ya guarda (barajar y repartir), **mano oculta** (cada vista lleva solo las fichas propias y cuántas tienen los demás; robar del pozo genera un evento público sin la ficha, M8) y **más de dos jugadores**. Las parejas salen de la rotación de asientos que ya existe: en la revancha cada pareja sigue junta |
| **En contra** | Es el más caro. Con 3 jugadores, si uno se retira la partida debe seguir con los otros dos: eso necesita **T-24** y decidir **W6** (si quien abandona sale de la sala). Una sala de 4 se llenará poco en un piloto pequeño, por eso se ofrecen también 2 y 3. La compañera o el compañero se sortea: elegir pareja necesitaría algo nuevo en las salas |
| **Retiradas** | Con 2: la regla 7.18. Con 4 en parejas: si se retira uno, pierden los dos asientos de su pareja, así que la partida termina y no hay asiento retirado que siga. Con 3: las fichas del retirado salen del juego y siguen los otros dos (esto es lo que necesita T-24) |
| **Diseño del motor** | Acciones: `PLAY_TILE` (ficha y extremo) y `DRAW`. Si un asiento no puede jugar ni robar, el motor pasa por él solo y lo anuncia con un evento: nadie gasta un día de turno en pasar. El estado del generador va dentro del estado (M7) para las manos siguientes |
| **Controles de tiempo** | Tiempo real: 10, 15 y 20 minutos si la partida va a tanteo; 3, 5 y 10 si es una mano. Por turnos: 12, 24 y 36 horas |
| **Derechos** | Juego tradicional, sin dueño. Fichas dibujadas con puntos propios |
| **Coste** | Motor y pruebas: 2 días. Tablero (la cadena de fichas que gira en pantallas pequeñas es lo difícil): 2 días. T-24: 1 día. Prueba en navegador con 3 o 4 jugadores: medio día |
| **Identificador** | `dominoes` |

### Total aproximado

Unos 12 a 14 días de trabajo para los tres, incluidos T-23 y T-24. Damas sola, unos 2,5 días.

---

## 6. Candidatos descartados por ahora

| Juego | Por qué no ahora |
|---|---|
| **Reversi** | Barato (1,5 días) y de derechos limpios con ese nombre ("Othello" es marca). Pero no valida nada que no valide Damas y es menos conocido. **Es el sustituto natural de Damas** si se quiere el primer juego más pequeño |
| **Timbiriche** (puntos y cajas) | Muy conocido en México, barato y admite de 2 a 4 jugadores con turno extra al cerrar una caja. Buen sustituto del Dominó si se quiere más de dos jugadores sin azar ni información oculta |
| **Damas chinas** | De 2 a 6 jugadores, sin azar. Valida más de dos jugadores, pero las partidas de 6 son largas y una sala de 6 casi nunca se llenaría en el piloto |
| **Ajedrez** | Reglas grandes (enroque, captura al paso, tablas por repetición) y los jugadores esperan incremento por jugada y tablas por acuerdo, que la plataforma no tiene. Una librería ahorraría el motor, pero es una dependencia nueva que habría que justificar. Mejor después del MVP |
| **Cinco en raya** (gomoku) | Demasiado parecido a Cuatro en raya: no aporta nada |
| **Parchís o Ludo** | Azar y 2 a 4 jugadores, pero mucha suerte y reglas que cambian de casa en casa. "Parcheesi" es marca; "Parchís" y "Ludo" son genéricos. El Dominó cubre lo mismo y es más conocido |
| **Lotería mexicana** | Muy conocida, pero las cartas clásicas tienen dueño y habría que dibujar 54 propias. El ritmo lo marca quien canta, no un reloj por jugador, así que no encaja en las modalidades |
| **Mancala u oware** | Barato y tradicional, pero poco conocido en el piloto ("Kalah" fue marca; "mancala" es el nombre de la familia) |
| Juegos comerciales (Scrabble, Uno, Stratego, Mastermind, Catan…) | Tienen dueño. Hasta las versiones "parecidas" arriesgan marca y aspecto. Fuera |

---

## 7. Derechos: regla que se propone para todos los juegos (cierra P12)

Recomendación, sin aprobar. No es asesoría legal.

1. Solo mecánicas tradicionales o de dominio público.
2. Nombre público genérico en español e identificador genérico en inglés (convención 9.5). Nunca una marca, ni en el nombre ni en los identificadores ni en los textos.
3. Arte propio: tablero, fichas y piezas dibujados en CSS o SVG dentro del repositorio. Ni imágenes ni tipografías de terceros sin una licencia que lo permita y que quede anotada.
4. Reglas escritas por nosotros en el `README.md` del motor, sin copiar el reglamento de una edición comercial.
5. Antes de dar de alta un juego, una línea en su `README.md` que diga de dónde vienen sus reglas y por qué el nombre es genérico.

---

## 8. Decisiones

*El 2026-11-19 quien decide eligió Batalla naval y Dominó (F1) y aceptó F3 a F9 tal como se recomiendan aquí. F2 se retiró.*

| ID | Pregunta | Recomendación |
|---|---|---|
| **F1** | ¿Qué juegos y en qué orden? | **Decidido el 2026-11-19: Batalla naval y Dominó.** Orden recomendado: primero Batalla naval, que es más pequeña y de dos jugadores; después Dominó |
| ~~F2~~ | *Retirada: Damas no entra.* ¿Qué reglas de damas? Las inglesas (la dama avanza una casilla, sin captura máxima obligatoria) o las españolas (la dama recorre la diagonal y es obligatorio capturar el máximo de piezas) | Las que jueguen las personas del piloto. No sé con certeza cuál es la más común en México; si no hay preferencia, las inglesas, que son las más sencillas y están mejor documentadas. La otra puede llegar después como versión nueva |
| **F3** | ¿La versión 1 de cada juego sin opciones (`settings` vacío)? | Sí. Evita el formulario de opciones; las variantes, como versiones nuevas |
| **F4** | Batalla naval: ¿un disparo por turno, o se sigue disparando mientras se acierta? | Un disparo por turno: partidas más parejas y turnos predecibles por turnos |
| **F5** | Batalla naval: ¿colocación simultánea con T-23, o por turnos sin T-23? | Simultánea con T-23, porque es lo que este juego valida |
| **F6** | Dominó: ¿una mano por partida, o varias hasta 100 puntos? | Hasta 100 puntos en tiempo real y por turnos. Una sola mano es demasiado corta para una sala por turnos |
| **F7** | Dominó: ¿2, 3 y 4 jugadores (4 en parejas), o solo 2 en la versión 1? | 2 a 4. Con solo 2 se pierde lo que más interesa validar, y el formulario no admite "2 o 4" sin cambiar el contrato |
| **F8** | W6: con más de dos jugadores, ¿quien pierde por abandono sale de la sala aunque la partida siga? | Que se quede en la sala como retirado hasta que la partida termine, sin contar para su límite de partidas (7.30). Evita una operación de sala nueva. Se cierra al diseñar T-24 |
| **F9** | ¿Se acepta la regla de derechos de la sección 7? | Sí |

## 9. Qué habría que autorizar, y cuándo

Esta propuesta **no autoriza código**. Si se acepta, se haría así, cada paso con su autorización:

1. **Batalla naval.** Un ADR con F3 a F5 y lo que precise T-23. La enmienda del protocolo para T-23 es un cambio de contrato y se autoriza aparte. Después, el código: T-23 y el juego, con motor, tablero, migración inactiva y pruebas.
2. **Dominó.** Un ADR con F6 a F8 y lo que precise T-24. Después, el código: T-24 y el juego.

Sin Damas, el primer juego nuevo ya trae un cambio en la plataforma (T-23). Por eso conviene que T-23 vaya en su propia PR, antes de la del juego: si algo falla, se sabe si es de la plataforma o del juego.

Este trabajo no choca con las pruebas en local del Hito 7, que se llevan en otro hilo: los juegos nuevos entran inactivos y se pueden activar en el equipo local para probarlos.

---

## Fuentes revisadas

- `docs/adr/0008-alcance-del-mvp.md` (sección 4), `docs/adr/0018-preparacion-del-segundo-juego.md`, `docs/guia-nuevo-juego.md`.
- `contracts/03-game-engine.md` (decisiones M6 a M11 y asuntos abiertos de la sección 7).
- `planning/analisis/anexos/4-videojuegos-online.md` (GO-6, GO-7 y sección 3.5) y el informe de análisis (T-23 y T-24).
- `docs/adr/0015-decisiones-del-hito-4.md` (W6).
- Código: `apps/frontend/app/components/RoomCreateForm.vue` (el formulario no envía opciones), `apps/frontend/app/utils/rooms.ts` (número de jugadores como rango), `apps/backend/src/modules/game-sessions/seats.ts` (rotación de asientos para N jugadores), `apps/frontend/app/assets/css/main.css` (colores para 6 asientos).
