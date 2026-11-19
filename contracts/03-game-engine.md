# Contrato del motor de juego, versión 1: notas

| Campo | Valor |
|---|---|
| **Estado** | Versión 1, aceptada el 2026-11-15 por Fernando Hernandez Argueta. Enmendada el 2026-11-19 con precisiones de ADR-014, ADR-016 y ADR-018, sin cambiar la interfaz |
| **Contrato** | [`packages/game-engine/src/contract.ts`](../packages/game-engine/src/contract.ts). Contiene solo tipos, sin lógica. Hasta el Hito 1 era `contracts/03-game-engine.ts` |
| **Sustituye a** | El contrato de referencia preliminar |
| **Aplica** | ADR-001 (condición 5.5), ADR-007 (acuerdos B2 y B3), ADR-009 (reglas 7.7, 7.8 y 7.16 a 7.18), ADR-010 (reglas 8.1, 8.2 y 8.5), ADR-011 (convenciones 9.5, 9.7, 9.9 y 9.19) y el modelo de datos (decisión R1) |
| **Resuelve** | Hallazgos C-12, C-14 y C-15; vacíos G-06 y G-10 |

**Cómo leer este documento.** El contrato es el archivo TypeScript. Este documento explica qué hace cada parte, cómo lo usa la plataforma y qué decisiones de diseño contiene. Las decisiones de diseño propias de este entregable están en la [sección 5](#5-decisiones-de-diseño-propias-de-este-entregable).

---

## 1. Qué es el motor

El motor de un juego contiene sus reglas y nada más. Recibe un estado y una acción, y devuelve el estado siguiente. No sabe quién juega, cuánto tiempo queda, cómo se guarda la partida ni cómo llega a los clientes. Todo eso es trabajo de la plataforma.

Las seis reglas que debe cumplir están en la cabecera del contrato: puro y determinista, aislado, inmutable, con estado serializable, sin identidades y sin tiempo.

## 2. Las siete operaciones

| Operación | Qué hace | Cuándo la llama la plataforma |
|---|---|---|
| `parseSettings` | Valida las opciones del juego y las devuelve con su tipo | Al crear una sala |
| `createInitialState` | Crea el estado inicial a partir del número de asientos, las opciones y la semilla | Al empezar una partida |
| `restoreState` | Comprueba que un snapshot guardado es un estado válido | Cada vez que lee una sesión de juego de la base de datos para aplicarle una orden. No hay copia en memoria. *Precisada el 2026-11-19 (ADR-014, K2)* |
| `getStatus` | Dice qué asientos pueden jugar ahora o, si el juego terminó, el resultado de cada asiento | Tras crear el estado y tras cada jugada |
| `applyAction` | Valida y aplica una acción. Devuelve el estado nuevo, la acción aceptada y los eventos de juego, o un rechazo | Cuando llega una jugada |
| `retireSeat` | Retira un asiento por tiempo agotado, rendición o abandono. El juego decide si termina o continúa con los demás | Cuando la capa de sesión detecta uno de esos tres casos |
| `getView` | Devuelve lo que un asiento puede ver del estado | Antes de enviar el estado a cada cliente |

Además, cada motor declara su nombre corto, su versión y sus **metadatos**: mínimo y máximo de jugadores, y los controles de tiempo que admite en cada modalidad.

## 3. Cómo lo usa la plataforma

### Crear una sala

1. La plataforma obtiene el motor de la versión vigente del juego.
2. Comprueba la capacidad pedida contra `minPlayers` y `maxPlayers`, y que el control de tiempo elegido figura entre los que el motor admite para esa modalidad.
3. Llama a `parseSettings` con las opciones recibidas. Si las rechaza, la sala no se crea.

### Empezar una partida

1. La plataforma asigna los asientos (9.19) y genera la semilla.
2. Llama a `createInitialState` y después a `getStatus` para saber qué asientos pueden jugar primero.
3. Guarda el estado, la versión 0, los relojes y los asientos activos, en la transacción de inicio de partida del modelo de datos.

### Una jugada

1. La plataforma identifica al jugador por su sesión de autenticación y lo traduce a su asiento. Comprueba que la versión del estado que indica la jugada es la actual (8.11) y que su reloj no está agotado (7.5).
2. Llama a `applyAction`. Si el motor la rechaza, responde con el error solo a quien la envió y no guarda nada.
3. Si la acepta, llama a `getStatus` sobre el estado nuevo.
4. Guarda en una sola transacción el estado nuevo, la versión, los relojes y la acción aceptada. Si el juego terminó, guarda también el resultado (8.7, 8.14).
5. Una vez confirmada la transacción, llama a `getView` para cada asiento y envía a cada cliente su vista junto con los eventos de juego (8.9).

### Recuperar una partida

Al cargar una sesión de juego desde la base de datos, la plataforma llama a `restoreState` con el snapshot. Si el motor lo rechaza, la partida no puede continuar y se anula por fallo técnico (7.20).

### Retirar un asiento

El tiempo agotado, la rendición y el abandono los detecta la capa de sesión, no el motor. Cuando ocurre uno:

1. La plataforma llama a `retireSeat` con el asiento y el motivo.
2. Llama a `getStatus` sobre el estado nuevo.
3. Si el juego terminó, guarda el final de la partida con ese motivo y con los resultados por asiento que da el motor.
4. Si el juego continúa, guarda el estado nuevo y sigue la partida con los demás asientos.

En un juego de dos jugadores siempre ocurre lo primero: pierde el asiento retirado y gana su rival (7.18). En un juego de más jugadores, cada juego decide según sus reglas.

## 4. Ejemplo ilustrativo: Cuatro en raya

Este ejemplo no forma parte del contrato. Muestra cómo encajan los tipos de un juego concreto. Los nombres y valores definitivos se fijaron al implementar el juego, en el Hito 3, y coinciden con este ejemplo: están en [`packages/game-engine/src/games/four-in-a-row/`](../packages/game-engine/src/games/four-in-a-row/types.ts), con los motivos de rechazo `MALFORMED_ACTION`, `COLUMN_OUT_OF_RANGE` y `COLUMN_FULL` (ADR-014, K6).

| Tipo | En Cuatro en raya |
|---|---|
| Opciones | Ninguna. `parseSettings` solo acepta un objeto vacío |
| Estado | El tablero de 7 columnas por 6 filas, con el asiento que ocupa cada casilla, y el asiento al que le toca |
| Acción | Soltar una ficha en una columna |
| Evento de juego | Ficha colocada, con su asiento, columna y fila |
| Vista | El tablero completo, las columnas en las que se puede jugar y, si hay ganador, la línea ganadora. Como no hay información oculta, todos los asientos ven lo mismo |
| Metadatos | Dos jugadores como mínimo y como máximo. Admite las dos modalidades |

Una acción, tal como la envía el cliente:

```json
{ "type": "DROP_TOKEN", "column": 3 }
```

Un rechazo del motor cuando la columna está llena:

```json
{ "ok": false, "code": "INVALID_ACTION", "reason": "COLUMN_FULL" }
```

La situación del juego tras la jugada que alinea cuatro fichas del asiento 0:

```json
{
  "finished": true,
  "results": [
    { "seat": 0, "outcome": "WIN" },
    { "seat": 1, "outcome": "LOSS" }
  ]
}
```

---

## 5. Decisiones de diseño propias de este entregable

Estas decisiones no derivan de un ADR: se tomaron al escribir el contrato. Fueron **aceptadas el 2026-11-15** por Fernando Hernandez Argueta.

| ID | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| M1 | **El motor conoce asientos, no jugadores.** La plataforma traduce entre jugador y asiento | Pasar al motor los identificadores de jugador, como hacía el contrato preliminar | El motor queda libre de identidades y el estado guardado no contiene datos de personas. Resuelve parte del hallazgo C-15 |
| M2 | **Una sola vía para validar una acción:** `applyAction` valida y aplica. Desaparece `validateAction` | Mantener las dos | Las dos devolvían el mismo fallo con formas distintas, y podían discrepar (C-15) |
| M3 | **`getStatus` es la única fuente** para saber quién puede jugar, si el juego terminó y con qué resultado. Sustituye a `currentTurn`, `isFinished`, `getResult` y al resultado dentro de `applyAction` | Mantener las cuatro | Cada dato tenía varias fuentes que podían no coincidir (C-15) |
| M4 | **El estado es un valor JSON plano y opaco para la plataforma.** Desaparecen el envoltorio común de estado y `serializeState`. `restoreState` valida el snapshot | Mantener un envoltorio con fase, jugadores y metadatos | El envoltorio repetía datos que la plataforma ya guarda en sus tablas. Si el estado ya es JSON, serializarlo no requiere ninguna operación |
| M5 | **Desaparece `getAvailableActions`.** Lo que el cliente necesita saber para jugar va en la vista | Mantenerla | En juegos con muchas acciones posibles es costosa, y ninguna parte de la plataforma la usa. Puede añadirse cuando haya bots |
| M6 | **`parseSettings` valida las opciones del juego** al crear la sala | Dejar las opciones sin validar | Las opciones eran un valor sin tipo que nadie comprobaba (C-15, G-10) |
| M7 | **La semilla la genera siempre la plataforma** y el estado del generador de azar vive dentro del estado del juego | Semilla opcional, como en el contrato preliminar | Mantiene el motor determinista también en juegos con azar, y la semilla queda guardada con el estado (G-06). *Precisada el 2026-11-19 (ADR-018, Z1): la plataforma guarda la semilla con la partida, en `matches.seed`, junto con las opciones validadas; dentro del estado del juego queda solo la posición del generador* |
| M8 | **Los eventos de juego son públicos.** La información privada viaja solo en las vistas | Filtrar los eventos por asiento | Una sola regla sencilla evita filtraciones en juegos con información oculta, sin añadir una operación más al contrato |
| M9 | **Lista cerrada de cinco códigos de rechazo**, más un motivo opcional propio de cada juego | Códigos libres por juego | La plataforma puede traducir cada código a un error del protocolo sin conocer el juego. El motivo conserva el detalle |
| M10 | **El motor devuelve una lista de asientos activos.** En un juego por turnos contiene un solo asiento; en uno con jugadas simultáneas, varios. | Un solo asiento activo | Era el único límite de la versión 1 que habría obligado a modificar motores ya escritos. Generalizarlo ahora no cuesta nada a los juegos por turnos. El modelo de datos lo refleja en su decisión R10 |
| M11 | **El motor decide siempre qué ocurre cuando un asiento se retira** por tiempo agotado, rendición o abandono, con la operación `retireSeat`. Vale para cualquier número de jugadores. En un juego de dos, el juego termina y gana el rival (7.18). En uno de más, el juego decide si termina o sigue con los demás | Que en los juegos de dos jugadores el resultado lo construya la plataforma sin pasar por el motor, y que el motor solo intervenga en los de más de dos | Un solo camino para todos los juegos. El estado guardado queda coherente con el final de la partida. Hay juegos de dos jugadores en los que la consecuencia depende de las reglas: en ajedrez, agotar el tiempo no siempre es derrota. La regla 7.17 de ADR-009 se modificó en consecuencia |

## 6. Cambios respecto al contrato preliminar

| Antes | Ahora | Motivo |
|---|---|---|
| 9 operaciones | 7 operaciones | M2, M3, M4, M5 y M11 |
| `gameId` | `gameSlug` | 9.5 |
| Identificadores de jugador | Asientos | M1 |
| El resultado incluía estado, lista de ganadores, motivo y el valor `OTHER` | El motor da un resultado por asiento: `WIN`, `LOSS` o `DRAW`. El motivo lo pone la capa de sesión | 7.16 y 7.17. Resuelve el hallazgo C-12 |
| Sin metadatos | Mínimo y máximo de jugadores, y controles de tiempo admitidos por modalidad | 9.9, 7.7 y decisión R1 del modelo de datos |
| Semilla opcional | Semilla obligatoria | M7 |
| Rechazos con dos formas distintas | Una sola forma, `Rejected` | M2 y M9 |
| Sin registro | `GameEngineRegistry` | Acuerdo B3 |

La nota de la documentación inicial que decía que el motor incluía `initialize` y `getState` queda sin efecto: el contrato es de funciones puras (hallazgo C-14).

## 7. Asuntos abiertos

| Asunto | Situación |
|---|---|
| **Valores concretos del control de tiempo en Cuatro en raya.** | Cerrado el 2026-11-16: 3, 5 y 10 minutos por jugador en tiempo real (ADR-014, decisión K6). Los de la modalidad por turnos, 12, 24 y 36 horas, se añadieron el 2026-11-18 en la misma versión (ADR-016, decisión N1) |
| **Juegos con jugadas simultáneas.** El contrato y el modelo de datos ya los admiten. Falta precisar cómo se aplica la regla 8.11 cuando dos asientos juegan sobre la misma versión del estado: tal como está, la segunda jugada se rechaza como obsoleta y hay que reenviarla. Además, si se agota el reloj de un asiento, la jugada de otro asiento activo se rechaza con `CLOCK_EXPIRED` aunque le quede tiempo (análisis del 2026-11-19, T-23) | *Cerrado el 2026-11-19 (ADR-019, X15 a X17):* la plataforma guarda desde qué versión está activo cada asiento y acepta su jugada sobre esa versión o una posterior; el reloj agotado de otro asiento ya no rechaza la jugada. La interfaz del motor no cambia |
| **Jugador retirado en una partida que continúa.** El contrato ya lo admite. Faltan las reglas de la plataforma para ese caso, que solo se da con más de dos jugadores: cuándo puede salir de la sala, cuándo deja de contar para sus límites de partidas, cuándo se anotan sus estadísticas y cómo se marca en el modelo de datos. Hoy la plataforma no guarda qué asientos se retiraron, así que podría llamar a `retireSeat` dos veces con el mismo asiento, cosa que este contrato no permite (análisis del 2026-11-19, T-24). *Precisada el 2026-11-19 (ADR-018, Z2): cada retirada queda en `match_retirements`, que la plataforma podrá consultar para no repetirla* | *Cerrado el 2026-11-19 (ADR-020, DO18 a DO21):* la sesión guarda los asientos retirados (`game_sessions.retired_seats`) y la plataforma no vuelve a llamar a `retireSeat` sobre ellos. El retirado no puede volver a rendirse, no pierde por abandono, no cuenta como rival conectado, sigue en la sala sin contar para su límite y sale al terminar la partida (regla 7.33). Sus estadísticas se anotan al terminar, con el resultado que dé el motor. `MatchPlayer.retired` lo muestra |
| **Uso del motor en el frontend** | Cerrado el 2026-11-16: el frontend no ejecuta el motor. Toma de él solo los tipos de cada juego (ADR-014, decisión K7) |
| **Comprobación automática de las seis reglas**, en especial el aislamiento y el determinismo | El aislamiento se comprueba desde el Hito 1 con dependency-cruiser y una regla del analizador que prohíbe al motor la hora, el azar y el entorno (ADR-012, S4). *Cerrado el 2026-11-19 (ADR-018, Z3 y Z4):* la batería común `checkEngineConformance`, en `@gameboard/game-engine/testing`, comprueba en cada motor registrado el determinismo, la inmutabilidad, que estados, acciones, eventos y vistas sobreviven a JSON, `restoreState`, los asientos activos, el final y `retireSeat` en juegos de dos. Falla si un motor no tiene sus datos de prueba. Además, el registro rechaza al arrancar los metadatos fuera de la regla 7.2 |
