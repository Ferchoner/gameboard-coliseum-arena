# ADR-015: Decisiones del Hito 4, reconexión y recuperación

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-16 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | El margen de espera en la presencia (ADR-013, H13) y lo que ADR-014 dejó para el Hito 4 en su sección 11 |
| **Depende de** | ADR-009 (reglas 7.24 a 7.29), ADR-010 (reglas 8.17 y 8.18), ADR-013, ADR-014, el modelo de datos y el protocolo de tiempo real |

---

## 1. Contexto

El Hito 4 está autorizado desde el 2026-11-16, con la condición de siempre: sus decisiones abiertas se presentan antes de escribir código. Su alcance, según el backlog:

- Reconexión del cliente con espera progresiva y nueva suscripción (7.28).
- Abandono en tiempo real tras 2 minutos sin conexión (7.26).
- Anotación periódica de actividad del servidor y ajuste de relojes al arrancar (8.18, 7.29).
- Pruebas: reinicio del servidor a mitad de partida y corte de red de un jugador.

**Criterio de aceptación:** tras reiniciar el servidor después de una jugada confirmada, los dos jugadores reconectan, ven el mismo estado y a ninguno se le ha descontado el tiempo de la caída.

Parte del hito ya está hecha:

| Tarea | Estado |
|---|---|
| Reconexión con espera progresiva (1, 2, 4… hasta 30 segundos, con variación) y nueva suscripción a lo que se mostraba | Hecha en el Hito 2, con sus pruebas |
| Reconectar cuando el servidor avisa de que se reinicia (cierre 1012) | Hecha en el Hito 2. El servidor ya cierra así al apagarse |
| Detectar conexiones muertas con los pings de WebSocket | Hecha en el Hito 2 |
| Reenviar la jugada que se quedó sin respuesta, con el mismo identificador | Hecha en el Hito 3 (ADR-014, L4) |
| Cargar la sesión de juego desde la base de datos | Hecha en el Hito 3: no hay copia en memoria (ADR-014, K2) |
| Revisión periódica de relojes vencidos | Hecha en el Hito 3 (ADR-014, K3) |

