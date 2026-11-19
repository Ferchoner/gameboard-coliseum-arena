# ADR-018: Preparación del segundo juego

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-19 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Origen** | Cuarta tanda del [análisis de la aplicación](../../planning/analisis/informe-de-analisis-y-tareas.md): T-05, T-15, T-21, T-22 y T-42 |
| **Depende de** | ADR-009 (reglas 7.2 y 7.20), ADR-010 (reglas 8.1 a 8.3 y sección 7), ADR-014 (K5, K6, K7, K11 y K16), ADR-016 (N1 y N4), ADR-017 (U5), el contrato del motor (M7 y sección 7) y la decisión del 2026-11-16 sobre el catálogo |

---

## 1. Contexto

Hasta ahora hay un solo juego, Cuatro en raya, y muchas cosas funcionan porque solo hay uno. El análisis del 2026-11-19 encontró cinco que conviene resolver antes del segundo juego, porque después cuestan más o ya no tienen arreglo:

- La semilla del azar no se guarda, aunque el contrato del motor (M7) dice que "queda guardada con el estado". Las opciones del juego viven en la sala y no en la partida, y las retiradas de un asiento no dejan rastro en el registro. Con el primer juego con azar, las partidas jugadas no se podrían repetir ni revisar.
- Cada motor prueba a su manera las reglas del contrato, y nada impide que un motor declare tiempos fuera de la regla 7.2.
- Se puede activar un juego que el frontend no sabe mostrar.
- El tablero del frontend solo sirve para dos asientos y para un juego.
- La receta para añadir un juego no dice que llega inactivo.

El 2026-11-19 quien decide autorizó la tanda tal como se propuso, con tres decisiones: guardar semilla, opciones y retiradas (Z1 y Z2); que el servidor no arranque con un motor que declara tiempos fuera de 7.2 (Z4); y que el frontend no ofrezca un juego que no sabe mostrar (Z5).

## 2. Resumen

| ID | Asunto | Decisión |
|---|---|---|
| Z1 | Semilla y opciones de cada partida | Se guardan en la partida, en `matches.seed` y `matches.settings`, al empezar. Las partidas anteriores reciben las opciones de su sala; su semilla queda vacía |
| Z2 | Retiradas de un asiento | Una tabla nueva, `match_retirements`, con la misma numeración que `match_actions`. Con las dos, el registro de una partida no tiene huecos. Las partidas anteriores terminadas por una retirada reciben la suya |
| Z3 | Comprobación común de los motores | Una batería, `checkEngineConformance`, en la entrada de pruebas del paquete del motor. Una prueba la pasa a todos los motores registrados, y falla si alguno no tiene sus datos de prueba |
| Z4 | Metadatos de un motor | El registro de motores los comprueba: número de jugadores y controles de tiempo según la regla 7.2. Si alguno no cumple, el servidor no arranca |
| Z5 | Juegos que el frontend no sabe mostrar | El frontend solo ofrece los juegos que sabe mostrar, y elige el tablero por juego y versión mayor. En una sala o partida de un juego desconocido, pide recargar y no deja entrar |
| Z6 | Orden al activar un juego | La guía de administración lo dice: desplegar primero el frontend que sabe mostrarlo, comprobarlo y después activarlo |
| Z7 | Tablero común en el frontend | Unas propiedades comunes para todo tablero, colores de asiento para N asientos con variables CSS, textos de cada juego en su carpeta y tableros cargados solo cuando se necesitan |
| Z8 | Guía para añadir un juego | `docs/guia-nuevo-juego.md`, con una plantilla de migración que da de alta el juego inactivo, y un `README.md` junto al motor de Cuatro en raya |

Ninguna cambia la API, el protocolo ni la interfaz del motor. Z1 y Z2 cambian el modelo de datos con una migración. Ninguna añade dependencias.

---

## 3. Lo que se guarda de cada partida

### Z1. Semilla y opciones

La plataforma genera una semilla al empezar cada partida y se la pasa al motor, que guarda el estado de su generador dentro de su propio estado. Como el estado se sobrescribe con cada jugada (8.1), lo que queda al final es la posición del generador, no la semilla. Las opciones validadas solo están en la sala, que puede albergar varias partidas.

