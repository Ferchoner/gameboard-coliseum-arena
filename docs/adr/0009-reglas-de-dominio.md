# ADR-009: Reglas de dominio de salas, partidas y relojes

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-14 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | Pendientes P6, P7 y P9; hallazgos C-11, C-12 y C-13; vacío G-05; efectos R-2, R-3, R-5, R-6 y R-7 del requisito de las dos modalidades |
| **Depende de** | ADR-007 (línea base), ADR-008 (alcance del MVP) |
| **Relacionados** | ADR-010 (persistencia de partida), ADR-011 (convenciones y glosario) |

## Contexto

La documentación inicial definía estados de sala, partida y sesión de juego sin las transiciones entre ellos, y no cubría el reloj, el abandono, la revancha ni las caídas del servidor. Este ADR fija las reglas: qué estados existen, qué provoca cada cambio y qué ocurre en los casos límite. Son 31 reglas en 7 bloques.

Los estados se nombran aquí en español. Sus nombres en el código están en ADR-011, convención 9.20. Cómo se guardan está en ADR-010, y los mensajes que las transportan, en `contracts/02-realtime.md`.

---

## 1. Modalidad y reloj

| ID | Regla |
|---|---|
| 7.1 | Cada partida tiene una **modalidad**, tiempo real o por turnos, elegida al crear la sala. No se puede cambiar una vez creada |
| 7.2 | Cada partida tiene un **control de tiempo**: un tiempo total por jugador para todas sus jugadas. Valores del MVP: hasta 30 minutos en tiempo real; 12, 24 o 36 horas por turnos. Lo elige quien crea la sala entre los valores que el juego admita |
| 7.3 | El reloj corre solo para el jugador al que le toca. Empieza a contar cuando el servidor confirma la jugada anterior, o al iniciar la partida para el primer jugador |
| 7.4 | El tiempo lo mide siempre el servidor. La hora que envíe el cliente no se usa. No se compensa el retraso de red |
| 7.5 | Una jugada que llega con el reloj ya agotado se rechaza y se aplica el vencimiento |
| 7.6 | Sin incremento por jugada ni pausas en el MVP |
| 7.7 | El control de tiempo es una **política intercambiable**. El MVP incluye una sola, la de tiempo total por jugador. Cada juego declara cuáles admite |
| 7.8 | El reloj lo gestiona la capa de sesión, no el motor de juego. El motor solo indica a quién le toca |

## 2. Sala

Estados: **EN ESPERA**, **EN PARTIDA** y **CERRADA**.

Cambio respecto a la documentación inicial: desaparece el estado READY. "Todos listos" pasa a ser una condición que se calcula a partir de los miembros, no un estado propio, porque con inicio automático sería un estado que no dura.

| ID | Regla |
|---|---|
| 7.9 | **Inicio en tiempo real:** la partida empieza automáticamente cuando la sala está completa y todos sus miembros se han marcado como listos |
| 7.10 | **Inicio por turnos:** la partida empieza automáticamente cuando la sala se completa, sin paso de "listo". Entrar a la sala es el compromiso de jugar, porque los jugadores no tienen que coincidir conectados. La revancha sigue la regla 7.31 |
| 7.11 | **Tras terminar una partida en tiempo real**, la sala vuelve a EN ESPERA con los mismos miembros y sin marcas de "listo", para permitir la revancha. Una sala puede albergar varias partidas sucesivas. Las salas por turnos siguen la regla 7.31 |
| 7.12 | Si el anfitrión sale de una sala EN ESPERA, la sala se cierra. Si sale otro miembro, queda su plaza libre |
| 7.13 | Durante una partida no se puede "salir de la sala". Quien quiera dejarla debe rendirse |
| 7.14 | Una sala EN ESPERA sin actividad se cierra sola pasado un plazo. Valor inicial: 30 minutos en tiempo real y 7 días por turnos |
| 7.15 | La capacidad se comprueba de forma atómica al entrar: dos personas no pueden ocupar la última plaza a la vez |
| 7.31 | **Revancha por turnos:** por defecto, una sala por turnos se cierra al terminar su partida. Al crear la sala, el anfitrión puede activar la revancha. Si la activa, al terminar la partida la sala vuelve a EN ESPERA como en la regla 7.11, y la siguiente partida empieza cuando la sala está completa y todos sus miembros se han marcado como listos. *(Añadida el 2026-11-14. Resuelve un caso que las reglas 7.10 y 7.11 dejaban sin definir: una sala por turnos que seguía completa al terminar.)* |

