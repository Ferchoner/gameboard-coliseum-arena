# ADR-007: Línea base de acuerdos de arquitectura

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-14 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | Los doce acuerdos que la documentación inicial recogía como "acordado conceptualmente", sin registro formal (sección 3.2 de la auditoría) |
| **Relacionados** | Todos los demás ADR |

## 1. Contexto

La documentación inicial enumeraba doce acuerdos de fondo sin confirmación explícita. Este ADR los ratifica con su redacción definitiva. No decide nada nuevo: donde un acuerdo deja detalles abiertos, se indica qué documento los resuelve.

## 2. Decisión

Se ratifican los doce acuerdos con la redacción siguiente.

| # | Acuerdo | Redacción vigente | Detalle en |
|---|---|---|---|
| B1 | API REST más canal de tiempo real | REST para operaciones de petición y respuesta. WebSocket para suscripciones, estado en vivo y acciones de juego | `contracts/01-rest-api.md`, `contracts/02-realtime.md` |
| B2 | Motor desacoplado | El motor de juego no depende de la red, de la interfaz ni de la persistencia | ADR-001, condición 5.5 |
| B3 | Registro de juegos | Cada motor se registra por juego y versión, y la sesión de juego lo resuelve mediante un registro | ADR-011 |
| B4 | Sala, partida y sesión de juego | Son conceptos distintos. La sala es el lugar de reunión; la partida es el registro histórico con su resultado; la sesión de juego es el estado vivo de una partida | ADR-009 |
| B5 | Almacenamiento | PostgreSQL | ADR-002 |
| B6 | Fuente de verdad del estado | **PostgreSQL es la fuente de verdad del estado de toda partida.** La memoria del proceso es solo una caché de las sesiones de juego abiertas, que se reconstruye desde la base de datos cuando hace falta. Ninguna jugada se confirma antes de guardarse | ADR-010 |
| B7 | Redis | Sin Redis en el MVP. Se evaluará si algún día hay más de una instancia | |
| B8 | Primer juego | El primer juego es el de alinear cuatro fichas, para dos jugadores, con el nombre "Cuatro en raya" | ADR-008 |
| B9 | Frontend | Nuxt, Vue y TypeScript para la plataforma. La tecnología de dibujo de cada tablero se decide juego por juego; Phaser no es obligatorio | ADR-006 |
| B10 | Backend y API primero | Los contratos se definen antes que la interfaz, y el frontend los consume | |
| B11 | Identidad | La identidad se deriva de la autenticación. El servidor nunca acepta un identificador de jugador enviado por el cliente como prueba de identidad | ADR-004 |
| B12 | Persistencia por jugada | Cada jugada confirmada guarda el estado resultante. No se adopta event sourcing | ADR-010 |

## 3. El único cambio de fondo: B6

La redacción inicial decía "estado activo en memoria de proceso y snapshots transaccionales". Con partidas por turnos que duran días, esa frase invita a pensar que la memoria es el lugar donde vive la partida. La redacción vigente invierte el énfasis: la memoria es una optimización. Es coherente con la condición de ADR-003 de no emitir nada antes de guardar.

## 4. Consecuencias

- El backend es un único proceso persistente durante el MVP. No se usan funciones sin servidor.
- Cualquier sesión de juego puede descargarse de memoria y volver a cargarse sin pérdida.
- Añadir una segunda instancia exigirá revisar B7 y el registro de suscripciones en memoria de ADR-003.

## 5. Referencias

- `docs/auditoria/auditoria-consistencia-y-plan-de-cierre.md`, sección 3.2.