| Opción | A favor | En contra |
|---|---|---|
| **Guardar la semilla y las opciones validadas en `matches`** | Dos columnas. Con el registro de jugadas, basta para volver a crear cualquier estado de la partida con el mismo motor | Para repetir la partida hay que volver a ejecutar el motor |
| Guardar el estado inicial entero | Se puede ver la posición inicial sin el motor | Un estado puede ser grande. Repite lo que ya dicen la semilla y las opciones |

**Decisión:** la primera. `matches.settings` (`jsonb`, obligatoria) es la copia de las opciones tal como las devolvió `parseSettings` al empezar. `matches.seed` (`text`) es la semilla que recibió `createInitialState`. Es nula solo en las partidas empezadas antes de este cambio, que no la guardaron. La migración copia en las partidas anteriores las opciones de su sala, que no cambian desde que se crea.

### Z2. Retiradas

Una retirada (tiempo agotado, rendición o abandono) cambia el estado y sube `state_version`, igual que una jugada, pero no deja fila en `match_actions`. El registro tiene huecos.

| Opción | A favor | En contra |
|---|---|---|
| **Una tabla aparte, `match_retirements`**, con la misma numeración que las jugadas | `match_actions` no cambia. Cada tabla tiene solo las columnas que necesita | El registro completo se lee de dos tablas |
| Una columna de tipo en `match_actions` | Una sola tabla | `request_id` y `action` dejarían de ser obligatorias, y con ellas la regla que impide aplicar dos veces la misma petición |

**Decisión:** la tabla aparte, con `match_id`, `sequence` (el `state_version` que resultó de la retirada), `player_id`, `reason` (`TIMEOUT`, `RESIGNATION` o `ABANDONMENT`) y `created_at`. Clave primaria `(match_id, sequence)`, y `(match_id, player_id)` hace referencia a `match_players`, como en el registro de jugadas. Se escribe en la misma transacción que la retirada. Las jugadas y las retiradas de una partida, ordenadas por `sequence`, van de 1 a su `state_version` sin huecos.

La migración rellena las partidas anteriores: hasta hoy todos los juegos son de dos jugadores, así que una partida terminada con motivo `TIMEOUT`, `RESIGNATION` o `ABANDONMENT` tuvo exactamente una retirada, la del asiento que perdió, y fue su último cambio.

No es *event sourcing*: el snapshot sigue siendo la fuente de verdad (8.3), y el registro sirve para repetir, revisar y probar.

## 4. Los motores

### Z3. Comprobación común

El contrato del motor tiene reglas que todo motor debe cumplir (puro, determinista, inmutable, estado serializable, `restoreState`, `retireSeat` en juegos de dos, eventos y vistas serializables). Cada motor las prueba por su cuenta, y el asunto abierto del contrato sobre comprobarlas sigue abierto.

**Decisión:** una función `checkEngineConformance(engine, fixture)` en `@gameboard/game-engine/testing`, sin depender de Vitest, que devuelve la lista de reglas incumplidas. Juega varias partidas con un generador con semilla, a partir de las acciones de prueba que da cada motor en sus datos (`fixture`), y comprueba en cada paso:

- los metadatos (Z4) y que las opciones de prueba se aceptan;
- que crear el estado y aplicar una acción dan siempre lo mismo con las mismas entradas;
- que el motor no modifica el estado que recibe;
- que estados, acciones, eventos y vistas sobreviven a JSON, y que `restoreState` acepta el estado serializado y rechaza lo que no es un estado;
- que los asientos activos nunca están vacíos y son asientos de la partida, y que un asiento no activo no puede jugar;
- que el final da un resultado por asiento, y que tras el final se rechaza toda acción con `GAME_ALREADY_FINISHED`;
- que, en un juego de dos, retirar un asiento termina el juego con su derrota y la victoria del otro, con los tres motivos.

Un archivo de prueba del paquete la pasa a cada motor de `GAME_ENGINES` y falla si alguno no tiene datos de prueba. Así, cada juego nuevo hereda las comprobaciones.

### Z4. Metadatos al registrar los motores

Un motor podría declarar 60 minutos en tiempo real, 8 horas por turnos o `minPlayers` mayor que `maxPlayers`, y entraría en el catálogo.