## 3. Partida

Estados: **EN CURSO**, **TERMINADA** y **ANULADA**.

Cambio respecto a la documentación inicial: desaparecen CREATED y STARTING. Como la partida, sus jugadores y su sesión se crean en una sola transacción, esos estados nunca llegarían a verse. Desaparece también PAUSED, que era opcional, y con él los mensajes de pausa del protocolo (hallazgo C-11).

| ID | Regla |
|---|---|
| 7.16 | Una partida TERMINADA tiene siempre un resultado y un motivo: **fin natural** (lo determina el motor), **tiempo agotado**, **rendición** o **abandono** |
| 7.17 | El resultado por fin natural lo construye el motor. Los otros tres los construye la capa de sesión, con la misma forma de datos. Esto resuelve el hallazgo C-12 |
| 7.18 | **Tiempo agotado en un juego de dos jugadores:** pierde quien agota su tiempo y gana el otro. Para juegos de más jugadores, la consecuencia la definirá cada juego |
| 7.19 | **Rendición:** cualquier jugador puede rendirse en cualquier momento, sea o no su turno. Es una orden de la plataforma, no una jugada del motor |
| 7.20 | Una partida ANULADA no tiene resultado y no cuenta en estadísticas. Solo se anula por decisión de un administrador o por un fallo técnico irrecuperable |
| 7.21 | Sin ofertas de empate en el MVP. El empate solo se produce si las reglas del juego lo determinan |

## 4. Sesión de juego

Estados guardados: **ACTIVA** y **CERRADA**.

Cambio respecto a la documentación inicial: INITIALIZING y RECOVERING dejan de ser estados guardados. Con la memoria como caché (acuerdo B6, ADR-007), cargar una sesión desde la base de datos es una operación interna del servidor, no un estado de la partida.

| ID | Regla |
|---|---|
| 7.22 | La sesión se carga en memoria cuando alguien la necesita y se libera cuando lleva un tiempo sin jugadores conectados ni jugadas |
| 7.23 | La versión del motor se fija al iniciar la partida y no cambia hasta que termina. Desactivar una versión solo impide empezar partidas nuevas con ella; el servidor la conserva mientras tenga partidas en curso |

## 5. Presencia, desconexión y abandono

| ID | Regla |
|---|---|
| 7.24 | **Presencia y pertenencia son cosas distintas.** Pertenecer a una sala o a una partida se guarda en la base de datos. Estar conectado es un dato en memoria que se muestra al rival y no se guarda |
| 7.25 | Un jugador puede tener varias conexiones a la vez, por ejemplo dos pestañas. Todas reciben su vista. Se le considera presente mientras tenga al menos una |
| 7.26 | **Abandono en tiempo real:** si un jugador pasa 2 minutos seguidos sin ninguna conexión, pierde por abandono, sea o no su turno. Se implementa junto con la reconexión, no en el corte vertical |
| 7.27 | **Por turnos no existe el abandono por desconexión.** Estar desconectado es lo normal. Solo se pierde por tiempo agotado o por rendición |
| 7.28 | Al reconectar, el cliente recibe el estado completo actual desde su punto de vista, con los relojes, y sustituye el que tenía |

## 6. Caídas y despliegues del servidor

| ID | Regla |
|---|---|
| 7.29 | **El tiempo que el servidor está caído no se descuenta a nadie.** Al arrancar, el servidor calcula cuánto estuvo parado y desplaza en esa medida el inicio del turno en curso de cada partida. El plazo de abandono de la regla 7.26 empieza a contar de nuevo tras el arranque |

## 7. Partidas simultáneas

| ID | Regla |
|---|---|
| 7.30 | Un jugador puede tener **una sola partida en tiempo real** a la vez, contando la sala en la que espera, y hasta **20 partidas por turnos** simultáneas. Los dos límites son configurables. *(La propuesta inicial era 5; el valor de 20 se fijó al aprobar.)* |

---

