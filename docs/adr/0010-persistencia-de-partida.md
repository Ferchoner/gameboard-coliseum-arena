# ADR-010: Persistencia de partida

| Campo | Valor |
|---|---|
| **Estado** | Aceptada, modificada por ADR-014 (K2) |
| **Fecha** | 2026-11-14 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | Pendientes P8 y P14; hallazgos C-08, C-09 y C-10; efectos R-1 y R-2 del requisito de las dos modalidades |
| **Depende de** | ADR-002 (Drizzle sobre PostgreSQL), ADR-007 (acuerdos B6 y B12), ADR-009 (reglas de dominio) |
| **Relacionados** | ADR-003 (realtime), ADR-011 (convenciones y glosario) |

## Contexto

La documentación inicial preveía snapshots y una tabla de eventos sin definir su propósito, su retención ni cómo se evitan las jugadas duplicadas. Este ADR decide qué se guarda de una partida, cuándo y con qué garantías. Son 20 reglas en 6 bloques. Los nombres de tablas y campos están en `docs/03-dominio-datos.md`.

---

## 1. Qué se guarda de una partida en curso

| ID | Regla |
|---|---|
| 8.1 | **Un único snapshot por sesión**, que se sobrescribe con cada jugada confirmada, junto con su contador de versión. No se guarda un historial de snapshots. Resuelve el hallazgo C-10 |
| 8.2 | **Un registro de jugadas**: cada jugada aceptada se guarda como una fila que solo se añade, nunca se modifica. Contiene su número de orden, quién la hizo, la acción, el identificador de la petición, el instante y el tiempo de reloj restante |
| 8.3 | El registro de jugadas **no es event sourcing**. El estado nunca se reconstruye a partir de él. El snapshot es la fuente de verdad |
| 8.4 | Los relojes se guardan en la sesión, en la misma operación que el snapshot: tiempo restante de cada jugador, inicio del turno en curso y fecha límite del turno |
| 8.5 | **No se guardan** los mensajes WebSocket, la presencia, las suscripciones, las jugadas rechazadas ni los eventos internos que el motor genera para las notificaciones |

## 2. La jugada confirmada

| ID | Regla |
|---|---|
| 8.6 | Las jugadas de una misma sesión se procesan de una en una, en el orden en que llegan al servidor |
| 8.7 | **Una jugada confirmada es una sola transacción** que actualiza el snapshot, la versión y los relojes, y añade la fila al registro de jugadas. O se guarda todo o no se guarda nada |
| 8.8 | La actualización solo se aplica si la versión guardada coincide con la esperada. Si no coincide, la transacción se descarta. Es una segunda barrera además de la regla 8.6 |
| 8.9 | Nada se envía a los clientes hasta que la transacción se ha confirmado |
| 8.10 | Si una transacción falla, el servidor descarta la copia en memoria de esa sesión y la vuelve a cargar desde la base de datos. Nunca confía en la memoria después de un fallo. *Sustituida el 2026-11-16 (ADR-014, K2): no hay copia en memoria que descartar. Si la transacción falla, no se guarda nada y la siguiente orden vuelve a leer la sesión de la base de datos* |

## 3. Reintentos y jugadas duplicadas

| ID | Regla |
|---|---|
| 8.11 | **Cada jugada indica sobre qué versión del estado se hizo.** Si el estado ya avanzó, el servidor la rechaza como obsoleta. Evita que una jugada reenviada tarde se aplique sobre un tablero distinto del que vio el jugador |
| 8.12 | El identificador de petición es único por sesión y jugador, y se guarda en el registro de jugadas. Si llega una jugada con un identificador ya registrado, el servidor **devuelve la confirmación original sin aplicarla de nuevo** |
| 8.13 | Los identificadores de petición no caducan por separado: viven lo que viva el registro de jugadas de esa partida. Sobreviven a un reinicio del servidor. Resuelve el hallazgo C-09 |

## 4. Final de partida y estadísticas

| ID | Regla |
|---|---|
| 8.14 | **El final de la partida se guarda en la misma transacción que la última jugada**: estado de la partida, resultado, resultado por jugador y vuelta de la sala a EN ESPERA |
| 8.15 | **Las estadísticas básicas se actualizan en esa misma transacción.** Como una partida solo admite un resultado, un reintento no puede contarla dos veces |
| 8.16 | Lo mismo aplica a los finales que no produce el motor: tiempo agotado, rendición y abandono pasan por el mismo camino y la misma transacción |

## 5. Relojes vencidos y caídas del servidor

| ID | Regla |
|---|---|
| 8.17 | **Dos mecanismos detectan un reloj vencido.** Para las sesiones cargadas en memoria, un temporizador exacto. Para todas, una revisión periódica de la base de datos que busca fechas límite pasadas. La revisión cubre las sesiones no cargadas y los temporizadores perdidos en un reinicio |
| 8.18 | El servidor anota de forma periódica que sigue en marcha. Al arrancar, compara esa anotación con la hora actual para saber cuánto estuvo parado y aplicar la regla 7.29 de ADR-009. Valor inicial: una anotación cada 10 segundos |

