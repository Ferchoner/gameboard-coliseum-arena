# ADR-016: Decisiones del Hito 5, modalidad por turnos

| Campo | Valor |
|---|---|
| **Estado** | Propuesta |
| **Fecha** | 2026-11-18 |
| **Propuesta para** | Fernando Hernandez Argueta |
| **Cierra** | Los controles de tiempo por turnos de Cuatro en raya (ADR-014, K6) y el abandono en el móvil (ADR-015, sección 11) |
| **Depende de** | ADR-008 (puntos 9 a 11), ADR-009 (reglas 7.2, 7.10, 7.14, 7.27, 7.30 y 7.31), ADR-013, ADR-014, ADR-015, el protocolo de tiempo real y la API |

---

## 1. Contexto

El Hito 5 está autorizado desde el 2026-11-18, con la condición de siempre: sus decisiones abiertas se presentan antes de escribir código. Su alcance, según el backlog:

- Salas por turnos: inicio al completarse la sala y revancha opcional (7.10, 7.31).
- Controles de tiempo de 12, 24 y 36 horas, y límite de 20 partidas simultáneas (7.2, 7.30).
- Lista de "mis partidas en curso", que indica en cuáles te toca.
- Aviso de turno dentro de la aplicación.
- Aplicación instalable como PWA.

**Criterio de aceptación:** dos personas juegan una partida completa sin coincidir conectadas en ningún momento, y cada una ve al entrar que le toca.

Buena parte del hito ya está hecha, porque los hitos 2 a 4 construyeron la plataforma para las dos modalidades. Lo comprobé en el código y en sus pruebas:

| Tarea | Estado |
|---|---|
| Crear salas por turnos, con la revancha desactivada por defecto | Hecho en el Hito 2, con pruebas |
| Inicio de la primera partida al completarse la sala, sin marcas de "listo" (7.10) | Hecho en el Hito 3, con pruebas |
| Revancha por turnos: la sala vuelve a la espera y la siguiente partida espera a que todos estén listos (7.31) | Hecho en el Hito 3, con pruebas. Sin revancha, la sala se cierra con el motivo `MATCH_ENDED` |
| Límite de 20 partidas por turnos, configurable (7.30) | Hecho en el Hito 2, con pruebas. Cuenta las salas no cerradas de esa modalidad (R7) |
| Cierre de la sala por turnos en espera tras 7 días sin actividad (7.14) | Hecho en el Hito 2, con pruebas |
| Relojes de cualquier duración, con temporizador exacto y revisión periódica | Hecho en el Hito 3. Los temporizadores admiten hasta 24 días |
| Sin abandono por desconexión por turnos (7.27), y turno desplazado tras una parada del servidor | Hecho en el Hito 4 (W5) |
| `GET /me/matches?status=IN_PROGRESS`, con `yourTurn` y `turnDeadlineAt` | Hecho en el Hito 3 |
| Aviso personal `PLAYER_MATCH_UPDATED` a todas las conexiones de cada participante, al empezar, en cada jugada y al terminar | Hecho en el Hito 3 (T4, K14). Hoy el frontend solo lo usa para la advertencia de V8 |
| Página `/partidas` con las partidas en curso y la marca "Te toca" | Hecha en el Hito 3 (L3) |
| Sesión de 30 días sin uso y 90 en total | Hecho en el Hito 1. Basta para partidas de varios días |

Todo eso se probó con un juego de pruebas, no con Cuatro en raya, que hoy no admite la modalidad por turnos (K6). Lo que falta es ofrecerla en Cuatro en raya, el aviso de turno, que la lista sirva para jugar muchas partidas a la vez, la aplicación instalable y la prueba del criterio de aceptación. Son las decisiones de este documento.

## 2. Cómo leer este documento

- Cada decisión tiene un identificador (N1 a N12), sus alternativas y una recomendación.
- Las decisiones N1 a N6 afectan a la experiencia, a la arquitectura o cuesta deshacerlas. Van explicadas una a una.
- Las decisiones N7 a N12 son menores y fáciles de cambiar. Van en una tabla.
- Nada de esto está aprobado hasta que quien decide lo confirme.
- **Ninguna cambia un contrato ni una regla aceptada, y ninguna añade dependencias.** Una pide atención: **N1** precisa qué cuenta como versión nueva de un juego en el catálogo.

## 3. Resumen

