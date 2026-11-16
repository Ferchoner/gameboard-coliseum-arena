# ADR-013: Decisiones del Hito 2, salas y tiempo real

| Campo | Valor |
|---|---|
| **Estado** | Aceptada, con un cambio en H3 |
| **Fecha** | 2026-11-16 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | El asunto abierto sobre `rooms` y `matches` (`docs/02-arquitectura.md`, sección 10) y lo que ADR-012 dejó para el Hito 2 (sección 11) |
| **Depende de** | ADR-003, ADR-004, ADR-009, ADR-010, ADR-012, el modelo de datos y los contratos de la API y de tiempo real |

## 1. Contexto

El Hito 2 está autorizado desde el 2026-11-16 con una condición: sus decisiones abiertas se presentan antes de escribir código. Su alcance, según el backlog:

- Crear, listar, ver, entrar, salir y marcarse listo, por la API.
- Capacidad comprobada de forma atómica (7.15) y límite de partidas simultáneas (7.30).
- Conexión WebSocket con identidad en la apertura, latidos y cierre al terminar la sesión.
- Suscripción a salas, avisos de cambios y presencia.
- Cierre de salas inactivas (7.14).
- Frontend: lista de salas y sala de espera.

Los contratos ya fijan qué hace cada operación y cada mensaje. Lo que falta decidir es cómo se construye, y qué hacer con dos huecos que aparecen porque las partidas y el primer juego llegan en el Hito 3.

## 2. Cómo leer este documento

- Cada decisión tiene un identificador (H1 a H20), sus alternativas y una recomendación.
- Las decisiones H1 a H9 afectan a la arquitectura o cuesta deshacerlas. Van explicadas una a una.
- Las decisiones H10 a H20 son menores y fáciles de cambiar. Van en una tabla.
- **Las 20 se aceptaron el 2026-11-16 tal como se recomendaban, con un cambio:** en H3 no se añade ningún juego de demostración.

## 3. Resumen

