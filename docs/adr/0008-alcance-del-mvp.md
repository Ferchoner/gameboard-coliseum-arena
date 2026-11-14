# ADR-008: Alcance del MVP

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-14 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | Pendientes P10 (ranking), P11 (bots y solitario) y P12 (licencias); hallazgos C-01 y C-02; vacíos G-02 y G-03; efecto R-4 (aviso de turno) |
| **Relacionados** | ADR-004 (autenticación), ADR-009 (reglas de dominio) |

## 1. Contexto

La documentación inicial mezclaba capacidades del MVP con otras posteriores: los contratos incluían ranking y pausas, y no incluían administración ni recuperación de contraseña. Además, el producto tiene dos modalidades de partida, tiempo real y por turnos, que la documentación inicial no recogía.

## 2. Tres niveles

| Nivel | Qué es | Corresponde a |
|---|---|---|
| **Corte vertical** | Lo mínimo para jugar una partida completa de principio a fin y validar la arquitectura | Hitos 1 a 3 del backlog |
| **Resto del MVP** | Lo que se añade sobre el corte antes de dar el MVP por terminado | Hito 4 y trabajo adicional |
| **Posterior** | Fuera del MVP. La arquitectura no debe impedirlo, pero no se diseña en detalle ahora | |

## 3. Decisión

| # | Capacidad | Nivel | Motivo |
|---|---|---|---|
| 1 | Registro, inicio y cierre de sesión | Corte vertical | |
| 2 | Cuenta, perfil y jugador básicos | Corte vertical | |
| 3 | Catálogo de juegos | Corte vertical | |
| 4 | Salas públicas: crear, listar, entrar, salir, marcar listo | Corte vertical | |
| 5 | **Partida en tiempo real**, con reloj de hasta 30 minutos por jugador | Corte vertical | Es la que más exige al canal de tiempo real, así que valida antes lo más arriesgado |
| 6 | Resultado e historial de partidas | Corte vertical | |
| 7 | Reconexión y recuperación tras reinicio | Resto del MVP | Hito 4 del backlog |
| 8 | **Partida por turnos**, con reloj de 12, 24 o 36 horas por jugador | Resto del MVP | Reutiliza el mismo reloj y la misma recuperación desde la base de datos que el punto 7 |
| 9 | Lista de "mis partidas en curso", indicando a quién le toca | Resto del MVP | Sin ella la modalidad por turnos no es utilizable |
| 10 | **Aviso de turno dentro de la aplicación** | Resto del MVP | No añade servicios externos |
| 11 | Aplicación instalable como PWA | Resto del MVP | Coste bajo y prepara el punto 12 |
| 12 | **Aviso de turno por notificación push** | Posterior, como primera ampliación | Añade infraestructura de push y, en iPhone, exige la aplicación instalada |
| 13 | Estadísticas básicas por juego: jugadas, ganadas, perdidas, empatadas | Resto del MVP | Proyección sencilla que sirve para validar que los resultados no se cuentan dos veces |
| 14 | **Puntuación (rating) y clasificación (ranking)** | Posterior | Requiere elegir un algoritmo y reglas contra el abuso. Los resultados se guardan desde el principio, así que podrá calcularse después sobre el historial |
| 15 | **Administración mínima** por API: rol de administrador, suspender y reactivar cuentas, cerrar una sala, anular una partida, activar o desactivar juegos y versiones | Resto del MVP | La suspensión con efecto inmediato fue uno de los motivos para elegir sesiones de servidor (ADR-004) |
| 16 | Panel visual de administración | Posterior | La API del punto 15 basta para operar un MVP |
| 17 | **Recuperación de contraseña por correo** | Resto del MVP | Sin ella, quien olvida su contraseña pierde la cuenta. En local el envío se simula; el servicio real se elige junto con el alojamiento |
| 18 | Verificación de la dirección de correo | Posterior | El modelo de datos lo deja previsto |
| 19 | Acceso con cuentas externas | Posterior | Puede añadirse sin cambiar el modelo de sesión (ADR-004) |
| 20 | Bots y juego en solitario | Posterior | El modelo de participantes no lo impide (ADR-011, convención 9.14) |
| 21 | Salas privadas, invitaciones, amigos, emparejamiento automático, espectadores, torneos, monetización | Posterior | |

## 4. Nombre del primer juego

"Connect Four" es una marca registrada de un fabricante de juguetes. La mecánica de alinear cuatro fichas es genérica.

**Decisión:** el juego se llama "Cuatro en raya", tanto en el nombre público como en los identificadores internos (`four-in-a-row`, ver ADR-011), con un tablero y unas fichas de diseño propio. Esto no es asesoría legal. El resto del pendiente P12 (derechos de arte y selección de juegos futuros) se trata cuando se elija el segundo juego.

## 5. Consecuencias

- Las dos modalidades entran en el MVP, pero el corte vertical valida primero el tiempo real.
- El MVP avisa del turno solo dentro de la aplicación. Con relojes de 12 a 36 horas, un jugador que no entre no se entera. Es la simplificación más discutible de este alcance y la razón de que las notificaciones push sean la primera ampliación.
- El ranking queda fuera del MVP. Es lo que más reduce el alcance respecto a los contratos iniciales.
- La administración entra solo como API, sin pantallas.
- Entra la recuperación de contraseña y no la verificación de correo.

## 6. Efecto sobre los documentos

| Documento | Cambio que implica |
|---|---|
| `contracts/01-rest-api.md` | Retirar de la versión 1 `/players/me/rankings` y `/games/:gameId/ranking`. Mantener `/players/me/statistics`. Añadir los endpoints de administración, de recuperación de contraseña y de "mis partidas en curso" |
| `docs/03-dominio-datos.md` | Marcar `game_ratings` como posterior al MVP. Añadir el rol de la cuenta y los datos de reloj de la partida |
| `docs/01-vision-alcance.md` | Actualizar el MVP y la lista de posterior al MVP |
| `planning/backlog-mvp.md` | Añadir las tareas de administración, estadísticas, modalidad por turnos y recuperación de contraseña |