| ID | Asunto | Recomendación |
|---|---|---|
| N1 | Cuatro en raya por turnos | Ofrecer 12, 24 y 36 horas en la versión 1.0.0, sin versión nueva |
| N2 | Aviso de turno | Contador en la cabecera, aviso emergente con enlace a la partida y el número en el título de la pestaña. Sin notificaciones del sistema |
| N3 | Qué ve cada uno al entrar | La portada y `/partidas` muestran primero las partidas en las que te toca, ordenadas por la que vence antes, con la hora límite |
| N4 | Aplicación instalable | Manifiesto e iconos propios y un service worker pequeño escrito a mano, sin dependencias |
| N5 | Abandono en el móvil | Se mantiene la regla 7.26 y se avisa en la partida en tiempo real de que salir de la aplicación cuenta como desconexión |
| N6 | Pruebas | Prueba en navegador del criterio con dos personas que nunca coinciden, pruebas del servidor con Cuatro en raya por turnos y el tiempo controlado, y una prueba de la PWA |
| N7 a N12 | Decisiones menores | [Sección 8](#8-decisiones-menores) |

---

## 4. El juego

### N1. Cuatro en raya por turnos

Hoy el motor de Cuatro en raya declara 3, 5 y 10 minutos en tiempo real y ninguno por turnos (K6). La regla 7.2 fija los valores por turnos del MVP: 12, 24 o 36 horas. Falta decidir cómo llegan al catálogo.

La decisión del 2026-11-16 sobre el catálogo dice que una versión nueva de un juego llega inactiva y se activa desde administración. Administración es del Hito 6. Si añadir controles de tiempo exigiera una versión nueva, Cuatro en raya por turnos no podría jugarse hasta entonces.

| Opción | A favor | En contra |
|---|---|---|
| **Añadirlos a la versión 1.0.0.** Las reglas, el estado y las jugadas no cambian. Solo cambia la lista de controles de tiempo que el motor declara | Se puede jugar desde este hito. La versión fija las reglas (7.23), y el reloj no es una regla del juego: lo lleva la capa de sesión (7.8). Las partidas en tiempo real en curso no se ven afectadas | Precisa la decisión del catálogo: cambiar los controles de tiempo admitidos no es una versión nueva |
| Una versión 1.1.0, inactiva hasta el Hito 6 | Sigue al pie de la letra la decisión del catálogo | La modalidad por turnos no se puede jugar hasta el Hito 6, y el criterio de este hito no se cumple |
| Una versión 1.1.0 que llega ya activa, como la 1.0.0 | Se puede jugar desde este hito | Contradice la decisión del catálogo. Dos versiones con las mismas reglas |

**Recomendación:** añadirlos a la versión 1.0.0. Queda anotado en la decisión del catálogo: una versión nueva es un cambio de reglas, de estado o de jugadas; los controles de tiempo que admite un juego pueden cambiar sin versión nueva.

Una consecuencia de las reglas aceptadas, que no se propone cambiar: el tiempo es total para toda la partida y sin incremento (7.2 y 7.6). Con 12 horas, quien tiene el turno durante una noche entera gasta en ella la mayor parte de su tiempo. Conviene observarlo cuando haya partidas reales.

## 5. Avisos

### N2. Aviso de turno dentro de la aplicación

El servidor ya avisa a todas las conexiones de un jugador cada vez que cambia una de sus partidas, y el aviso dice si le toca (T4). El alcance pide el aviso dentro de la aplicación; las notificaciones push, con la aplicación cerrada, son lo primero tras el MVP (ADR-008, punto 12). Falta decidir qué se ve.

| Opción | A favor | En contra |
|---|---|---|
| **Tres señales.** En la cabecera, el enlace "Partidas" lleva el número de partidas en las que te toca. Cuando una pasa a ser tu turno y no la estás mirando, aparece un aviso emergente, "Te toca contra Ana", con el enlace a la partida, que se cierra solo. El título de la pestaña empieza por ese número, "(2) Juegos de Mesa en Línea", para verlo desde otra pestaña | Se ve desde cualquier página y desde otra pestaña. Usa solo lo que ya envía el servidor. Al conectar se pide la lista a la API, como ya se hace para V8 (W8), así que un aviso perdido no deja el contador mal | Un componente más en la cabecera |
| Solo la lista de `/partidas`, al día con los avisos | Lo más simple | Quien está en otra página no se entera. No es un aviso |
| Las tres señales y además notificaciones del sistema, con la aplicación abierta en segundo plano | Se ve aunque la pestaña esté oculta | Pide permiso al usuario. Solo funciona con la aplicación abierta, así que se confunde con las notificaciones push, que son otra decisión y van después del MVP |

**Recomendación:** las tres señales. El aviso emergente no sale para la partida que se está mirando, ni en tiempo real, donde el tablero ya lo dice.

### N3. Qué ve cada uno al entrar

El criterio de aceptación pide que cada persona vea al entrar que le toca. Hoy, al iniciar sesión, se llega a la portada, que muestra el catálogo. La lista de partidas en curso está en `/partidas`, ordenada por la que empezó más tarde, y solo pide la primera página, de 20. Con el límite de 20 partidas por turnos y una en tiempo real, puede haber 21.

| Opción | A favor | En contra |
|---|---|---|
| **La portada y `/partidas` muestran primero las partidas en las que te toca.** En la portada, con sesión, una sección "Te toca" con esas partidas encima del catálogo. En `/partidas`, primero las de tu turno, ordenadas por la que vence antes, y después las demás. Cada una dice hasta cuándo: "Te toca. Tienes hasta el 19 nov, 8:05". Se piden todas en una sola página, con `limit=50`, el máximo de la API, y se ordenan en el navegador | Al entrar se ve enseguida, sin ir a otra página. No cambia la API: su orden sigue siendo el que dice el contrato. Con como mucho 21 partidas, ordenar en el navegador no cuesta nada | Dos sitios que muestran lo mismo |
| Llevar a `/partidas` al iniciar sesión cuando te toca en alguna | Un solo sitio | Cambia a dónde se llega según los datos. Quien entra a crear una sala tiene que volver atrás |
| Ordenar en el servidor | La API devuelve ya el orden útil | Cambia el contrato de `GET /me/matches`, que dice "las más recientes primero" |

**Recomendación:** la portada y `/partidas`, con el orden en el navegador. Si alguna vez se pidieran más de 50, se mostraría el aviso "Hay más partidas" y el enlace a la siguiente página; con los límites actuales no ocurre.

## 6. Aplicación instalable

### N4. Cómo se hace instalable

Para que el navegador ofrezca instalar la aplicación hace falta un manifiesto con el nombre, los iconos y la forma de abrirse, servido con HTTPS. Chromium pide además, según la versión, un service worker. Safari en iPhone instala cualquier página desde "Añadir a pantalla de inicio" y usa el icono que se le indique. Un service worker será necesario de todos modos para las notificaciones push, después del MVP.

| Opción | A favor | En contra |
|---|---|---|
| **Manifiesto e iconos propios y un service worker escrito a mano, de unas 60 líneas.** El service worker guarda la portada de la aplicación y los archivos de `/_nuxt/`, que llevan su huella en el nombre y no cambian. Pide primero a la red las páginas y solo si no hay red usa la guardada. **No toca nada que vaya a la API ni al canal de tiempo real**, que están en otro origen: el service worker los deja pasar sin mirarlos. Se registra solo en la aplicación construida, no en `pnpm dev` | Sin dependencias. Se lee entero en un minuto. Con la red cortada, la aplicación abre y muestra el aviso de conexión perdida que ya existe, en lugar de la página de error del navegador. Una versión nueva se recoge en la siguiente visita, porque las páginas se piden primero a la red | Lo mantenemos nosotros. Hay que cuidar que una versión nueva borre lo guardado por la anterior |
| El módulo `@vite-pwa/nuxt`, que genera el service worker con Workbox | Resuelve la lista de archivos, las actualizaciones y los iconos | Una dependencia con un árbol grande para lo que se usa. Su versión 2, la que corresponde a Nuxt 4.6, salió el 2026-11-13 y la última el 2026-11-18: es demasiado reciente para fijarla |
| Solo el manifiesto, sin service worker | Lo mínimo | Chromium puede no ofrecer la instalación. Sin red, la aplicación instalada muestra la página de error del navegador |

**Recomendación:** manifiesto e iconos propios y el service worker escrito a mano. No guarda datos de la API: lo que se ve de una partida viene siempre del servidor (7.28). La aplicación instalada se abre sin barra del navegador (`display: standalone`) en la portada.

Los iconos son un diseño propio sencillo, un tablero con fichas en los colores de la aplicación. Se dibujan en SVG y se convierten a PNG de 192 y 512 píxeles, también en versión recortable para Android. Ver N10.

### N5. Abandono en el móvil

ADR-015 dejó para este hito una consecuencia de la regla 7.26: en el móvil, el sistema suspende la página poco después de pasar a otra aplicación, la conexión se cae y, pasados 2 minutos, se pierde la partida en tiempo real. Instalar la aplicación no lo cambia: una PWA se suspende igual que una pestaña. Por turnos no pasa nada, porque no hay abandono (7.27).

| Opción | A favor | En contra |
|---|---|---|
| **Mantener la regla y avisar.** En una partida en tiempo real, en el móvil y en la aplicación instalada, el tablero muestra una línea fija: "Si sales de la aplicación más de 2 minutos, pierdes la partida por abandono" | Ninguna regla nueva. Quien juega en tiempo real sabe a qué se compromete, y quien quiera jugar a ratos tiene la modalidad por turnos | Un descuido de 2 minutos sigue costando la partida |
| Pausar el plazo mientras la página está oculta, con un mensaje nuevo del cliente | Cambiar de aplicación un momento no cuesta la partida | Cambia el protocolo. Basta con ocultar la página para no perder nunca por abandono, que es justo lo que la regla quiere evitar. Y una página suspendida no siempre llega a enviar el mensaje |
| Un plazo más largo, por ejemplo 5 minutos, para todos | Más margen sin casos especiales | Cambia la regla 7.26, aceptada. El rival espera más en el caso de siempre |

**Recomendación:** mantener la regla y avisar. Se cierra el asunto de ADR-015, sección 11.

## 7. Pruebas

### N6. Cómo se prueba el criterio de aceptación

| Opción | A favor | En contra |
|---|---|---|
| **Tres piezas.** (1) Una prueba en navegador del criterio: dos personas, cada una en su propio navegador, que nunca están abiertos a la vez. Ana crea una sala de Cuatro en raya por turnos de 12 horas y cierra. Luis entra, la partida empieza, y cierra. Desde ahí se turnan: cada una abre su navegador, ve en la portada y en la cabecera que le toca, juega y cierra. La partida termina con cuatro en línea y las dos ven el resultado. (2) Pruebas del servidor con Cuatro en raya por turnos y el tiempo controlado: el reloj de 12 horas se agota a las 12 horas, no antes; una sala sin revancha se cierra al terminar; con revancha vuelve a la espera. (3) Una prueba en navegador de la PWA: el manifiesto se sirve y es válido, el service worker queda activo y, con la red cortada, la aplicación abre y muestra el aviso de conexión perdida | Se prueba el criterio tal como se describe. Los relojes de horas se prueban sin esperar horas. Las pruebas del aviso de turno van con la prueba del criterio, que también necesita un contador | Unos 20 segundos más en el trabajo "Pruebas en navegador" |
| Solo pruebas del servidor | Rápidas | El criterio habla de lo que ve cada persona al entrar, y eso solo lo ve un navegador |
| Probar la instalación de verdad en un navegador | Comprueba lo que el usuario hará | Playwright no puede pulsar "Instalar". Se comprueba a mano, una vez |

**Recomendación:** las tres piezas, y una comprobación a mano de la instalación en Chrome de escritorio y en un móvil antes de cerrar el hito.

## 8. Decisiones menores

| ID | Asunto | Recomendación | Alternativa |
|---|---|---|---|
| N7 | Cómo se muestran los relojes de horas | En las partidas por turnos, "11 h 20 min", y en la última hora, minutos y segundos como en tiempo real. Quien tiene el turno ve además la hora límite: "hasta el 19 nov, 8:05", en su hora local | Seguir con "11:20:05", que se lee mal con horas y no dice cuándo se acaba |
| N8 | El final de una partida por turnos sin revancha | La pantalla final consulta la sala y, si se cerró, dice "La sala se cerró al terminar la partida" y solo ofrece el enlace a sus partidas. Hoy invita a volver a una sala cerrada | Mostrar siempre el enlace a la sala, que lleva a una sala cerrada |
| N9 | Filtro por modalidad en la lista de salas | Un selector "Todas, Tiempo real, Por turnos" en `/salas`. La API ya lo admite. Las salas por turnos esperan hasta 7 días y las de tiempo real 30 minutos, así que mezcladas se pierden las segundas | Sin filtro |
| N10 | Iconos | Un SVG propio y los PNG que salen de él, guardados en el repositorio. Los genera una sola vez un script con el Chromium que ya usan las pruebas en navegador, sin dependencias nuevas | Una librería de imágenes para generarlos al construir |
| N11 | Nombre y colores de la aplicación instalada | Nombre "Juegos de Mesa en Línea", nombre corto "Juegos de Mesa", y los colores de fondo y de acento de la aplicación | Otro nombre corto. El que se ve bajo el icono tiene unos 12 caracteres de espacio |
| N12 | La lista de partidas sin conexión | No se guarda. Sin red, `/partidas` muestra el aviso de conexión perdida y el botón de reintentar, como hoy | Guardar la última lista en el navegador. Mostraría turnos que pueden haber cambiado |

---

## 9. Huecos y contradicciones encontrados

| Hallazgo | Qué se propone |
|---|---|
| Añadir controles de tiempo a Cuatro en raya exigiría, según la decisión del catálogo, una versión nueva inactiva hasta el Hito 6 | N1 |
| La lista de partidas en curso pide 20 y puede haber 21, y no ordena primero las de tu turno | N3 |
| Al terminar una partida por turnos sin revancha, la pantalla final invita a volver a una sala que ya se cerró | N8 |
| El aviso personal de cada partida llega al navegador, pero solo se usa para la advertencia de V8 | N2 |

Además, dos cosas que no piden decisión:

- La plataforma ya cumple las reglas de la modalidad por turnos ([sección 1](#1-contexto)). Al aceptarse este documento, el backlog lo reflejará.
- Un service worker solo funciona con HTTPS o en `localhost`. En local las dos cosas se cumplen. En producción depende del alojamiento, que está aplazado, y exige servir `sw.js` desde la raíz del frontend sin guardarlo en caché.

Ninguno obliga a cambiar un contrato. N1 precisa la decisión del catálogo del 2026-11-16.

## 10. Lo que se comprobó antes de recomendar

| Comprobación | Resultado |
|---|---|
| Inicio y revancha por turnos | `startIfReady` en `rooms` inicia la primera partida de una sala por turnos sin marcas de "listo" y espera a todas en la revancha. Hay pruebas de los dos casos |
| Límite de 20 y cierre a los 7 días | Configurables, con pruebas (`MAX_TURN_BASED_MATCHES_PER_PLAYER`, `ROOM_IDLE_TURN_BASED_HOURS`) |
| Temporizadores largos | Los relojes y los plazos se limitan a 2³¹ milisegundos, unos 24 días. Un reloj de 36 horas cabe de sobra, y la revisión periódica cubre el resto |
| El formulario de crear sala | Ofrece solo las modalidades y los relojes que declara el juego. Con N1, la modalidad por turnos aparece sola |
| El aviso personal | El servidor envía `PLAYER_MATCH_UPDATED` con `yourTurn` y `turnDeadlineAt` a todas las conexiones de cada participante. No hay que cambiar el protocolo |
| `GET /me/matches` | Admite `limit` hasta 50. Devuelve `turnDeadlineAt`, que da la hora límite de quien tiene el turno |
| `GET /rooms/{roomId}` | Devuelve también las salas cerradas, con su motivo, así que N8 no necesita nada nuevo |
| `@vite-pwa/nuxt` | Versión 2.0.2, publicada el 2026-11-18; la 2.0.1, el 2026-11-13 |

## 11. Supuestos que se comprueban al construir

Si alguno falla, se avisa antes de cambiar de opción.

| Supuesto | Si falla |
|---|---|
| Chromium ofrece instalar la aplicación con el manifiesto y el service worker de N4 | Se ajusta lo que pida su comprobación de instalación, que se ve en las herramientas del navegador |
| El service worker no interfiere con las pruebas en navegador existentes, que usan la aplicación construida | Se desactiva en esas pruebas y solo se activa en la de la PWA |
| La página construida que sirve de portada de la aplicación (`200.html` o la que genere Nuxt) se puede guardar y servir sin red | El service worker guarda `index.html` y la aplicación arranca desde ahí |

## 12. Lo que no se decide ahora

| Asunto | Cuándo |
|---|---|
| Aviso de turno con la aplicación cerrada, por notificación push | Después del MVP (ADR-008, punto 12). El service worker de N4 es su base |
| Cómo sirve el alojamiento `sw.js` y el manifiesto | Con el alojamiento, en el Hito 7 |
| Ajustar los controles de tiempo por turnos o añadir incremento, si las partidas reales lo piden | Con datos reales |

## 13. Efecto sobre los documentos

Se harán al aceptarse las decisiones. Ninguno cambia un contrato.

| Documento | Cambio |
|---|---|
| `planning/decisiones-y-pendientes.md` | Se anota N1 en la decisión del catálogo, se cierra el abandono en el móvil y se pone al día el índice |
| `docs/adr/0014-decisiones-del-hito-3.md` | Se anota en K6, con fecha, que los controles por turnos los fija N1 |
| `docs/adr/0015-decisiones-del-hito-4.md` | Se anota en la sección 11, con fecha, que el abandono en el móvil lo cierra N5 |
| `planning/backlog-mvp.md` | Se marcan las tareas del Hito 5 que ya están hechas |
| `docs/adr/README.md` | Se añade este ADR |