## 6. Retención

| ID | Regla |
|---|---|
| 8.19 | **De una partida terminada se conserva todo sin límite de tiempo durante el MVP**: resultado, snapshot final y registro de jugadas |
| 8.20 | La cuenta de un jugador no se borra físicamente mientras tenga partidas. La baja voluntaria con anonimización queda fuera del MVP; el MVP solo contempla la suspensión por un administrador |

---

## 7. Alternativas consideradas en las reglas principales

### 8.2. Registro de jugadas

| Opción | A favor | En contra |
|---|---|---|
| **Snapshot más registro de jugadas** | Una sola tabla resuelve tres necesidades: la protección contra duplicados, la revisión de una partida disputada y la base para repetir o mostrar partidas más adelante. Coste: una fila más por jugada, en la misma transacción | Algo más de almacenamiento |
| Solo snapshot, con una tabla aparte para duplicados | Menos datos | Se pierde el historial de la partida. La tabla de duplicados sería casi igual que el registro, con menos utilidad |
| Event sourcing completo | Historial perfecto y reconstrucción de cualquier estado | Descartado en la línea base (acuerdo B12, ADR-007). Mucho más complejo de implementar y de mantener |

**Decisión:** snapshot más registro de jugadas. Sustituye la tabla `game_events` de la documentación inicial, cuyo propósito no estaba definido (hallazgo C-08).

*Precisada el 2026-11-19 (ADR-018, Z1 y Z2): para que el registro sirva de verdad para repetir una partida, la partida guarda su semilla y sus opciones, y las retiradas de un asiento quedan en `match_retirements` con la misma numeración que las jugadas. El snapshot sigue siendo la fuente de verdad (8.3).*

### 8.11. La jugada indica sobre qué versión se hizo

| Opción | A favor | En contra |
|---|---|---|
| **El cliente envía la versión del estado que tenía delante** | El servidor puede rechazar con certeza una jugada basada en un tablero antiguo. Protege de dobles pulsaciones y de reenvíos tardíos | Añade un campo al mensaje de jugada. El cliente debe mantener la versión |
| Solo el identificador de petición | Mensaje más simple | Una jugada rechazada por "no es tu turno" y reenviada después podría aplicarse cuando el jugador ya no la quería |

**Decisión:** enviar la versión. Es un cambio pequeño en el protocolo que elimina una clase entera de errores difíciles de reproducir.

*Precisada el 2026-11-19 (ADR-019, X15 y X16): con varios asientos activos, a cada uno le vale también la versión desde la que está activo sin interrupción, que se guarda en `game_sessions.active_since`. El asiento que juega y sigue activo vuelve a contar desde su jugada. Con un solo asiento activo, la regla no cambia.*

### 8.15. Cuándo se actualizan las estadísticas

| Opción | A favor | En contra |
|---|---|---|
| **En la misma transacción que el final de la partida** | Siempre coherentes con los resultados. No hace falta ningún proceso adicional. La unicidad del resultado impide contarlo dos veces | La transacción final hace algo más de trabajo |
| En un proceso posterior e independiente | Desacopla el juego de las estadísticas. Es lo que convendrá para el ranking | Necesita un mecanismo propio de reintentos y de control de duplicados. Excesivo para cuatro contadores |

**Decisión:** en la misma transacción para las estadísticas básicas del MVP. Cuando llegue el ranking, que es más costoso de calcular, se hará como proceso posterior a partir de los resultados guardados.

### 8.19. Cuánto tiempo se conserva una partida terminada

| Opción | A favor | En contra |
|---|---|---|
| **Todo, sin límite, durante el MVP** | Nada que programar. El volumen es pequeño: una partida de Cuatro en raya tiene como máximo 42 jugadas. Permite decidir la política con datos reales | La base de datos crece sin tope hasta que se defina una política |
| Borrar el registro de jugadas pasado un plazo | Crecimiento acotado | Hay que programar y vigilar el borrado. Se pierde historial que podría querer mostrarse |

**Decisión:** conservar todo durante el MVP y definir la política de borrado antes del lanzamiento público, cuando se retome el alojamiento.

---

## 8. Efecto sobre los documentos

| Documento | Cambio que implica |
|---|---|
| `docs/03-dominio-datos.md` | Sustituir `game_events` por el registro de jugadas. Añadir a la sesión los datos de reloj y la fecha límite, con su índice. Añadir la anotación de actividad del servidor |
| `docs/04-flujos-y-persistencia.md` | Reescribir "Jugada confirmada" y "Recuperación" con estas reglas. Sustituir el paso 12, que hablaba de un proceso idempotente aparte, por la actualización en la misma transacción |
| `contracts/02-realtime.md` | Añadir a la jugada la versión del estado sobre la que se hizo, y el error de jugada obsoleta |