## 8. Alternativas consideradas en las reglas principales

### 7.9 y 7.10. Qué dispara el inicio de la partida

| Opción | A favor | En contra |
|---|---|---|
| **Automático al estar todos listos (tiempo real) o al completarse la sala (por turnos)** | Sin pasos extra. Una sola regla por modalidad. No depende de que el anfitrión esté atento | El anfitrión no puede esperar a alguien en concreto ni cambiar ajustes en el último momento |
| El anfitrión pulsa "iniciar" | Más control para quien creó la sala | Un paso más. Por turnos obligaría al anfitrión a volver a entrar solo para iniciar |

**Decisión:** automático. Con salas públicas de dos jugadores, el control adicional del anfitrión aporta poco.

### 7.11. Qué pasa con la sala al terminar la partida

| Opción | A favor | En contra |
|---|---|---|
| **Vuelve a EN ESPERA para la revancha** | La revancha es inmediata y natural. Coincide con el modelo de datos, que ya permite varias partidas por sala | Hay que limpiar las salas que nadie usa (regla 7.14) |
| La sala se cierra | Más simple: una sala, una partida | Para la revancha hay que crear otra sala y volver a encontrarse |

**Decisión:** volver a EN ESPERA en tiempo real. Por turnos, la sala se cierra, salvo que el anfitrión haya activado la revancha al crearla (regla 7.31). Una revancha por turnos compromete a los jugadores durante horas o días, así que no se da por supuesta.

### 7.26. Desconexión en una partida en tiempo real

| Opción | A favor | En contra |
|---|---|---|
| **Derrota por abandono tras 2 minutos sin conexión** | El rival no se queda esperando hasta 30 minutos a que se agote un reloj | Exige vigilar la presencia. Una mala conexión prolongada cuesta la partida |
| Solo el reloj | Lo más simple: una única causa de derrota por tiempo | Si alguien se va con 25 minutos en su reloj, el rival espera 25 minutos para ganar |
| El rival puede reclamar la victoria pasado el plazo | El más flexible | Añade una acción y un caso más que explicar al usuario |

**Decisión:** derrota automática tras 2 minutos, implementada en el Hito 4 junto con la reconexión. En el corte vertical basta con el reloj.

### 7.29. Los relojes durante una caída del servidor

| Opción | A favor | En contra |
|---|---|---|
| **No descontar el tiempo de caída** | Justo para los jugadores. Un despliegue de dos minutos no decide una partida de tiempo real | El servidor debe registrar de forma periódica que sigue vivo, para saber después cuánto estuvo parado |
| Descontarlo | No requiere nada adicional | En tiempo real, un despliegue o una caída pueden hacer perder a quien tenía el turno |

**Decisión:** no descontarlo. En partidas por turnos apenas se nota, pero aplicar la misma regla a las dos modalidades es más sencillo que mantener dos.

### 7.30. Partidas simultáneas

| Opción | A favor | En contra |
|---|---|---|
| **Una en tiempo real y hasta 20 por turnos** (la propuesta inicial era 5) | Refleja cómo se juega cada modalidad. Limita el abuso y el abandono de partidas | Son valores de producto elegidos sin datos; habrá que ajustarlos |
| Sin límites | Nada que comprobar | Facilita crear muchas partidas y dejarlas agotarse |
| Una sola partida en total | Lo más simple | Hace poco atractiva la modalidad por turnos, donde lo habitual es llevar varias |

**Decisión:** una en tiempo real y veinte por turnos, como valores configurables.

---

## 9. Efecto sobre los documentos

| Documento | Cambio que implica |
|---|---|
| `docs/03-dominio-datos.md` § Estados orientativos | Sustituir los estados de sala, partida y sesión por los de este documento |
| `contracts/02-realtime.md` | Retirar `MATCH_PAUSED`, `MATCH_RESUMED` y `MATCH_STARTING`. Añadir la orden de rendición y los relojes en la vista del jugador |
| `contracts/03-game-engine.ts` | Ampliar el resultado para admitir los motivos de la regla 7.16 y permitir que cada juego declare qué controles de tiempo admite |
| `docs/04-flujos-y-persistencia.md` | Actualizar los pasos 6 a 8 del corte vertical con el inicio automático |
