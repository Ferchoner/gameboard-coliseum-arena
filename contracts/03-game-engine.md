# Contrato del motor de juego, versión 1: notas

| Campo | Valor |
|---|---|
| **Estado** | Versión 1, en revisión |
| **Contrato** | [`03-game-engine.ts`](03-game-engine.ts). Contiene solo tipos, sin lógica |
| **Sustituye a** | El contrato de referencia preliminar |
| **Aplica** | ADR-001 (condición 5.5), ADR-007 (acuerdos B2 y B3), ADR-009 (reglas 7.7, 7.8 y 7.16 a 7.18), ADR-010 (reglas 8.1, 8.2 y 8.5), ADR-011 (convenciones 9.5, 9.7, 9.9 y 9.19) y el modelo de datos (decisión R1) |
| **Resuelve** | Hallazgos C-12, C-14 y C-15; vacíos G-06 y G-10 |

**Cómo leer este documento.** El contrato es el archivo TypeScript. Este documento explica qué hace cada parte, cómo lo usa la plataforma y qué decisiones de diseño contiene. Las decisiones propias de este entregable están en la [sección 5](#5-puntos-a-revisar), marcadas como recomendación, y no deben darse por aprobadas hasta que se confirmen.

El archivo vive por ahora en `contracts/`. Al iniciar el Hito 1 pasa al paquete del motor previsto en ADR-005.

---

## 1. Qué es el motor

El motor de un juego contiene sus reglas y nada más. Recibe un estado y una acción, y devuelve el estado siguiente. No sabe quién juega, cuánto tiempo queda, cómo se guarda la partida ni cómo llega a los clientes. Todo eso es trabajo de la plataforma.

Las seis reglas que debe cumplir están en la cabecera del contrato: puro y determinista, aislado, inmutable, con estado serializable, sin identidades y sin tiempo.

## 2. Las seis operaciones

| Operación | Qué hace | Cuándo la llama la plataforma |
|---|---|---|
| `parseSettings` | Valida las opciones del juego y las devuelve con su tipo | Al crear una sala |
| `createInitialState` | Crea el estado inicial a partir del número de asientos, las opciones y la semilla | Al empezar una partida |
| `restoreState` | Comprueba que un snapshot guardado es un estado válido | Al cargar en memoria una sesión de juego desde la base de datos |
| `getStatus` | Dice a qué asiento le toca o, si el juego terminó, el resultado de cada asiento | Tras crear el estado y tras cada jugada |
| `applyAction` | Valida y aplica una acción. Devuelve el estado nuevo, la acción aceptada y los eventos de juego, o un rechazo | Cuando llega una jugada |
| `getView` | Devuelve lo que un asiento puede ver del estado | Antes de enviar el estado a cada cliente |

Además, cada motor declara su nombre corto, su versión y sus **metadatos**: mínimo y máximo de jugadores, y los controles de tiempo que admite en cada modalidad.

## 3. Cómo lo usa la plataforma

### Crear una sala

1. La plataforma obtiene el motor de la versión vigente del juego.
2. Comprueba la capacidad pedida contra `minPlayers` y `maxPlayers`, y que el control de tiempo elegido figura entre los que el motor admite para esa modalidad.
3. Llama a `parseSettings` con las opciones recibidas. Si las rechaza, la sala no se crea.

### Empezar una partida

1. La plataforma asigna los asientos (9.19) y genera la semilla.
2. Llama a `createInitialState` y después a `getStatus` para saber a qué asiento le toca primero.
3. Guarda el estado, la versión 0, los relojes y el asiento activo, en la transacción de inicio de partida del modelo de datos.

### Una jugada

1. La plataforma identifica al jugador por su sesión de autenticación y lo traduce a su asiento. Comprueba que la versión del estado que indica la jugada es la actual (8.11) y que su reloj no está agotado (7.5).
2. Llama a `applyAction`. Si el motor la rechaza, responde con el error solo a quien la envió y no guarda nada.
3. Si la acepta, llama a `getStatus` sobre el estado nuevo.
4. Guarda en una sola transacción el estado nuevo, la versión, los relojes y la acción aceptada. Si el juego terminó, guarda también el resultado (8.7, 8.14).
5. Una vez confirmada la transacción, llama a `getView` para cada asiento y envía a cada cliente su vista junto con los eventos de juego (8.9).

### Recuperar una partida

Al cargar una sesión de juego desde la base de datos, la plataforma llama a `restoreState` con el snapshot. Si el motor lo rechaza, la partida no puede continuar y se anula por fallo técnico (7.20).

### Finales que no produce el motor

El tiempo agotado, la rendición y el abandono los detecta la capa de sesión. El motor no interviene: la plataforma construye el resultado con la misma forma, `MatchResult`, que usa para el fin natural (7.17).

En un juego de dos jugadores, quien agota su tiempo, se rinde o abandona recibe `LOSS` y su rival `WIN` (7.18).

## 4. Ejemplo ilustrativo: Cuatro en raya

Este ejemplo no forma parte del contrato. Muestra cómo encajan los tipos de un juego concreto. Los nombres y valores definitivos se fijan al implementar el juego.

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

## 5. Puntos a revisar

Estas son las decisiones de diseño que este entregable toma por su cuenta. Son **recomendaciones pendientes de confirmación**.

| ID | Recomendación | Alternativa | Motivo |
|---|---|---|---|
| M1 | **El motor conoce asientos, no jugadores.** La plataforma traduce entre jugador y asiento | Pasar al motor los identificadores de jugador, como hacía el contrato preliminar | El motor queda libre de identidades y el estado guardado no contiene datos de personas. Resuelve parte del hallazgo C-15 |
| M2 | **Una sola vía para validar una acción:** `applyAction` valida y aplica. Desaparece `validateAction` | Mantener las dos | Las dos devolvían el mismo fallo con formas distintas, y podían discrepar (C-15) |
| M3 | **`getStatus` es la única fuente** para saber a quién le toca, si el juego terminó y con qué resultado. Sustituye a `currentTurn`, `isFinished`, `getResult` y al resultado dentro de `applyAction` | Mantener las cuatro | Cada dato tenía varias fuentes que podían no coincidir (C-15) |
| M4 | **El estado es un valor JSON plano y opaco para la plataforma.** Desaparecen el envoltorio común de estado y `serializeState`. `restoreState` valida el snapshot | Mantener un envoltorio con fase, jugadores y metadatos | El envoltorio repetía datos que la plataforma ya guarda en sus tablas. Si el estado ya es JSON, serializarlo no requiere ninguna operación |
| M5 | **Desaparece `getAvailableActions`.** Lo que el cliente necesita saber para jugar va en la vista | Mantenerla | En juegos con muchas acciones posibles es costosa, y ninguna parte de la plataforma la usa. Puede añadirse cuando haya bots |
| M6 | **`parseSettings` valida las opciones del juego** al crear la sala | Dejar las opciones sin validar | Las opciones eran un valor sin tipo que nadie comprobaba (C-15, G-10) |
| M7 | **La semilla la genera siempre la plataforma** y el estado del generador de azar vive dentro del estado del juego | Semilla opcional, como en el contrato preliminar | Mantiene el motor determinista también en juegos con azar, y la semilla queda guardada con el estado (G-06) |
| M8 | **Los eventos de juego son públicos.** La información privada viaja solo en las vistas | Filtrar los eventos por asiento | Una sola regla sencilla evita filtraciones en juegos con información oculta, sin añadir una operación más al contrato |
| M9 | **Lista cerrada de cinco códigos de rechazo**, más un motivo opcional propio de cada juego | Códigos libres por juego | La plataforma puede traducir cada código a un error del protocolo sin conocer el juego. El motivo conserva el detalle |
| M10 | **Un solo asiento activo a la vez.** Los juegos con jugadas simultáneas quedan fuera de la versión 1 | Lista de asientos activos | Coincide con el modelo de datos aceptado, que guarda un solo asiento activo y un solo reloj en marcha |
| M11 | **Los finales por tiempo agotado, rendición y abandono solo están definidos para juegos de dos jugadores.** Un juego de más jugadores necesitará ampliar el contrato para decir qué ocurre con el resto | Definirlo ahora para cualquier número de jugadores | La regla 7.18 lo deja a cada juego, y todavía no hay ningún juego de más de dos jugadores con el que validarlo |

## 6. Cambios respecto al contrato preliminar

| Antes | Ahora | Motivo |
|---|---|---|
| 9 operaciones | 6 operaciones | M2, M3, M4 y M5 |
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
| **Valores concretos del control de tiempo en Cuatro en raya.** La regla 7.2 fija hasta 30 minutos en tiempo real, y 12, 24 o 36 horas por turnos. Falta decidir qué opciones de tiempo real se ofrecen | Se decide al implementar el juego |
| **Uso del motor en el frontend** para mostrar jugadas válidas sin duplicar reglas | Se decide al iniciar el Hito 1 (ADR-005). El contrato no lo impide: el motor no depende de nada del servidor |
| **Comprobación automática de las seis reglas**, en especial el aislamiento y el determinismo | La herramienta se elige al iniciar el Hito 1 (ADR-001) |
