# Cuatro en raya (`four-in-a-row`, versión `1.0.0`)

El primer juego de la plataforma. Este documento reúne lo que el resto de la documentación dice del juego, para que esté junto a su motor (ADR-018, decisión Z8). Las reglas de la plataforma (relojes, retiradas, abandono) están en [ADR-009](../../../../../docs/adr/0009-reglas-de-dominio.md) y no se repiten aquí.

## Reglas

- Dos jugadores. El asiento 0 lleva las fichas rojas y empieza; el asiento 1 lleva las amarillas. Se alternan.
- El tablero tiene 7 columnas y 6 filas. Cada jugada suelta una ficha en una columna, que cae a la casilla libre más baja.
- Gana quien alinea cuatro fichas suyas en horizontal, vertical o diagonal. Si el tablero se llena sin cuatro en línea, es empate.
- Si un asiento se retira (tiempo agotado, rendición o abandono), pierde y gana el otro (regla 7.18).
- No hay azar ni información oculta: todos ven lo mismo, y la semilla que recibe el motor no se usa.

## Opciones

Ninguna. `parseSettings` solo acepta el objeto vacío `{}`; cualquier otra cosa da `INVALID_SETTINGS`.

## Controles de tiempo

| Modalidad | Tiempo total por jugador |
|---|---|
| En tiempo real | 3, 5 o 10 minutos |
| Por turnos | 12, 24 o 36 horas |

Los controles por turnos se añadieron en la misma versión, sin cambiar reglas ni estado (ADR-016, decisión N1).

## Acción, evento y vista

- Acción: `{ "type": "DROP_TOKEN", "column": 0..6 }`.
- Evento: `TOKEN_DROPPED`, con la columna, la fila y el asiento de la ficha.
- Vista: el tablero (`cells[columna][fila]`, fila 0 abajo), las columnas donde cabe una ficha, la última ficha y la línea ganadora si la hay. Los tipos están en [`types.ts`](types.ts).

## Motivos de rechazo

Precisan un rechazo `INVALID_ACTION` (ADR-014, decisión K6; [catálogo de errores](../../../../../contracts/04-error-catalog.md)):

| Motivo | Cuándo |
|---|---|
| `MALFORMED_ACTION` | La acción no tiene la forma de arriba |
| `COLUMN_OUT_OF_RANGE` | La columna no existe |
| `COLUMN_FULL` | La columna ya tiene sus seis fichas |

Además, como todo motor: `NOT_YOUR_TURN` si no le toca a ese asiento y `GAME_ALREADY_FINISHED` si el juego terminó.

## Alta en el catálogo

Entró **activo** con la migración `20261116061456_cuatro_en_raya`, como excepción por ser el primero. Los juegos siguientes llegan inactivos: ver la [guía para añadir un juego](../../../../../docs/guia-nuevo-juego.md).

## Pruebas

Las reglas propias, en [`engine.test.ts`](engine.test.ts). Las del contrato las comprueba la batería común con los datos de prueba de `four-in-a-row@1.0.0` en [`conformance.test.ts`](../../conformance.test.ts).