**Decisión:** `createGameEngineRegistry` comprueba los metadatos de cada motor y rechaza la lista si alguno no cumple. Como el registro se crea al arrancar, el servidor no arranca, igual que con una versión activa sin motor. Las comprobaciones:

- `minPlayers` y `maxPlayers` son enteros, `1 <= minPlayers <= maxPlayers`, como dice la API.
- Admite al menos una modalidad.
- En tiempo real, cada control dura más de 0 y como mucho 30 minutos (7.2).
- Por turnos, cada control es de 12, 24 o 36 horas (7.2, ADR-016 N1).
- No repite controles en una modalidad.

## 5. El frontend

### Z5. Juegos que el frontend no sabe mostrar

Activar un juego solo comprueba que su motor esté registrado. Si se activa antes de desplegar el frontend con su tablero, o mientras alguien tiene abierta una versión anterior de la aplicación, se pueden crear salas y empezar partidas que nadie puede jugar. Pasa también con una versión nueva de un motor que cambie su vista, porque el tablero se elige solo por el nombre del juego.

**Decisión:**

- El catálogo que usa el frontend para crear salas y para filtrar solo incluye los juegos que esta versión de la aplicación sabe mostrar.
- El tablero se elige por juego y versión mayor (`four-in-a-row` y `1` para la `1.0.0`). Una versión nueva de un motor que cambie la vista sube la versión mayor y necesita su tablero.
- En una sala de un juego que no sabe mostrar, la aplicación lo dice, pide recargar y no deja entrar ni marcarse listo. En una partida ya lo hacía.

No hace falta cambiar la API. Cada partida trae su juego y su versión. Una sala solo trae su juego, pero su partida se juega en la versión vigente, que el frontend ya recibe en el catálogo; si el catálogo no tiene el juego, la sala no se bloquea y decide el servidor.

### Z6. Orden al activar un juego

**Decisión:** la guía de administración dice el orden: desplegar primero el frontend que sabe mostrar el juego o la versión, comprobar que lo muestra y después activarlo. Para desactivar, el orden es el contrario.

### Z7. Tablero común

El tablero solo recibe la vista y si se puede jugar. Los colores existen solo para dos asientos, los textos de cada juego están en el archivo común y todos los tableros van en el paquete principal de la aplicación.

**Decisión:**

- Unas propiedades comunes para todo tablero (`BoardProps`): la vista, el asiento propio, los asientos activos, los jugadores, los eventos de la última jugada, la versión del juego y si se puede jugar.
- Colores de asiento para N asientos, con las variables CSS `--seat-0`, `--seat-1` y siguientes, en un solo sitio.
- Los textos de cada juego en su propia carpeta.
- Cada tablero se carga solo cuando se necesita.

Lo único acoplado a Cuatro en raya queda en su carpeta: la página de partida, el cliente de tiempo real y el backend son genéricos.

### Z8. Guía para añadir un juego

**Decisión:** una guía, `docs/guia-nuevo-juego.md`, con los pasos en orden: motor, registro en `GAME_ENGINES`, metadatos y controles de tiempo, datos de prueba para la comprobación común, migración que da de alta el juego **inactivo** (con una plantilla), tablero y textos en el frontend, desplegar y después activar. Un `README.md` junto al motor de Cuatro en raya con sus reglas, controles de tiempo y motivos de rechazo. Los comentarios que describen la receta se corrigen; la migración ya aplicada de Cuatro en raya no se toca.

## 6. Efecto sobre los documentos

| Documento | Cambio |
|---|---|
| `docs/03-dominio-datos.md` | Las columnas `seed` y `settings` de `matches` y la tabla `match_retirements` |
| `contracts/03-game-engine.md` | M7 dice dónde se guarda la semilla; se cierra el asunto abierto de la comprobación automática |
| `docs/adr/0010-persistencia-de-partida.md` | Nota en la sección 7: el registro ya tiene todo para repetir una partida |
| `docs/guia-administracion.md` | El orden de Z6 |
| `docs/guia-nuevo-juego.md` | Nueva (Z8) |
| `planning/decisiones-y-pendientes.md` | Fila de este ADR |
