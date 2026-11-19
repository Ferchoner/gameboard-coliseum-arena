# ADR-014: Decisiones del Hito 3, Cuatro en raya en tiempo real

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-16 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | La forma de la interfaz entre salas y partidas (ADR-013, H1), la librería de componentes y el uso del motor en el navegador (ADR-012, S24 y S25), las pruebas en navegador (ADR-012, S18) y los controles de tiempo de Cuatro en raya (notas del motor, sección 7) |
| **Depende de** | ADR-009, ADR-010, ADR-012, ADR-013, el modelo de datos, el contrato del motor y los contratos de la API y de tiempo real |

---

## 1. Contexto

El Hito 3 está autorizado desde el 2026-11-16 con una condición: sus decisiones abiertas se presentan antes de escribir código. Su alcance, según el backlog:

- Motor de Cuatro en raya, con pruebas de sus reglas.
- Inicio de partida automático y atómico, con sorteo de asientos (7.9, 9.19).
- Jugadas con versión del estado, control de repetidas, transacción única y registro de jugadas (8.6 a 8.13).
- Relojes: descuento, vencimiento y jugada con el reloj agotado (7.2 a 7.5).
- Rendición (7.19).
- Final de partida en la misma transacción, con resultado, y vuelta de la sala a la espera para la revancha (8.14, 7.11).
- Frontend: tablero, relojes, resultado e historial.
- Prueba de extremo a extremo de una partida completa y de las jugadas rechazadas.

Con este hito termina el corte vertical. Sus diez criterios de aceptación están en el backlog.