| ID | Asunto | Recomendación |
|---|---|---|
| H1 | Quién depende de quién entre `rooms` y `matches` | `rooms` define una interfaz pequeña y `matches` la implementa. La dependencia va en un solo sentido: `matches` conoce a `rooms`, y no al revés |
| H2 | Qué pasa en este hito cuando una sala cumple la condición de inicio | Nada todavía. La sala se queda en espera, completa. El inicio se conecta en el Hito 3 sin tocar `rooms` |
| H3 | Cómo probar las salas a mano si el catálogo está vacío | Se recomendó un juego de demostración solo en local. **Decisión: no se añade nada.** Las salas se comprueban con pruebas automáticas y a mano desde el Hito 3 |
| H4 | Servidor WebSocket | El adaptador oficial de NestJS sobre la librería `ws`, con la sesión comprobada antes de aceptar la conexión |
| H5 | Cómo avisan los módulos sin conocer el WebSocket | Una interfaz neutral de difusión y presencia, que `realtime` implementa. `rooms` y `auth` no importan `realtime` |
| H6 | Cómo se garantiza que solo se avisa después de guardar | La transacción lleva una lista de avisos pendientes, que se envían solo si se confirma |
| H7 | Capacidad atómica y límite de partidas simultáneas | Bloqueo de fila en PostgreSQL: primero la del jugador y después la de la sala, siempre en ese orden |
| H8 | Tareas periódicas: cierre de salas inactivas y revalidación de sesiones | Temporizadores propios, sin librería. Cada sala se cierra en su propia transacción |
| H9 | Límites del canal de tiempo real | Ahora los de tamaño, conexiones y suscripciones. Los de frecuencia, en el Hito 7 con los de la API |
| H10 a H20 | Decisiones menores | [Sección 7](#7-decisiones-menores) |

---

## 4. Módulos y alcance

### H1. Dependencia entre `rooms` y `matches`

Los dos módulos se necesitan en los dos sentidos. `rooms` tiene que arrancar la partida cuando la sala cumple la condición de inicio, en la misma transacción (modelo de datos, sección 6). Y el final de la partida tiene que devolver la sala a la espera o cerrarla, también en la misma transacción.

| Opción | A favor | En contra |
|---|---|---|
| **`rooms` define una interfaz, "iniciador de partidas", y `matches` la implementa.** Para devolver la sala a la espera, `matches` llama a `rooms` directamente | La dependencia va en un solo sentido y la comprueba la regla de dependencias. La transacción la abre quien recibe la petición y se la pasa al otro (decisión D4). Es la opción preferente que ya anotaba la arquitectura | `rooms` no puede leer nada de `matches` salvo a través de esa interfaz |
| Un tercer módulo que coordina a los dos | Ninguno de los dos conoce al otro | Un módulo más, sin datos propios, por el que pasa toda operación de sala. Reparte en dos sitios reglas que hoy tienen un dueño claro |
| Eventos internos: cada módulo publica lo que ocurre y el otro reacciona | Desacoplamiento máximo | Mantener una sola transacción entre quien publica y quien reacciona es difícil de garantizar y de seguir al leer el código. El modelo exige esa transacción única |

**Recomendación:** la interfaz definida en `rooms`.

*Nota del 2026-11-16: al diseñar la interfaz en el Hito 3 se vio que `matches` y `game-sessions` se necesitarían en los dos sentidos. Quien se registra como iniciador de partidas es `game-sessions`, que dirige la partida y usa a `matches` como registro (ADR-014, decisión K1). Lo esencial de H1 no cambia: `rooms` no conoce a ninguno de los dos.*

La interfaz tiene dos operaciones: iniciar una partida para una sala, dentro de la transacción recibida, y decir cuál es la partida en curso de una sala. La segunda existe porque la vista de sala lleva `currentMatchId` y el modelo de datos aceptado no guarda ese dato en `rooms`: está en `matches`. Así no hay que cambiar el modelo. Su forma exacta se confirma en el Hito 3, cuando exista quien la implemente.

### H2. Qué pasa en este hito cuando una sala cumple la condición de inicio

Las reglas 7.9 y 7.10 dicen que la partida empieza sola cuando la sala está completa y, en tiempo real, todos están listos. El contrato de la API añade que la respuesta ya trae la sala en `IN_MATCH`. Pero el inicio de partida, con sus tablas y su sorteo de asientos, es del Hito 3.

| Opción | A favor | En contra |
|---|---|---|
| **`rooms` comprueba la condición y llama a la interfaz de H1. En este hito nadie la implementa, y la sala se queda en espera, completa y con todos listos** | El Hito 2 no adelanta nada del Hito 3. El Hito 3 conecta el inicio sin modificar `rooms`. Las pruebas del Hito 2 ya comprueban, con un iniciador de prueba, que la llamada ocurre en el momento y en la transacción correctos | Hasta el Hito 3, una sala completa no hace nada más. La frase del contrato sobre `IN_MATCH` no se cumple todavía |
| Adelantar al Hito 2 la creación de la partida | El contrato de salas se cumple entero desde ya | Trae al Hito 2 cuatro tablas, el sorteo de asientos y el estado inicial del motor. Dejaría partidas en curso que nadie puede jugar hasta el Hito 3 |

**Recomendación:** la primera. Es un hueco temporal y conocido, y queda anotado en el backlog.

### H3. Cómo probar las salas a mano con el catálogo vacío

Una sala es siempre de un juego, y crearla exige que el motor valide sus opciones. El primer motor, Cuatro en raya, es del Hito 3. Hasta entonces el catálogo está vacío, así que en ejecución no se podría crear ninguna sala. Las pruebas automáticas no tienen ese problema, porque usan un motor de prueba.

| Opción | A favor | En contra |
|---|---|---|
| **Un juego de demostración, solo en local.** Usa el motor de prueba que ya existe. Solo se registra y se da de alta si una variable de entorno lo pide, y `pnpm dev` la activa. El servidor se niega a arrancar con ella en producción. Se retira en el Hito 3 | Las salas, la sala de espera y la presencia se pueden ver y probar en el navegador desde este hito | Es código que se va a tirar. Hay que asegurar que nunca llega a producción |
| No añadir nada. El Hito 2 se comprueba solo con pruebas automáticas, y a mano desde el Hito 3 | Ni una línea de más | No se puede ver el frontend de salas funcionando hasta el hito siguiente |
| Adelantar el motor de Cuatro en raya | El juego de verdad desde ya | Es trabajo del Hito 3 y tiene una decisión abierta propia: qué controles de tiempo ofrece |

**Recomendación:** el juego de demostración. Declararía de 2 a 4 jugadores y las dos modalidades, para poder ver también una sala con más de dos plazas y la opción de revancha por turnos.

**Decisión (2026-11-16): no añadir nada.** No hay juego de demostración. En ejecución el catálogo sigue vacío y no se puede crear ninguna sala hasta el Hito 3. El Hito 2 se comprueba con pruebas automáticas, que usan el motor de prueba, y el frontend de salas se recorre en un navegador con ese mismo motor cargado solo para la comprobación, sin que quede en el repositorio.

---

## 5. Tiempo real

### H4. Servidor WebSocket

ADR-003 ya eligió WebSocket nativo con el adaptador oficial de NestJS (condición 5.1) y la identidad resuelta al abrir la conexión (condición 5.4). Falta confirmar que el adaptador actual lo permite.

| Opción | A favor | En contra |
|---|---|---|
| **El adaptador oficial, `@nestjs/platform-ws`, sobre la librería `ws`** | Es lo que fija ADR-003. La versión 12.5.0 admite un analizador de mensajes propio, que hace falta para el sobre del protocolo, un tamaño máximo de mensaje con cierre 1009, y una comprobación previa a aceptar la conexión que puede consultar la base de datos | Dos dependencias nuevas en el backend |
| Usar `ws` directamente, sin el adaptador | Una dependencia menos y control total | Contradice ADR-003 y obliga a mantener a mano lo que el adaptador ya resuelve |

**Recomendación:** el adaptador oficial.

Cómo queda la apertura, según el contrato: la sesión y el origen se comprueban antes de aceptar la conexión, y si fallan el navegador recibe un rechazo sin más detalle. Con una versión de protocolo no admitida, la conexión se acepta y se cierra con el código 4002.

### H5. Cómo avisan los módulos sin conocer el WebSocket

La arquitectura exige que `realtime` sea el único módulo que conoce el transporte y que todo aviso pase por una única interfaz de difusión. Pero `realtime` necesita a `rooms` para saber si quien se suscribe es miembro, y `rooms` necesita avisar de sus cambios y saber quién está conectado, porque la vista de sala lleva la presencia. Si los dos se importan entre sí, hay un ciclo.

| Opción | A favor | En contra |
|---|---|---|
| **Una interfaz neutral, fuera de los dos módulos, que `realtime` implementa.** Tiene tres operaciones: avisar de que una sala cambió o se cerró, avisar de que una sesión de autenticación terminó, y preguntar si un jugador está conectado | `rooms` y `auth` dependen solo de la interfaz. `realtime` depende de `rooms`. No hay ciclo y la regla de dependencias lo comprueba. Es el punto único donde entraría Redis si algún día hay varias instancias | Una pieza más que entender |
| Eventos internos de NestJS | Sin interfaz propia | El orden y el momento de entrega son menos explícitos, y el aviso tras guardar (H6) es más difícil de garantizar |
| Que `rooms` importe `realtime` | Lo más directo | Crea el ciclo y rompe la regla 6 de la arquitectura |

**Recomendación:** la interfaz neutral.

`rooms` avisa de qué sala cambió, y `realtime` compone la vista completa con la presencia y la envía a los suscritos, como pide el protocolo (decisión T3). El cierre de conexiones con el código 4001 al salir usa la misma interfaz: `auth` avisa de que la sesión terminó.

### H6. Avisar solo después de guardar

La regla 8.9 dice que nada se envía a los clientes hasta que la transacción se confirma. Una operación puede atravesar varios módulos dentro de la misma transacción, por ejemplo entrar a una sala y, desde el Hito 3, iniciar la partida.

| Opción | A favor | En contra |
|---|---|---|
| **La transacción lleva una lista de avisos pendientes.** Cualquier módulo que participa añade los suyos. Se envían al confirmarse y se descartan si se revierte | Funciona igual con uno o con varios módulos en la misma transacción. Es imposible avisar de algo que no se guardó | Un mecanismo más en la capa de datos |
| Que cada servicio avise al terminar su transacción | Sin mecanismo nuevo | Solo sirve si el servicio abrió la transacción. En cuanto participa en la de otro, no sabe cuándo se confirma |

**Recomendación:** la lista de avisos pendientes en la transacción.

---

## 6. Datos y operación

### H7. Capacidad atómica y límite de partidas simultáneas

Dos personas no pueden ocupar la última plaza a la vez (7.15), y un jugador no puede superar su límite entrando a dos salas al mismo tiempo (7.30, decisión R7 del modelo).

| Opción | A favor | En contra |
|---|---|---|
| **Bloqueo de fila.** Toda operación que cambia la pertenencia bloquea primero la fila del jugador y después la de la sala, siempre en ese orden, y entonces cuenta y escribe | Correcto con una instancia y con varias. El orden fijo evita bloqueos mutuos. Serializa también la comprobación de la condición de inicio | Las operaciones sobre una misma sala esperan su turno. Con salas de pocas plazas no se nota |
| Una sola sentencia que inserta solo si quedan plazas | Sin bloqueos explícitos | Con el aislamiento por defecto de PostgreSQL, dos inserciones simultáneas pueden pasar las dos. Habría que subir el nivel de aislamiento y reintentar |
| Un contador de plazas en la sala | Lectura rápida | Un dato duplicado que hay que mantener al día. El modelo aceptado no lo tiene |

**Recomendación:** bloqueo de fila. La fila del jugador pertenece al módulo `players`, que ofrece la operación de bloqueo; `rooms` no toca esa tabla.

### H8. Tareas periódicas

Este hito trae las dos primeras: cerrar las salas en espera sin actividad (7.14) y revalidar la sesión de cada conexión abierta (protocolo, sección 9).

| Opción | A favor | En contra |
|---|---|---|
| **Temporizadores propios**, dentro del módulo dueño de cada tarea | Sin dependencias. La lógica es una función normal que las pruebas llaman con el reloj de prueba | Unas pocas líneas de arranque y parada por tarea |
| `@nestjs/schedule` | Declarativo | Una dependencia para dos temporizadores |

**Recomendación:** temporizadores propios.

La revisión de salas inactivas se ejecuta cada minuto. Cada sala se cierra en su propia transacción, con el mismo bloqueo de H7 y volviendo a comprobar que sigue inactiva, y avisa con `ROOM_CLOSED`. Los plazos son los de la regla 7.14: 30 minutos en tiempo real y 7 días por turnos.

### H9. Límites del canal de tiempo real

El protocolo fija seis límites (sección 9). El backlog sitúa los límites de frecuencia en el Hito 7.

| Opción | A favor | En contra |
|---|---|---|
| **Ahora los límites de forma: tamaño de mensaje (16 KiB), conexiones por jugador (5) y suscripciones por conexión (20). El de frecuencia de órdenes, en el Hito 7** | Coherente con el backlog y con lo hecho en la API. Los de forma son parte de abrir bien la conexión y cuestan poco | Hasta el Hito 7 una conexión puede enviar órdenes sin tope. En local no es un riesgo |
| Todos ahora | El canal queda completo | Adelanta trabajo del Hito 7 y sus valores se van a ajustar con datos reales |

**Recomendación:** los de forma ahora. Los intervalos del latido (25 segundos) y de la revalidación (60 segundos) también se implementan ahora, porque son parte de la conexión.

---

## 7. Decisiones menores

| ID | Asunto | Recomendación | Alternativa |
|---|---|---|---|
| H10 | Dependencias nuevas | En el backend, `@nestjs/websockets` y `@nestjs/platform-ws` 12.5.0, que trae `ws` 8.22.1. En el frontend, ninguna: el WebSocket del navegador y código propio para reconectar, como pide ADR-003 (condición 5.6) | Una librería de reconexión en el frontend |
| H11 | Validación de las órdenes del protocolo | Esquemas de Zod en el paquete de contratos, comprobados contra los tipos del protocolo, igual que los de la API | Validar a mano en `realtime` |
| H12 | Órdenes de partida antes del Hito 3 | `SUBSCRIBE_MATCH`, `SUBMIT_ACTION` y `RESIGN_MATCH` se responden con `COMMAND_REJECTED` y `MATCH_NOT_FOUND`, que es cierto: no existe ninguna partida | Tratarlas como mensaje inválido |
| H13 | Presencia al recargar la página | Sin margen de espera. Recargar cierra y abre la conexión, y los demás ven al jugador desconectarse y volver. Se revisa con la reconexión, en el Hito 4. *Cerrada el 2026-11-16 por ADR-015, V3: un margen de 5 segundos* | Esperar unos segundos antes de dar a alguien por desconectado. El protocolo no lo contempla |
| H14 | Qué cuenta como actividad de una sala | Lo que dice el modelo de datos: entrar, salir, marcarse listo y el final de una partida. Tener la sala abierta en pantalla no cuenta | Contar también la presencia de sus miembros. Cambiaría la regla 7.14 |
| H15 | Lista de salas | Las más recientes primero, 20 por página, con un cursor opaco sobre la fecha de creación y el identificador | Paginar por número de página. El contrato ya pide cursor |
| H16 | Configuración nueva | Variables de entorno para los límites de partidas simultáneas, los plazos de inactividad y los límites e intervalos del canal, con los valores iniciales de las reglas y del protocolo | Dejarlos fijos en el código. Las reglas 7.14 y 7.30 piden que sean configurables |
| H17 | Frontend | Páginas `/salas` y `/salas/[roomId]`. Una sola conexión para toda la aplicación, abierta al iniciar sesión. La lista se actualiza con un botón y al volver a la pestaña, porque no es en vivo (decisión T16). Sigue sin librería de componentes ni de estado | Elegir ya esas librerías. ADR-012 lo dejó para el Hito 3 |
| H18 | Pruebas | Las del WebSocket usan un cliente real contra el servidor en un puerto libre. Las de capacidad lanzan peticiones simultáneas de verdad contra PostgreSQL. Las pruebas en navegador siguen para el Hito 3 (ADR-012, S18); mientras tanto recorro el flujo a mano en los dos modos | Simular el transporte |
| H19 | Una conexión abierta mantiene viva la sesión | La revalidación periódica cuenta como actividad de la sesión, como fija el protocolo (decisión T11) | Ninguna. Se anota porque cambia cómo se renueva la sesión |
| H20 | Tablas de este hito | Solo `rooms` y `room_players`, en una migración nueva. Las de partidas llegan con el Hito 3 | Crear ya las de partidas, vacías |

---

## 8. Huecos y contradicciones encontrados

| Hallazgo | Qué se propone |
|---|---|
| El contrato de la API dice que entrar o marcarse listo puede devolver la sala ya en `IN_MATCH`. En este hito no puede ocurrir, porque las partidas son del Hito 3 | H2. Hueco temporal, anotado en el backlog |
| El catálogo está vacío hasta el Hito 3, y sin juego no se puede crear una sala | H3. Se acepta: las salas se prueban a mano desde el Hito 3 |
| La vista de sala lleva `currentMatchId`, pero la tabla `rooms` del modelo aceptado no lo guarda | H1. `rooms` lo pregunta por la interfaz. El modelo no cambia |
| El backlog pone el cierre de conexiones al terminar la sesión en el Hito 2 y los límites de frecuencia en el Hito 7, pero el protocolo los lista juntos | H9 |

Ninguno obliga a cambiar un contrato ni un ADR aceptado.

## 9. Lo que se comprobó antes de recomendar

| Comprobación | Resultado |
|---|---|
| `@nestjs/platform-ws` 12.5.0, leído su código publicado | Admite un analizador de mensajes propio y un tamaño máximo de mensaje con cierre 1009. Espera a una comprobación asíncrona antes de aceptar la conexión y rechaza al cliente si esa comprobación falla |
| Versiones disponibles | `@nestjs/websockets` 12.5.0, `@nestjs/platform-ws` 12.5.0, `ws` 8.22.1 como dependencia del adaptador |

## 10. Supuestos que se comprueban al construir

Si alguno falla, se avisa antes de cambiar de opción.

| Supuesto | Si falla |
|---|---|
| El navegador envía la cookie de sesión al abrir el WebSocket desde el otro origen, en el modo HTTP y en el HTTPS | Se revisa con ADR-004 antes de seguir. Es la base de la identidad del canal |
| La comprobación previa a la conexión puede usar los servicios de `auth` del backend | Se extiende el adaptador oficial con una clase pequeña, sin dejar de usarlo |
| Las pruebas pueden abrir conexiones reales contra el servidor de pruebas | Se arranca el servidor de pruebas en un puerto libre solo para esas pruebas |

## 11. Lo que no se decide ahora

| Asunto | Cuándo |
|---|---|
| Forma definitiva de la interfaz entre `rooms` y `matches` | Hito 3, al implementarla |
| Librería de componentes del frontend y uso del motor en el navegador | Hito 3 (ADR-012, S24 y S25) |
| Margen de espera en la presencia y abandono por desconexión | Hito 4. Decidido en ADR-015 |
| Límites de frecuencia de la API y del canal | Hito 7 |
| Cierre de salas por un administrador | Con la administración, en el resto del MVP |

## 12. Efecto sobre los documentos

Hechos al aceptarse las decisiones. Ninguno cambia un contrato.

| Documento | Cambio |
|---|---|
| `docs/02-arquitectura.md` | Se cierra el asunto abierto sobre `rooms` y `matches` (H1) y se anotan la interfaz neutral de difusión y presencia (H5) y el aviso tras guardar (H6) |
| `planning/backlog-mvp.md` | Se anota en el Hito 2 que el inicio de partida se conecta en el Hito 3 (H2) y que las salas se prueban a mano desde ese hito (H3) |
| `planning/decisiones-y-pendientes.md` y `docs/adr/README.md` | Se ponen al día |

---

## 13. Lo que resultó al construir

Añadido el 2026-11-16, al terminar el hito. No cambia ninguna decisión aceptada.

### Supuestos de la sección 10

| Supuesto | Resultado |
|---|---|
| El navegador envía la cookie de sesión al abrir el WebSocket desde el otro origen, en el modo HTTP y en el HTTPS | **Se cumple.** Comprobado en un navegador con dos personas en la misma sala, en `pnpm dev`, en `pnpm dev:https` (cookie con `Secure` y prefijo `__Host-`) y con el frontend generado como archivos estáticos |
| La comprobación previa a la conexión puede usar los servicios de `auth` | **Se cumple con la salida prevista.** El adaptador oficial se extiende con una clase pequeña, `RealtimeWsAdapter`, que comprueba el origen y la sesión antes de aceptar la conexión |
| Las pruebas pueden abrir conexiones reales contra el servidor de pruebas | **Se cumple.** El servidor de pruebas escucha en un puerto libre y las pruebas usan un cliente WebSocket real |

### Cómo se probó sin juego (H3)

El catálogo sigue vacío y en el repositorio no hay ningún juego de demostración. Las pruebas automáticas registran un motor de prueba solo durante su ejecución. El frontend se recorrió en un navegador con ese mismo motor cargado desde fuera del repositorio: crear una sala, verla en la lista, entrar, marcas de listo, presencia al cerrar y reabrir la pestaña, reconexión tras reiniciar el servidor, salida, cierre de la sala cuando sale quien la creó y aviso del límite de partidas simultáneas.

### Elecciones menores tomadas al construir

Ninguna estaba en las veinte decisiones y ninguna cambia un contrato. Se aplicaron como recomendaciones y **quedaron confirmadas el 2026-11-16**, junto con las decisiones del Hito 3.

| ID | Asunto | Lo que se hizo | Alternativa |
|---|---|---|---|
| C1 | `UNSUBSCRIBE_ROOM` y `UNSUBSCRIBE_MATCH` de quien no está suscrito | Se responde igual que si lo estuviera, con `ROOM_UNSUBSCRIBED` o `MATCH_UNSUBSCRIBED`. Pedirlo dos veces no es un error | Rechazarlo. Obliga al cliente a tratar como fallo algo que ya está como quería |
| C2 | Identificador de sala con formato inválido en la dirección | `ROOM_NOT_FOUND`, igual que una sala que no existe | `VALIDATION_ERROR`. Distingue dos casos que para quien llama son el mismo |
| C3 | Miembros de una sala cerrada | Sus filas se conservan y dejan de contar para el límite de partidas simultáneas. Quien seguía dentro puede ver la sala cerrada con su motivo, y salir de ella | Borrarlas al cerrar. Se pierde quién estaba y el aviso del motivo a quien vuelve más tarde |
| C4 | Cómo se registra el iniciador de partidas (H1). Desde ADR-014, K1, quien se registra es `game-sessions` | `rooms` expone un punto de registro, `MatchStarterSlot`. Mientras nadie se registra, se usa el iniciador que no inicia nada (H2). Una regla automática impide que `rooms` importe `matches` | Inyección directa del módulo `matches`, que crearía la dependencia circular que H1 evita |
| C5 | Marca de listo repetida | Marcarse listo cuando ya se estaba no cuenta como actividad de la sala ni genera aviso | Contarla. Permitiría mantener viva una sala inactiva sin cambiar nada |

### Lo que queda sin hacer, y dónde

| Asunto | Cuándo |
|---|---|
| Cierre con el código 1008 por incumplir el protocolo de forma repetida. El protocolo lo liga a los límites de frecuencia, que H9 dejó fuera de este hito. Hoy cada mensaje inválido se rechaza y la conexión sigue abierta | Hito 7 |
| El texto "Todos están listos. La partida empezará enseguida" se queda en pantalla, porque todavía nada inicia la partida (H2) | Hito 3. **Resuelto el 2026-11-16:** la partida empieza y la página pasa a ella |
| Prueba en Windows. Todo se ejecutó en Linux | Al probarlo en el equipo de quien decide |