Lo que falta es el abandono, no descontar el tiempo de una caída y las pruebas. Las reglas ya dicen qué tiene que pasar en el caso normal. Lo que falta decidir es cómo se construye y qué hacer en cuatro casos que las reglas no cubren ([sección 8](#8-huecos-y-contradicciones-encontrados)).

## 2. Cómo leer este documento

- Cada decisión tiene un identificador (V1 a V12), sus alternativas y una recomendación.
- Las decisiones V1 a V6 afectan a las reglas, a la arquitectura o cuesta deshacerlas. Van explicadas una a una.
- Las decisiones V7 a V12 son menores y fáciles de cambiar. Van en una tabla.
- **Las doce se aceptaron el 2026-11-16 tal como se recomendaban.** Donde el texto dice "recomendación", léase "decisión".
- **Ninguna cambia un contrato.** Dos piden atención porque tocan una regla aceptada: **V2** precisa la regla 7.26 para el caso en que no queda nadie conectado, y **V5** añade una regla nueva a las salas.

## 3. Resumen

| ID | Asunto | Recomendación |
|---|---|---|
| V1 | Dónde se lleva la cuenta del abandono | En memoria, en `game-sessions`, avisado por el canal de tiempo real cuando un jugador se queda sin conexiones. No se guarda en la base de datos |
| V2 | Abandono cuando no queda nadie conectado | Solo pierde por abandono quien falta mientras algún rival está conectado. Si faltan todos, decide el reloj |
| V3 | Desde cuándo cuenta la desconexión | Desde que el servidor lleva 5 segundos sin ninguna conexión del jugador. Cierra H13: recargar la página deja de mostrar al jugador desconectado |
| V4 | Cómo se mide la caída del servidor | Anotación cada 10 segundos y otra exacta al apagarse en orden. Al arrancar, antes de aceptar conexiones, se desplaza cada turno en curso |
| V5 | La sala tras un abandono | Quien pierde por abandono sale de la sala. Si era el anfitrión, la sala se cierra |
| V6 | Pruebas del reinicio y del corte de red | Pruebas del servidor con el tiempo controlado, y pruebas en navegador con un reinicio real y un corte de red simulado |
| V7 a V12 | Decisiones menores | [Sección 7](#7-decisiones-menores) |

---

## 4. Abandono

### V1. Dónde se lleva la cuenta del abandono

La regla 7.24 dice que la presencia vive en memoria y no se guarda. Hoy la conoce el canal de tiempo real, que sabe qué conexiones tiene cada jugador. La arquitectura pone la detección de abandonos en `game-sessions`, y la regla de dependencias dice que `realtime` conoce a `game-sessions` y no al revés.

| Opción | A favor | En contra |
|---|---|---|
| **En memoria, en `game-sessions`.** El canal le avisa cuando un jugador se queda sin conexiones y cuando vuelve. `game-sessions` pone un temporizador por jugador ausente en cada partida en tiempo real, y al vencer aplica el abandono en una transacción, como ya hace con los relojes. Al arrancar, pone el temporizador a todos los participantes de las partidas en curso, porque todavía no hay nadie conectado | Respeta 7.24 y la dirección de las dependencias. Es el mismo mecanismo que los relojes (K3). Con una sola instancia, la memoria basta. La regla 7.29 pide que el plazo empiece de nuevo tras arrancar, que es justo lo que pasa al perder la memoria | Un temporizador perdido no se recupera con una revisión periódica, pero solo se pierde en un reinicio, y entonces se vuelven a poner todos |
| Guardar en la base de datos desde cuándo falta cada jugador | Sobrevive a un reinicio | Contradice 7.24 y cambia el modelo de datos. Una escritura en cada conexión y desconexión. Y 7.29 pide de todos modos empezar el plazo de nuevo tras arrancar |
| Llevarlo en el canal de tiempo real, que llama a `game-sessions` al vencer | El canal ya tiene la presencia | Reparte la lógica de partida entre dos módulos. El canal dejaría de ser solo transporte |

**Recomendación:** en memoria, en `game-sessions`.

El abandono pasa por el mismo camino que la rendición y el tiempo agotado: `retireSeat` con el motivo `ABANDONMENT` (M11), en una sola transacción con el final y la vuelta de la sala (8.16). Antes de aplicarlo se aplican los vencimientos de reloj pendientes, igual que en la rendición (L1): si a quien falta ya se le había acabado el tiempo, pierde por tiempo.

### V2. Abandono cuando no queda nadie conectado

La regla 7.26 dice que quien pasa 2 minutos seguidos sin conexión pierde por abandono. No dice qué pasa si faltan todos. Ocurre más de lo que parece: tras un reinicio del servidor nadie está conectado, así que todos los plazos empiezan a la vez (7.29); y dos personas pueden cerrar el navegador a la vez al dar la partida por perdida.

| Opción | A favor | En contra |
|---|---|---|
| **Solo pierde por abandono quien falta mientras algún rival está conectado.** Si al vencer su plazo no hay ningún rival conectado, no pierde todavía. En cuanto un rival se conecta, quien lleve 2 minutos o más ausente pierde en ese momento. Si nadie vuelve, la partida acaba por el reloj de quien tenga el turno | Es el propósito de la regla: que el rival no espere. Si nadie espera, nadie pierde por no estar. Tras un reinicio, gana quien vuelve, y no quien tuvo suerte en el orden de los temporizadores | Si nadie vuelve, la partida tarda en cerrarse lo que le quede al reloj, como mucho 30 minutos |
| Aplicar la regla al pie de la letra: pierde el primero cuyo plazo vence | Ningún caso especial | Tras un reinicio todos los plazos vencen en el mismo instante y el orden lo decide el azar o el número de asiento. Puede ganar alguien que tampoco volvió |
| Si faltan todos, anular la partida | Nadie gana sin estar | Exige un motivo de anulación nuevo en el contrato. Una partida casi ganada se pierde por un corte de red de los dos |

**Recomendación:** solo pierde por abandono quien falta mientras algún rival está conectado. Precisa la regla 7.26 sin cambiar su caso normal.

### V3. Desde cuándo cuenta la desconexión

Hoy un jugador aparece desconectado en cuanto se cierra su última conexión. Recargar la página lo muestra desconectado un instante (ADR-013, H13). Con el abandono, ese instante pondría además en marcha una cuenta atrás en la pantalla del rival.

Hay otro caso: si la red se corta sin cerrar la conexión, el servidor no se entera hasta que falla un ping. Hoy hay un ping con cada latido, cada 25 segundos, así que tarda entre 25 y 50 segundos. Lo comprobé en un navegador: con la red cortada, la conexión deja de recibir mensajes pero no se cierra.

| Opción | A favor | En contra |
|---|---|---|
| **Un margen de 5 segundos.** El servidor da a un jugador por desconectado cuando lleva 5 segundos sin ninguna conexión. Desde ese momento el rival lo ve desconectado y corren los 2 minutos. Vale también para la presencia en las salas | Recargar la página no se nota. El rival ve siempre una cuenta atrás completa | Quien se va de verdad tarda 5 segundos más en aparecer desconectado. El abandono llega a los 2 minutos y 5 segundos |
| Sin margen, como hoy (H13) | Lo más simple | Cada recarga muestra al jugador desconectado y una cuenta atrás que desaparece al instante |
| Contar desde el último ping respondido, sin margen | Más exacto con una red cortada | La cuenta atrás del rival empezaría ya gastada. Recargar seguiría mostrando el parpadeo |

**Recomendación:** un margen de 5 segundos, configurable. Con un corte de red, el abandono llega entre 2 minutos y medio y 3 minutos después del corte, por el tiempo que tarda en fallar el ping. Es más generoso que la regla, no menos.

### V5. La sala tras un abandono

Al terminar una partida en tiempo real, la sala vuelve a la espera con los mismos miembros (7.11). Si la partida terminó por abandono, quien abandonó sigue siendo miembro, aunque no esté. Eso deja dos problemas: el ganador se queda en una sala con alguien que no va a volver, y quien abandonó sigue ocupando su única partida en tiempo real (7.30). Si vuelve más tarde, no puede entrar a otra sala hasta que salga de esa, y el aviso que recibe ("Llegaste al máximo de partidas simultáneas") no explica por qué.

| Opción | A favor | En contra |
|---|---|---|
| **Quien pierde por abandono sale de la sala**, en la misma transacción que el final. Si era el anfitrión, la sala se cierra, como cuando el anfitrión sale (7.12). Si no, su plaza queda libre y otra persona puede entrar | El ganador puede jugar enseguida con otra persona. Quien abandonó queda libre para jugar de nuevo cuando vuelva | Es una regla nueva. Si la desconexión fue involuntaria, al volver ya no está en la sala |
| Dejarlo como está: sigue en la sala hasta que salga o hasta que la sala se cierre por inactividad, a los 30 minutos (7.14) | Ninguna regla nueva | Los dos problemas de arriba, durante hasta 30 minutos |

**Recomendación:** quien pierde por abandono sale de la sala. Añade una regla a ADR-009, junto a la 7.11.

## 5. Caídas del servidor

### V4. Cómo se mide la caída y se ajustan los relojes

La regla 7.29 pide no descontar a nadie el tiempo que el servidor estuvo parado. La 8.18 pide anotar cada 10 segundos que el servidor sigue en marcha, en la tabla `server_liveness`, y comparar esa anotación con la hora al arrancar. El modelo de datos dice que al arrancar se desplazan el inicio del turno y la fecha límite de todas las sesiones en curso tanto como el servidor estuvo parado.

Falta precisar dos cosas. Una anotación cada 10 segundos solo dice cuándo se paró el servidor con un error de hasta 10 segundos. Y si una jugada se confirmó después de la última anotación, desplazar su turno por la caída entera lo dejaría empezando en el futuro.

| Opción | A favor | En contra |
|---|---|---|
| **Anotación periódica y, además, una exacta al apagarse en orden.** Un reinicio normal, como un despliegue, deja la hora exacta de parada. Al arrancar, cada turno en curso se desplaza por el tiempo entre su último instante conocido (la anotación, o el inicio del turno si es posterior) y el arranque. Se hace antes de poner temporizadores, de revisar relojes y de aceptar conexiones | Un reinicio normal es exacto. Una caída inesperada se equivoca como mucho en 10 segundos, y siempre a favor de quien tenía el turno. Ningún turno empieza en el futuro | Dos escrituras distintas de la anotación |
| Solo la anotación periódica, como dice 8.18 | Una sola escritura | Cada despliegue regala hasta 10 segundos a quien tenía el turno |
| Solo la anotación al apagarse | Exacta en los reinicios normales | Una caída inesperada no deja anotación: su tiempo se descontaría |

**Recomendación:** las dos anotaciones y el ajuste por turno. La primera vez que arranque el servidor con este hito no habrá anotación y no se ajusta nada. La tabla es de `game-sessions`, como dice la arquitectura.

El ajuste no cambia la versión del estado de la partida: no cambia nada del juego, y una jugada pensada antes de la caída sigue siendo válida al volver.

## 6. Pruebas

### V6. Cómo se prueban el reinicio y el corte de red

El criterio de aceptación pide reiniciar el servidor con dos personas jugando. Las pruebas en navegador del Hito 3 levantan un servidor compartido por todas, en paralelo, así que reiniciarlo rompería las demás. Un corte de red tampoco se puede provocar cerrando la página, porque eso cierra la conexión de forma ordenada.

| Opción | A favor | En contra |
|---|---|---|
| **Dos niveles.** Las pruebas del servidor cubren cada caso con el tiempo controlado: reinicio ordenado, caída sin apagado, abandono, abandono con todos ausentes, vuelta a tiempo y salida de la sala. Las pruebas en navegador hacen el recorrido real: una prueba reinicia el servidor de verdad, a mitad de partida, y otra corta la red de un jugador con la emulación del navegador. Para el reinicio, el arranque de pruebas pasa a poder reiniciar la API cuando una prueba lo pide, y esa prueba va en un grupo aparte que corre después de las demás. En estas pruebas los plazos se acortan por configuración: abandono en unos segundos y latidos cada 2 | El criterio de aceptación se comprueba como se describe, con dos navegadores y un reinicio real. Las demás pruebas no se ven afectadas | El arranque de pruebas se complica un poco |
| Solo pruebas del servidor | Nada nuevo en las pruebas en navegador | El criterio de aceptación pide dos personas reconectando, y eso solo lo ve un navegador |
| Un intermediario de red propio entre el navegador y la API, para cortar la red | Corte real de la conexión | Más código de pruebas, y la emulación del navegador ya produce el caso que importa: una conexión que deja de responder sin cerrarse |

**Recomendación:** los dos niveles.

## 7. Decisiones menores

| ID | Asunto | Recomendación | Alternativa |
|---|---|---|---|
| V7 | Reconexión al volver la red o la pestaña | El cliente reintenta de inmediato cuando el navegador avisa de que vuelve la red o de que la pestaña vuelve a estar visible, sin esperar a que acabe la espera en curso. Con la red cortada, la espera puede llegar a 30 segundos, que se comerían un cuarto del plazo de abandono | Solo la espera progresiva |
| V8 | Lo que se ve en pantalla | En la tarjeta del rival desconectado, una cuenta atrás: "Pierde por abandono en 1:42", calculada como los relojes (K19). Mientras la conexión propia está caída, el aviso de reconexión añade, si hay una partida en tiempo real en curso: "Si no vuelves a conectar en 2 minutos, perderás la partida". El resultado por abandono ya tiene su texto | Mostrar solo "Desconectado", sin la hora del abandono, aunque el protocolo ya la envía en `abandonAt` |
| V9 | Configuración nueva | Variables de entorno para el plazo de abandono (120 segundos), el margen de desconexión (5 segundos) y el intervalo de la anotación de actividad (10 segundos), con los valores de las reglas | Dejarlos fijos en el código. Las pruebas en navegador necesitan acortar el plazo de abandono |
| V10 | Orden del arranque | Primero el ajuste de relojes (V4), después los temporizadores de reloj y de abandono, después la revisión periódica y, al final, la API y el canal aceptan conexiones. Si el ajuste falla, el servidor no arranca | Arrancar todo a la vez. Una revisión de relojes anterior al ajuste daría por vencidas partidas que no lo están |
| V11 | Intervalo de latidos | Se queda en 25 segundos, como dice el protocolo. Con V3, el abandono tras un corte de red llega como mucho 50 segundos más tarde | Bajarlo a 10 segundos. Detecta antes los cortes, a cambio de más mensajes y de cambiar un valor del protocolo |
| V12 | Pruebas en navegador en la comprobación de cada pull request | Siguen en su trabajo aparte. Las dos nuevas añaden unos 20 segundos | Pasar la del reinicio a una ejecución nocturna |

---

## 8. Huecos y contradicciones encontrados

| Hallazgo | Qué se propone |
|---|---|
| La regla 7.26 no dice qué pasa si faltan todos los jugadores. Tras un reinicio todos los plazos vencen a la vez | V2 |
| H13 dejó para este hito el margen de espera en la presencia. Sin margen, el abandono pone en marcha una cuenta atrás en cada recarga | V3 |
| El modelo de datos desplaza todos los turnos por la caída entera. Un turno que empezó después de la última anotación quedaría empezando en el futuro | V4 |
| Quien pierde por abandono sigue en la sala y sigue ocupando su única partida en tiempo real | V5 |

Además, tres cosas que no piden decisión:

- La mitad del alcance del hito ya está hecha ([sección 1](#1-contexto)). Al aceptarse este documento, el backlog lo reflejará.
- Un corte de red tarda en notarse entre 25 y 50 segundos, por cómo se detectan las conexiones muertas. V3 y V11 lo tienen en cuenta.
- En el móvil, el navegador suspende la página poco después de pasar a otra aplicación y la conexión se cae. Con la regla 7.26, cambiar de aplicación más de 2 minutos en mitad de una partida en tiempo real hace perderla. Es lo que dice la regla y no se propone cambiarla, pero conviene revisarlo cuando la aplicación sea instalable, en el Hito 5.

Ninguno obliga a cambiar un contrato. V2 precisa la regla 7.26, V4 precisa la descripción del ajuste en el modelo de datos y V5 añade una regla a ADR-009.

## 9. Lo que se comprobó antes de recomendar

| Comprobación | Resultado |
|---|---|
| El cliente del Hito 2 | Ya reconecta con espera progresiva y variación, se vuelve a suscribir, reconecta tras el cierre 1012 y deja de intentarlo si la sesión terminó. Todo con pruebas |
| El servidor del Hito 2 | Ya cierra las conexiones con 1012 al apagarse, y ya detecta las conexiones muertas con un ping en cada latido |
| La jugada repetida tras un reinicio | El servidor reconoce una jugada repetida por su identificador consultando la base de datos, no la memoria. El reenvío de L4 funciona también tras un reinicio |
| El contrato del motor | El abandono pasa por `retireSeat` con el motivo `ABANDONMENT`, que ya existe. No hay que cambiarlo |
| El protocolo | La vista ya tiene `abandonAt`, que hoy va siempre vacío (K13). No hay que cambiarlo |
| El modelo de datos | La tabla `server_liveness` ya está definida, y la arquitectura ya se la asigna a `game-sessions` |
| La emulación de red del navegador | Probada con Chromium: al cortar la red, la conexión deja de recibir mensajes y no se cierra, y las conexiones nuevas fallan. El servidor no ve el cierre. Es el caso de un corte real, que V6 necesita |
| El arranque de NestJS | Los módulos terminan de arrancar antes de que la API escuche, así que el orden de V10 se puede garantizar |

## 10. Supuestos que se comprueban al construir

Si alguno falla, se avisa antes de cambiar de opción.

| Supuesto | Si falla |
|---|---|
| Reiniciar la API desde el arranque de pruebas en navegador es fiable en GitHub | La prueba del reinicio se queda solo en las pruebas del servidor, y el recorrido en navegador se hace a mano |
| El apagado ordenado tiene tiempo de escribir la anotación antes de cerrar la base de datos | Se escribe antes de cerrar las conexiones de tiempo real, que ya es el primer paso del apagado |
| Al volver la red, el navegador avisa con el evento `online` también cuando la emulación de red se desactiva | La prueba del corte de red espera a la reconexión por la espera progresiva |

## 11. Lo que no se decide ahora

| Asunto | Cuándo |
|---|---|
| Una caída solo de la base de datos, con el servidor en marcha. Las jugadas fallan mientras dura, y su tiempo se descuenta | Con el alojamiento y la supervisión, en el Hito 7 |
| Abandono en el móvil al pasar a otra aplicación | Al hacer la aplicación instalable, en el Hito 5. *Cerrado el 2026-11-18 por ADR-016, decisión N5: se mantiene la regla 7.26 y se avisa en pantalla* |
| Más de una instancia del servidor. Los temporizadores y la presencia en memoria suponen una sola, como ya está aceptado | Posterior al MVP |

## 12. Efecto sobre los documentos

Hechos al aceptarse las decisiones. Ninguno cambia un contrato.

| Documento | Cambio |
|---|---|
| `docs/adr/0009-reglas-de-dominio.md` | Se anota en la regla 7.26 el caso en que faltan todos (V2) y se añade la regla de V5 |
| `docs/adr/0013-decisiones-del-hito-2.md` | Se anota en H13, con fecha, que el margen lo fija V3 |
| `docs/03-dominio-datos.md` | Se precisa el ajuste tras una caída (V4) |
| `planning/backlog-mvp.md` | Se marcan las tareas del Hito 4 que ya están hechas |
| `planning/decisiones-y-pendientes.md` y `docs/adr/README.md` | Se ponen al día |

## 13. Lo que resultó al construir

Añadido el 2026-11-16, al terminar el hito. No cambia ninguna decisión aceptada ni ningún contrato.

### Supuestos de la sección 10

| Supuesto | Resultado |
|---|---|
| Reiniciar la API desde el arranque de pruebas en navegador es fiable en GitHub | **Se cumple.** El arranque de pruebas corre la API en un proceso aparte y la reinicia cuando una prueba lo pide. En local, la prueba del reinicio pasó en cada una de varias repeticiones seguidas, y pasa en el trabajo "Pruebas en navegador" de GitHub |
| El apagado ordenado tiene tiempo de escribir la anotación antes de cerrar la base de datos | **Se cumple.** La anotación exacta se escribe en el paso de NestJS anterior al cierre de la base de datos. Una prueba del servidor apaga y arranca con un minuto de diferencia, y el reloj de quien tenía el turno solo pierde lo jugado |
| Al volver la red, el navegador avisa con el evento `online` también cuando la emulación de red se desactiva | **Se cumple.** La prueba del corte de red exige que el aviso de conexión perdida desaparezca en menos de 2 segundos tras volver la red. Con la espera progresiva sola tardaría hasta 8 segundos más |

### Cómo se comprueba el criterio de aceptación

| Nivel | Qué se prueba |
|---|---|
| Servidor, con el tiempo controlado (13 pruebas nuevas) | Reinicio ordenado; caída sin apagado, que cuenta desde la última anotación periódica; un turno que empezó después de la última anotación y no queda en el futuro; primer arranque sin anotación; arranque que falla si el ajuste falla; abandono con salida de la sala; abandono del anfitrión, que cierra la sala; vuelta a tiempo; todos ausentes, hasta que vuelve uno; reloj agotado antes que el plazo; abandono tras un reinicio; revisión periódica de abandonos pendientes; margen de desconexión con tiempo real |
| Navegador, grupo general | Corte de red de un jugador con la emulación de Chromium: vuelve a tiempo y sigue jugando, o no vuelve y pierde por abandono |
| Navegador, grupo `reinicio`, después de los demás y de una en una | Dos personas jugando; la API se apaga en orden, está parada 6 segundos y vuelve a arrancar. Los dos reconectan solos, ven la misma partida, la versión del estado no cambia, el reloj de quien tenía el turno pierde menos de 3 segundos y siguen jugando |

En las pruebas en navegador el abandono llega a los 10 segundos, el margen de desconexión es de 1 y los latidos van cada 2 (V6).

### Elecciones menores tomadas al construir

Ninguna estaba en las doce decisiones y ninguna cambia un contrato. Se aplicaron como recomendaciones y **quedaron confirmadas el 2026-11-16** por quien decide, las nueve. Con W2, la revisión periódica de relojes aplica también los abandonos pendientes, lo que precisa V1.

| ID | Asunto | Lo que se hizo | Alternativa |
|---|---|---|---|
| W1 | Dónde vive el margen de 5 segundos (V3) | Lo lleva el canal de tiempo real, que es quien conoce las conexiones. Durante el margen el jugador sigue constando como conectado, y el aviso de desconexión sale al terminar. Al apagarse el servidor no se da a nadie por desconectado: tras arrancar, la cuenta empieza de nuevo (7.29) | Llevar el margen en la presencia compartida. Pondría un temporizador en un módulo que hoy solo guarda datos |
| W2 | Abandonos cuyo aviso no llega a aplicarse. **Precisa V1**, que daba por hecho que no había revisión periódica | Un aviso que salta un instante antes de tiempo se vuelve a poner, y la revisión periódica de relojes aplica además los abandonos pendientes. La primera vez que se repitió la prueba del corte de red, el plazo llegó a 0:00 y el abandono no se aplicó: el aviso saltó un milisegundo antes de la hora | Solo volver a poner el aviso. Un fallo de la base de datos justo en ese momento dejaría el abandono sin aplicar hasta que alguien se conecte |
| W3 | Una partida que empieza con alguien ya sin conexión | Su plazo empieza al empezar la partida | Esperar a que se conecte y se vuelva a desconectar. Quien no llega nunca no perdería por abandono |
| W4 | Plazo de abandono y reloj vencidos a la vez | Va primero el reloj, como en la rendición (ADR-014, L1). Quien pierde por tiempo no sale de la sala | Aplicar el abandono. El motivo del final dependería del orden de dos avisos |
| W5 | Partidas por turnos | No cuentan ausencias, porque 7.26 es solo para tiempo real. Su turno sí se desplaza tras una parada del servidor, porque 7.29 vale para todas | Desplazar solo las partidas en tiempo real. Una parada larga se descontaría a quien tiene el turno en una partida por turnos |
| W6 | Salida de la sala con más de dos jugadores (V5) | Quien pierde por abandono sale de la sala en la transacción que termina la partida. Con dos jugadores, que es el único caso hoy, el abandono siempre la termina | Sacarlo de la sala en cuanto abandona, aunque la partida siga. Exige una operación de sala nueva sin ningún juego que la necesite |
| W7 | Cuándo reconecta el navegador por su cuenta (V7) | Al volver la red abre siempre otra conexión, aunque la anterior parezca abierta, porque un corte no siempre la cierra. Al volver a la página solo si la conexión lleva más de un latido y medio sin recibir nada | Reconectar solo si ya se estaba esperando un reintento. Una conexión muerta tardaría hasta 50 segundos en notarse |
| W8 | Cómo sabe el aviso de conexión perdida que hay una partida en tiempo real en curso (V8) | Al conectar pregunta a la API por las partidas en curso, y lo mantiene al día con el aviso personal de cada partida y con lo que ve la página de la partida | Mostrar la advertencia solo en la página de la partida. Quien está en otra página no se enteraría |
| W9 | Lo que ve quien perdió por abandono | "Al perder por abandono saliste de la sala." y el enlace a sus partidas, sin el enlace a la sala, que ya no lo admite | Dejar el enlace a la sala. Llevaría a un error |

### Otras notas

- Variables de entorno nuevas: `MATCH_ABANDON_SECONDS` (120), `REALTIME_DISCONNECT_GRACE_SECONDS` (5, admite fracciones y 0) y `SERVER_LIVENESS_SECONDS` (10), en `apps/backend/.env.example` (V9). Las pruebas del servidor usan un margen de 0 salvo la que prueba el margen.
- Migración nueva, `actividad_del_servidor`, con la tabla `server_liveness` tal como la define el modelo de datos.
- El orden de arranque de V10 lo lleva una sola pieza de `game-sessions`: ajuste, temporizadores y ausencias, revisión periódica y anotación periódica.
- El protocolo dice que un jugador "sin ninguna conexión durante 2 minutos seguidos pierde por abandono" y no menciona el margen ni el caso de V2. Es cierto en el caso normal y no se tocó, porque los contratos solo cambian con autorización. Conviene precisarlo la próxima vez que se abra el protocolo.

### Lo que queda sin hacer, y dónde

| Asunto | Cuándo |
|---|---|
| Lo de la sección 11: caída solo de la base de datos, abandono en el móvil y más de una instancia | Hitos 7 y 5, y después del MVP |
| Sacar de la sala a quien abandona una partida de más de dos jugadores que sigue (W6) | *Cerrado el 2026-11-19 (ADR-019, F8; ADR-020, DO20): el retirado sigue en la sala sin contar para su límite y sale al terminar la partida (regla 7.33)* |
| Precisar en el protocolo el margen de desconexión y el caso de V2 | La próxima vez que se autorice cambiar los contratos |