Las reglas, el modelo de datos y los contratos ya dicen qué tiene que pasar. Lo que falta decidir es cómo se construye, y qué hacer con siete huecos que aparecen al juntar las piezas ([sección 8](#8-huecos-y-contradicciones-encontrados)).

## 2. Cómo leer este documento

- Cada decisión tiene un identificador (K1 a K22), sus alternativas y una recomendación.
- Las decisiones K1 a K8 afectan a la arquitectura, al alcance o cuesta deshacerlas. Van explicadas una a una.
- Las decisiones K9 a K22 son menores y fáciles de cambiar. Van en una tabla.
- **Las 22 se aceptaron el 2026-11-16 tal como se recomendaban.** Donde el texto dice "recomendación", léase "decisión".
- Tres decisiones cambian algo ya aceptado y por eso piden atención: **K1** precisa la decisión H1 de ADR-013, **K3** adelanta al Hito 3 una tarea que el backlog pone en el Hito 4, y **K7** relaja una regla de dependencias de ADR-012.

## 3. Resumen

| ID | Asunto | Recomendación |
|---|---|---|
| K1 | Qué módulo dirige una partida | `game-sessions` dirige el inicio, las jugadas y el final, y usa a `matches` como registro. Las dependencias van en un solo sentido |
| K2 | Dónde está el estado de una partida mientras se juega | Siempre en la base de datos. Cada jugada lo lee con un bloqueo de fila, lo cambia y lo guarda. No hay copia en memoria |
| K3 | Cómo se detecta un reloj vencido | Un temporizador exacto por partida y, además, la revisión periódica de la base de datos, que se adelanta del Hito 4 |
| K4 | Estadísticas al terminar una partida | No se escriben todavía. El Hito 6 crea la tabla y la rellena con los resultados ya guardados |
| K5 | Cómo entra Cuatro en raya en el catálogo | Con una migración de datos que da de alta el juego y su versión 1.0.0 |
| K6 | El juego: reglas, datos y controles de tiempo | Tablero de 7 por 6, empieza el asiento 0, relojes de 3, 5 o 10 minutos. Solo en tiempo real hasta el Hito 5 |
| K7 | Frontend: componentes y motor en el navegador | Sin librería de componentes. El motor no se ejecuta en el navegador: el frontend toma de él solo los tipos del juego |
| K8 | Pruebas en navegador | Playwright en el repositorio, con una prueba que recorre los diez criterios de aceptación, en un trabajo aparte de las comprobaciones |
| K9 a K22 | Decisiones menores | [Sección 7](#7-decisiones-menores) |

---

## 4. Módulos y estado

### K1. Qué módulo dirige una partida

ADR-013 decidió que `rooms` define una interfaz para iniciar partidas y que `matches` la implementa (H1), y dejó su forma para este hito. Al diseñarla aparece un problema que H1 no veía: `matches` y `game-sessions` se necesitan en los dos sentidos. Para empezar una partida, `matches` tendría que pedir a `game-sessions` que cree el estado inicial. Para terminarla, `game-sessions` tendría que pedir a `matches` que guarde el resultado. Es la misma dependencia circular que H1 evitó entre salas y partidas.

| Opción | A favor | En contra |
|---|---|---|
| **`game-sessions` dirige la partida y `matches` es su registro.** `game-sessions` se registra como iniciador en `rooms`. Al empezar, pide a `matches` que cree la partida y sus participantes, y crea él la sesión de juego. Al terminar, pide a `matches` que guarde el resultado y a `rooms` que devuelva la sala a la espera | Un solo sentido: `game-sessions` usa a `matches`, a `rooms`, a `games` y a `players`, y ninguno de ellos lo conoce. Quien aplica las jugadas es quien sabe cuándo empieza y cuándo termina una partida. Cada módulo sigue tocando solo sus tablas (D3) y todo ocurre en una transacción (D4) | Cambia quién implementa la interfaz de H1: ya no es `matches` |
| `matches` implementa la interfaz, como dice H1, y una segunda interfaz invertida resuelve el final | Respeta la letra de H1 | Dos interfaces invertidas para un problema. Más difícil de seguir al leer el código |
| Unir `matches` y `game-sessions` en un módulo | No hay dependencia que ordenar | Deshace la separación entre el registro de la partida y su estado vivo, que la arquitectura fija en su sección 4 |

**Recomendación:** `game-sessions` dirige. H1 se mantiene en lo que importa: `rooms` no conoce a ninguno de los dos.

Forma de la interfaz que define `rooms`, que ya existe desde el Hito 2 y no cambia:

| Operación | Qué hace |
|---|---|
| Iniciar una partida para una sala | Recibe la sala, sus miembros por orden de llegada y la transacción. Devuelve el identificador de la partida |
| Describir una sala | Dice cuál es su partida en curso, si la hay, y si ya albergó alguna |

Y `rooms` ofrece una operación nueva a quien dirige la partida: **la partida de esta sala terminó**. Dentro de la transacción recibida, devuelve la sala a la espera sin marcas de listo, o la cierra si es por turnos y no admite revancha (7.11, 7.31).

Las consultas de la API, `GET /matches/{matchId}` y `GET /me/matches`, las atiende también `game-sessions`, porque la vista de una partida lleva los relojes y lo que el motor deja ver a cada asiento.

### K2. Dónde está el estado de una partida mientras se juega

La arquitectura describe una copia en memoria de las sesiones de juego, que se carga cuando hace falta (7.22) y se descarta si una transacción falla (8.10). El backlog pone esa carga en el Hito 4. Hay que decidir qué se construye ahora.

| Opción | A favor | En contra |
|---|---|---|
| **Sin copia en memoria.** Cada jugada abre una transacción, lee la sesión de juego con un bloqueo de fila, pide al motor que valide el snapshot y aplique la jugada, y guarda | El bloqueo de fila da el orden de las jugadas (8.6) y la segunda barrera (8.8) sin código propio. No hay copia que pueda quedar desfasada, así que la regla 8.10 se cumple sola. Un reinicio del servidor no pierde nada. Es el mismo mecanismo que ya usan las salas (H7). No estorba a un futuro paso a varias instancias | Una lectura más por jugada, de una fila por su clave. El motor valida el snapshot en cada jugada, que en Cuatro en raya es recorrer 42 casillas |
| Copia en memoria con una cola por partida, como describe la arquitectura | Ahorra esa lectura | Hay que programar la cola, la carga, la liberación y el descarte tras un fallo. Es la parte más delicada del servidor, y su ventaja no se nota con partidas de pocas jugadas por minuto |

**Recomendación:** sin copia en memoria. La memoria guarda solo los temporizadores (K3), las conexiones y la presencia. Si algún juego futuro lo pide, la copia se puede añadir sin cambiar ningún contrato, porque es interna del servidor.

Consecuencia para el Hito 4: su tarea "carga de la sesión de juego desde la base de datos cuando hace falta" queda hecha desde ahora, porque es la única forma de leerla.

### K3. Cómo se detecta un reloj vencido

La regla 8.17 pide dos mecanismos: un temporizador exacto en memoria y una revisión periódica de la base de datos. El backlog pone el primero en este hito y la segunda en el Hito 4.

El problema de dejarla para después: en local, `pnpm dev` reinicia el servidor cada vez que cambia un archivo, y con cada reinicio se pierden los temporizadores. Una partida a la que nadie vuelve se quedaría en curso para siempre, y como el límite en tiempo real es de una partida a la vez (7.30), sus dos jugadores no podrían entrar en ninguna otra sala.

| Opción | A favor | En contra |
|---|---|---|
| **Los dos mecanismos ahora.** Temporizador exacto por partida en curso y revisión cada 10 segundos de las fechas límite ya pasadas. Los dos llaman a la misma operación, que comprueba el reloj dentro de la transacción | Una partida nunca se queda colgada, tampoco tras un reinicio. La revisión es poco código: una consulta sobre un índice que el modelo ya prevé, con el mismo patrón que el cierre de salas inactivas (H8) | Adelanta una tarea del Hito 4 |
| Solo el temporizador, como dice el backlog | Respeta el reparto actual | Partidas colgadas tras cada reinicio hasta el Hito 4. Para salir habría que abrir la partida y rendirse |
| Solo la revisión periódica | Un mecanismo en vez de dos | El vencimiento llegaría hasta 10 segundos tarde. Con relojes de 3 minutos se nota |

**Recomendación:** los dos ahora.

Lo que sigue en el Hito 4: no descontar a nadie el tiempo que el servidor estuvo parado (7.29, 8.18), el abandono por desconexión (7.26) y el reenvío de una jugada sin respuesta al reconectar. Hasta entonces, **el tiempo de una parada del servidor sí se descuenta** a quien le tocaba jugar.

### K4. Estadísticas al terminar una partida

La regla 8.15 dice que las estadísticas se actualizan en la transacción del final de partida. El alcance aprobado y el backlog ponen las estadísticas en el Hito 6.

| Opción | A favor | En contra |
|---|---|---|
| **No escribirlas todavía.** El Hito 6 crea la tabla `game_statistics` y la rellena de una vez con los resultados guardados. Desde entonces se actualizan en la transacción final | Respeta el alcance. Los resultados por jugador, que sí se guardan desde ahora, son la fuente de las estadísticas, así que no se pierde nada | El Hito 6 necesita un paso de relleno, que es una sola consulta |
| Escribirlas ya, sin mostrarlas | La regla 8.15 se cumple desde la primera partida y no hace falta relleno | Crea ahora un módulo y una tabla que nadie lee hasta el Hito 6 |

**Recomendación:** no escribirlas todavía.

---

## 5. El juego

*Anotado el 2026-11-19:* las estadísticas las crea y rellena el Hito 6, en la misma migración, y desde entonces se actualizan en la transacción del final de partida (ADR-017, U8).

### K5. Cómo entra Cuatro en raya en el catálogo

La decisión A5 de la API dice que los juegos y sus versiones no se crean por la API, sino en la base de datos. No dice cómo.

| Opción | A favor | En contra |
|---|---|---|
| **Una migración de datos** que inserta el juego `four-in-a-row`, con el nombre "Cuatro en raya", y su versión 1.0.0 como vigente | Queda en el repositorio, se aplica igual en todos los entornos y solo una vez. Es el mismo mecanismo que ya crea las tablas | Las pruebas que vacían la base de datos tienen que conservar o reponer esa fila |
| Que el servidor dé de alta al arrancar los motores que encuentre | No hay que escribir la migración | El servidor escribiría en el catálogo por su cuenta. Activar un juego dejaría de ser un acto deliberado, que es lo que A5 quiere |
| Un guion que se ejecuta a mano | Explícito | Un paso más que recordar en cada entorno |

**Recomendación:** la migración de datos.

### K6. El juego: reglas, datos y controles de tiempo

El motor es TypeScript puro en `packages/game-engine`, sin dependencias, con el contrato de siete operaciones ya aceptado. Esto fija lo que ven la plataforma y el frontend. La forma interna del estado es asunto del motor.

| Asunto | Propuesta |
|---|---|
| Reglas | Tablero de 7 columnas por 6 filas. Dos jugadores. Empieza siempre el asiento 0. Gana quien alinea cuatro fichas en horizontal, vertical o diagonal. Si el tablero se llena sin línea, empate |
| Quién empieza | Lo decide el sorteo de asientos de la plataforma (K11). En la revancha los asientos se alternan, así que empieza el otro |
| Opciones del juego | Ninguna |
| Acción | `{ "type": "DROP_TOKEN", "column": 3 }`, con la columna de 0 a 6 |
| Motivos de rechazo | `MALFORMED_ACTION`, `COLUMN_OUT_OF_RANGE` y `COLUMN_FULL`, los tres bajo `INVALID_ACTION` |
| Evento de juego | `TOKEN_DROPPED`, con el asiento, la columna y la fila |
| Vista | Las casillas con el asiento que las ocupa, las columnas en las que se puede jugar, la última ficha colocada y, si hay ganador, las cuatro casillas de la línea. Todos los asientos ven lo mismo |
| Retirada de un asiento | El juego termina: pierde el retirado y gana el otro (7.18) |
| Versión | 1.0.0 |

*Anotado el 2026-11-18:* los controles de tiempo por turnos, 12, 24 y 36 horas, los fija ADR-016, decisión N1, en la misma versión 1.0.0.

Controles de tiempo. La regla 7.2 admite hasta 30 minutos por jugador en tiempo real. Una partida tiene como mucho 21 jugadas por jugador.

| Opción | A favor | En contra |
|---|---|---|
| **3, 5 y 10 minutos por jugador** | Cubre de la partida rápida a la tranquila. Tres opciones caben en un selector sin pensar | Nadie puede elegir una partida muy larga |
| Además 15 y 30 minutos | Usa todo el margen de la regla | Con 21 jugadas, 30 minutos por jugador es una partida de una hora. Más opciones reparten a la gente en más salas |
| Un solo control de 5 minutos | Lo más simple | No deja elegir |

**Recomendación:** 3, 5 y 10 minutos.

**La modalidad por turnos no se ofrece todavía.** El motor declara sus controles de tiempo solo para tiempo real, así que no se pueden crear salas por turnos de Cuatro en raya hasta el Hito 5, que es donde llegan la lista de "mis partidas" y el aviso de turno. Añadirlos entonces es cambiar una lista en el motor.

---

## 6. Frontend y pruebas

### K7. Frontend: componentes y motor en el navegador

ADR-012 dejó dos asuntos para este hito: si se adopta una librería de componentes (S24) y si el frontend usa el motor para mostrar las jugadas válidas (S25).

**Librería de componentes.**

| Opción | A favor | En contra |
|---|---|---|
| **Ninguna todavía** | Lo nuevo de este hito es un tablero, dos relojes y un panel de resultado. Ninguna librería trae un tablero. Lo demás ya está hecho con los estilos propios de los hitos 1 y 2 | Cuando la aplicación crezca habrá que decidirlo de nuevo |
| Adoptar una ahora | Diálogos, menús y avisos ya resueltos | Una dependencia grande para tres pantallas. Obliga a rehacer las que ya existen para que todo se vea igual |

**Recomendación:** ninguna. Se revisa cuando llegue la administración visual o un segundo juego.

**Motor en el navegador.**

| Opción | A favor | En contra |
|---|---|---|
| **No se ejecuta en el navegador.** La vista ya trae las columnas en las que se puede jugar. El frontend toma del paquete del motor solo los tipos de Cuatro en raya: la acción, el evento y la vista | Una sola autoridad, el servidor. Ninguna regla llega duplicada al navegador. Los tipos evitan escribir dos veces la forma de la vista | Hay que relajar la regla que hoy prohíbe al frontend importar del motor, para permitir solo tipos |
| Ejecutarlo en el navegador para adelantar el resultado de la jugada | La ficha cae sin esperar al servidor | Dos sitios que pueden discrepar, y código para deshacer una jugada que el servidor rechace. En Cuatro en raya la espera es una ida y vuelta de red |
| Que el frontend escriba sus propios tipos de la vista | La regla de dependencias no cambia | La misma forma escrita dos veces, sin nada que avise si dejan de coincidir |

**Recomendación:** no ejecutarlo, y tomar solo tipos. La regla de dependencias pasa de "el frontend no importa nada del motor" a "el frontend solo importa tipos del motor", y se sigue comprobando de forma automática. Al navegador no llega código de ningún juego.

### K8. Pruebas en navegador

ADR-012 decidió que las pruebas en navegador llegan en este hito (S18). Falta elegir la herramienta y dónde se ejecutan.

| Opción | A favor | En contra |
|---|---|---|
| **Playwright, en un trabajo aparte de las comprobaciones.** Una prueba con dos navegadores que recorre los diez criterios de aceptación contra el servidor y la base de datos reales. Se ejecuta con `pnpm test:e2e` y en cada pull request | Es la herramienta habitual para dos navegadores a la vez. Ya la usé desde fuera del repositorio para comprobar los hitos 1 y 2. En un trabajo aparte no alarga `pnpm check` | Una dependencia de desarrollo nueva, `@playwright/test`, y la descarga de un navegador en GitHub en cada ejecución |
| Seguir sin pruebas en navegador en el repositorio y recorrer el flujo a mano | Ninguna dependencia nueva | Contradice S18. Los criterios de aceptación piden dos navegadores, y sin prueba automática cada cambio obliga a repetir el recorrido |
| Cypress | También es conocida | Manejar dos navegadores a la vez le cuesta más |

**Recomendación:** Playwright, en un trabajo aparte.

Además, las pruebas del servidor cubren lo que el navegador no ve bien: jugadas simultáneas, la jugada repetida, la versión antigua del estado, el vencimiento del reloj con el tiempo controlado y el final de partida en una sola transacción. Usan el motor real de Cuatro en raya, un WebSocket real y PostgreSQL.

---

## 7. Decisiones menores

| ID | Asunto | Recomendación | Alternativa |
|---|---|---|---|
| K9 | Tablas de este hito | `matches`, `match_players`, `game_sessions`, `match_actions`, `match_results` y `player_results`, en una migración nueva. `game_statistics` llega en el Hito 6 (K4) y `server_liveness` en el Hito 4 | Crear ya las dos que faltan, vacías |
| K10 | Orden de los bloqueos | El final de partida bloquea primero la sesión de juego y después la sala. Ninguna operación los toma al revés: el inicio bloquea la sala y crea la sesión, que todavía no existe | Bloquear siempre la sala primero. Obligaría a bloquear la sala en cada jugada |
| K11 | Sorteo de asientos y semilla | En la primera partida de una sala, al azar. En la revancha con los mismos jugadores, los asientos de la partida anterior se rotan. Si cambió algún jugador, sorteo nuevo. La semilla son 128 bits al azar. El azar entra por una interfaz, para poder fijarlo en las pruebas | Asientos por orden de llegada. Daría siempre la salida al anfitrión |
| K12 | Anulación por fallo técnico (7.20) | Se construye ahora: si el motor rechaza el snapshot guardado, o falta el motor de esa versión, la partida se anula con el motivo `FAILURE` y la sala vuelve a la espera. La anulación por un administrador sigue en el Hito 6 | Dejarla para el Hito 6. Una partida dañada bloquearía la sala y a sus jugadores |
| K13 | Presencia en la partida | La vista lleva `connected` y los participantes reciben `MATCH_UPDATED` cuando el rival se conecta o se desconecta, como ya pasa en las salas. `abandonAt` va siempre vacío hasta el Hito 4 | No avisar de la presencia hasta el Hito 4 |
| K14 | Aviso personal `PLAYER_MATCH_UPDATED` | Se envía al empezar la partida, cada vez que cambia a quién le toca y al terminar, como fija el protocolo | Solo al empezar y al terminar |
| K15 | Consultas de partidas en la API | `GET /matches/{matchId}` y `GET /me/matches` completas, en curso y terminadas, porque es la misma operación. En el frontend solo se construye el historial: la lista de partidas en curso es del Hito 5 | Limitar la API a las terminadas |
| K16 | Qué es el historial | La lista de tus partidas terminadas, con rival, resultado, motivo y fecha, y al abrir una, su tablero final. Sin repetición jugada a jugada: el contrato de la API no envía las jugadas | Añadir una operación que las envíe. Cambia el contrato |
| K17 | Suscribirse a una partida ya terminada | Se responde con `MATCH_SUBSCRIBED` y el estado final, y no queda ninguna suscripción, porque no habrá más cambios. Sirve a quien se suscribe justo cuando la partida acaba | Rechazarla con `MATCH_NOT_IN_PROGRESS`. Obligaría al cliente a pedir entonces el estado por la API |
| K18 | Páginas | `/partidas/[matchId]` para jugar y para ver una partida terminada, y `/partidas` para el historial. La sala de espera lleva sola a la partida cuando empieza. Al terminar, un botón vuelve a la sala para la revancha | Mostrar el tablero dentro de la página de la sala |
| K19 | Relojes en pantalla | Cuentan hacia atrás desde el tiempo restante de cada aviso, usando el tiempo transcurrido desde que llegó (T12). No dependen de que el reloj del equipo esté en hora. Nunca muestran menos de cero | Calcular con la hora del equipo |
| K20 | Jugada en pantalla | La ficha aparece cuando el servidor confirma. Mientras tanto el tablero no admite otra jugada. Pide confirmación antes de rendirse | Dibujarla antes de la confirmación (K7) |
| K21 | Códigos del motor | `INVALID_ACTION` y `NOT_YOUR_TURN` pasan tal cual, con el motivo del juego. `GAME_ALREADY_FINISHED` se responde como `MATCH_NOT_IN_PROGRESS`. `INVALID_GAME_STATE` anula la partida (K12) | Ninguna. Se anota porque el contrato del motor deja la traducción a la plataforma |
| K22 | Configuración nueva | Una variable de entorno para el intervalo de la revisión de relojes, con valor inicial de 10 segundos | Dejarlo fijo en el código |

---

## 8. Huecos y contradicciones encontrados

| Hallazgo | Qué se propone |
|---|---|
| H1 dice que `matches` implementa el iniciador de partidas, pero `matches` y `game-sessions` se necesitarían en los dos sentidos | K1 |
| La arquitectura describe sesiones de juego cargadas en memoria; el backlog pone esa carga en el Hito 4 y las jugadas en el Hito 3 | K2 |
| El backlog pone la revisión periódica de relojes en el Hito 4, pero sin ella un reinicio deja partidas en curso para siempre | K3 |
| La regla 8.15 pide actualizar las estadísticas al terminar la partida; el alcance las pone en el Hito 6 | K4 |
| La decisión A5 dice que los juegos se dan de alta en la base de datos, y no dice cómo | K5 |
| El backlog pide un historial; el contrato de la API no envía las jugadas | K16 |
| El protocolo no dice qué pasa al suscribirse a una partida ya terminada | K17 |

Además, un hueco temporal que no pide decisión: el tiempo de una parada del servidor se descuenta hasta el Hito 4 (K3).

Ninguno obliga a cambiar un contrato. K1 precisa una decisión de ADR-013, K3 cambia el reparto del backlog y K7 cambia una regla de dependencias de ADR-012.

## 9. Lo que se comprobó antes de recomendar

| Comprobación | Resultado |
|---|---|
| El código del Hito 2 | `rooms` ya llama al iniciador de partidas dentro de su transacción y ya pone la sala en `IN_MATCH` cuando recibe un identificador de partida. No hay que tocarlo para K1, salvo añadir la operación de fin de partida |
| El contrato del motor | Sus siete operaciones bastan para todo el hito, incluidas la rendición y el vencimiento, que pasan por `retireSeat`. No hay que cambiarlo |
| El modelo de datos | Las seis tablas de K9 y su índice sobre la fecha límite del turno ya están definidos. No hay que cambiarlo |
| `pnpm dev` | Reinicia el servidor con cada cambio de archivo. Es lo que motiva K3 |
| Playwright | Versión vigente 1.65.1. Maneja varios navegadores en una misma prueba |
| dependency-cruiser | Distingue las importaciones de solo tipos, que es lo que K7 necesita |

## 10. Supuestos que se comprueban al construir

Si alguno falla, se avisa antes de cambiar de opción.

| Supuesto | Si falla |
|---|---|
| Leer y bloquear la sesión de juego en cada jugada es rápido de sobra para una partida en tiempo real | Se mide en las pruebas. Si no lo fuera, se retoma la copia en memoria de K2 |
| La regla de solo tipos se puede comprobar también en los archivos `.vue` del frontend | Los tipos del juego se exponen por una entrada del paquete que no contiene código, y la regla se escribe sobre esa entrada |
| La prueba en navegador tarda pocos minutos en GitHub | Se reduce a una partida completa y el resto de criterios se queda en las pruebas del servidor |
| Un temporizador del servidor puede dispararse un poco antes de la fecha límite | La operación de vencimiento vuelve a comprobar el reloj dentro de la transacción y, si aún no venció, programa otro temporizador |

## 11. Lo que no se decide ahora

| Asunto | Cuándo |
|---|---|
| No descontar el tiempo de una parada del servidor, abandono por desconexión y reenvío de la jugada sin respuesta | Hito 4 |
| Controles de tiempo por turnos de Cuatro en raya | Hito 5 |
| Estadísticas y administración, incluida la anulación por un administrador | Hito 6 |
| Librería de componentes | Con la administración visual o un segundo juego |
| Repetición de una partida jugada a jugada | Posterior al MVP. Exige cambiar el contrato de la API |
| Copia en memoria de las sesiones de juego | Solo si una medición lo pide |
| Reparto del resto del MVP en hitos (B1) | Al terminar este hito, que cierra el corte vertical |

## 12. Efecto sobre los documentos

Hechos al aceptarse las decisiones. Ninguno cambia un contrato.

| Documento | Cambio |
|---|---|
| `docs/02-arquitectura.md` | Se anota quién dirige la partida (K1), que no hay copia en memoria de las sesiones (K2) y la regla de solo tipos para el frontend (K7) |
| `docs/adr/0013-decisiones-del-hito-2.md` | Se anota en H1, con fecha, que quien se registra como iniciador es `game-sessions` |
| `planning/backlog-mvp.md` | La revisión periódica de relojes y la carga de la sesión desde la base de datos pasan del Hito 4 al Hito 3 (K2, K3). Se anota que las estadísticas se rellenan en el Hito 6 (K4) |
| `contracts/03-game-engine.md` | Se cierran dos de sus asuntos abiertos: los controles de tiempo de Cuatro en raya (K6) y el uso del motor en el frontend (K7) |
| `planning/decisiones-y-pendientes.md` y `docs/adr/README.md` | Se ponen al día |

## 13. Lo que resultó al construir

Añadido el 2026-11-16, al terminar el hito. No cambia ninguna decisión aceptada ni ningún contrato.

### Supuestos de la sección 10

| Supuesto | Resultado |
|---|---|
| Leer y bloquear la sesión de juego en cada jugada es rápido de sobra para una partida en tiempo real | **Se cumple.** En la prueba en navegador, una partida de 42 jugadas, cada una pulsada en el tablero y esperada en las dos pantallas, tarda 2,7 segundos: unos 65 milisegundos por jugada de extremo a extremo, con la base de datos en la misma máquina. No hace falta la copia en memoria |
| La regla de solo tipos se puede comprobar también en los archivos `.vue` del frontend | **Se cumple.** Una importación de código del motor desde un archivo `.vue` o `.ts` del frontend falla en el análisis del código y en las reglas de dependencias, y una importación con `import type` pasa. No hizo falta la entrada sin código |
| La prueba en navegador tarda pocos minutos en GitHub | **Se cumple.** En la primera ejecución en GitHub, las siete pruebas tardaron 11 segundos y el trabajo entero, con la instalación, la compilación y la descarga del navegador, 1 minuto y 6 segundos |
| Un temporizador del servidor puede dispararse un poco antes de la fecha límite | **Se cumple con la salida prevista.** La operación de vencimiento vuelve a comprobar el reloj dentro de la transacción y, si aún no venció, programa otro temporizador. Hay una prueba de ese caso |

### Cómo se comprueban los diez criterios de aceptación

El paquete `e2e` levanta la API compilada, con una base de datos propia que crea de cero, y el frontend construido como archivos estáticos. Cada prueba crea sus cuentas desde la página de registro y usa un navegador por persona. Son siete pruebas independientes, y no una sola, para que un fallo señale el criterio que se rompe.

| Criterio | Prueba |
|---|---|
| 1 | Crear la cuenta, salir, fallar la contraseña y volver a entrar |
| 2, 3, 4, 8 y 9, y el final por cuatro en línea del 7 | Una partida entera: sala creada y encontrada en la lista, marcas de listo, jugadas alternas con el tablero y los dos relojes al día en las dos pantallas, resultado, historial con el tablero final, vuelta a la sala y revancha con los asientos cambiados |
| 5 y 6 | Jugada fuera de turno, en columna llena, en una columna que no existe y sobre un estado antiguo, cada una con su código; y la misma jugada enviada dos veces con el mismo identificador, que se aplica una vez |
| 7 | Tres pruebas más, una por final: rendición, tiempo agotado y tablero lleno |
| 10 | Una tercera persona no puede jugar, rendir, seguir ni ver la partida; quien no tiene el turno no puede jugar diciendo que es el otro asiento o la otra persona; sin sesión no se llega a la página |

Dos cosas se hacen por debajo de la página, porque la aplicación no las permite:

- **Órdenes inválidas.** Para los criterios 5, 6 y 10, la prueba abre una conexión propia desde la página de cada persona, que lleva su sesión, y envía la orden a mano. Así se comprueba que decide el servidor, envíe lo que envíe el navegador.
- **Tiempo agotado.** El reloj más corto es de tres minutos. La prueba retrasa diez minutos, en la base de datos, el inicio del turno de quien tiene que jugar. A partir de ahí el servidor detecta el vencimiento por su cuenta con la revisión periódica (K3), que en estas pruebas pasa cada segundo.

Además, una partida entera se jugó con dos navegadores en `pnpm dev:https`, con la cookie `__Host-session` marcada como `Secure`.

Las pruebas del servidor cubren lo que el navegador no ve bien, como preveía K8: jugadas simultáneas, el vencimiento con el tiempo controlado, el final en una sola transacción, la anulación por fallo y la migración que da de alta el juego, que se aplica sobre una base de datos recién creada.

### Elecciones menores tomadas al construir

Ninguna estaba en las veintidós decisiones y ninguna cambia un contrato. Se aplicaron como recomendaciones y **quedaron confirmadas el 2026-11-16** por quien decide, las siete. Con L3, la lista de partidas en curso que K15 dejaba para el Hito 5 queda hecha en su primera versión; con L4, el reenvío de la orden sin respuesta deja de ser tarea del Hito 4.

| ID | Asunto | Lo que se hizo | Alternativa |
|---|---|---|---|
| L1 | Rendición que llega con un reloj ya agotado | Antes de aplicar una rendición se aplican los vencimientos pendientes. Si el reloj de alguien ya se había agotado, la partida termina por tiempo | Aplicar la rendición tal cual. Quien ya perdió por tiempo podría cambiar el motivo del final, y quien iba a ganar por el tiempo del rival podría perder por rendirse un instante tarde |
| L2 | Respuesta a la orden que provoca una anulación por fallo (K12) | Quien la envió recibe `MATCH_NOT_IN_PROGRESS`, y todos los suscritos reciben la partida ya anulada | No responder a esa orden y dejar solo el aviso general. El cliente se queda esperando una respuesta que no llega |
| L3 | Partidas en curso en la página `/partidas`. **Se aparta de K15**, que dejaba esa lista para el Hito 5 | Además del historial (K16), la página muestra las partidas en curso, con a quién le toca y un enlace para volver a cada una. La API ya las daba (K15). Sin esto, quien cierra la pestaña en mitad de una partida no tiene cómo volver a ella: la sala ya no sale en la lista de salas en espera, y el límite de una partida simultánea le impide empezar otra | Cumplir K15 al pie de la letra y quitar la lista hasta el Hito 5. Mientras tanto, para volver a una partida hay que conservar su dirección |
| L4 | Orden de juego que se queda sin respuesta al cortarse la conexión. **Adelanta un punto que la sección 11 dejaba para el Hito 4** | El frontend la vuelve a enviar al reconectar, con el mismo identificador de petición, y el servidor no la aplica dos veces. Se hizo ya porque, sin ello, el tablero se queda bloqueado esperando una respuesta | Esperar al Hito 4. Mientras tanto, dar la orden por fallida al cortarse la conexión y pedir a la persona que repita la jugada |
| L5 | Quien abre la sala cuando la partida ya empezó. Precisa K18, que solo habla de quien está en la sala en ese momento | Ve un enlace "Ir a la partida" y no pasa sola a ella. Solo pasa sola quien está en la página de la sala en el momento en que la partida empieza | Llevar siempre a la partida a quien abre una sala que tiene una en curso. Impide ver la sala mientras se juega |
| L6 | Bloqueo de la fila del jugador al comprobar su límite de partidas (ADR-013, H7) | Pasa de `FOR UPDATE` a `FOR NO KEY UPDATE`. El bloqueo fuerte chocaba con la comprobación de claves foráneas al guardar los jugadores de una partida que empieza, y dos transacciones podían quedar esperándose una a la otra | Mantener `FOR UPDATE` y reintentar la transacción cuando PostgreSQL detecte el interbloqueo |
| L7 | Puertos de las pruebas en navegador | Usan los de `pnpm dev`, 3000 y 3001, porque el frontend construido lleva dentro el origen de la API. No se pueden ejecutar con `pnpm dev` en marcha: avisan y no arrancan | Construir el frontend una segunda vez con otro origen. Permite ejecutarlas junto a `pnpm dev`, a cambio de una segunda construcción y una segunda carpeta de salida |

### Otras notas

- El paquete de contratos tiene un esquema nuevo, `listMyMatchesQuerySchema`, para los parámetros de `GET /me/matches`. Sigue lo que ya decía el contrato de la API, que no cambia.
- Variables de entorno nuevas: `MATCH_CLOCK_CHECK_SECONDS` en el backend (K22), y `E2E_DATABASE_URL` y `E2E_CHROMIUM_PATH` en las pruebas en navegador.
- Las pruebas del backend vacían la base de datos después de migrar, para que cada una parta de un catálogo vacío.

### Lo que queda sin hacer, y dónde

| Asunto | Cuándo |
|---|---|
| Reparto del resto del MVP en hitos (B1). El corte vertical está terminado | Ahora |
| Pruebas en navegador con otros navegadores además de Chromium, y en el modo HTTPS, que se recorrió a mano | Con la preparación para publicar, en el Hito 7 |
| Prueba en Windows. Todo se ejecutó en Linux | Al probarlo en el equipo de quien decide |
