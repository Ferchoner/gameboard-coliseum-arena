# Backlog del MVP por hitos

| Campo | Valor |
|---|---|
| **Estado** | Versión 1. Los hitos 0 a 3 siguen el alcance aceptado. El reparto de los hitos 4 a 7 se aceptó el 2026-11-16 (B1) |
| **Sustituye a** | El backlog inicial |
| **Recoge** | ADR-008 (alcance del MVP) y los contratos, versión 1 |

**Cómo leer este documento.** El contenido de cada hito sale del alcance aceptado en ADR-008. Lo que este documento decide por su cuenta es **cómo se reparte el resto del MVP en los hitos 4 a 7** (B1, [sección final](#reparto-del-resto-del-mvp)). Se propuso al cerrar el Hito 0 y se aceptó el 2026-11-16, al terminar el corte vertical.

Los hitos 1 a 4 están autorizados, todos el 2026-11-16, el Hito 5, el 2026-11-18, y el Hito 6, el 2026-11-19. Ninguna tarea del Hito 7 puede empezar sin una autorización explícita.

---

## Hito 0. Decisiones y contratos

- [x] Decisiones de backend, acceso a datos, tiempo real y autenticación (ADR-001 a ADR-004).
- [x] Decisiones de repositorio, frontend, línea base, alcance, reglas de dominio, persistencia y convenciones (ADR-005 a ADR-011).
- [x] Modelo de datos, versión 1, con su diagrama de entidades.
- [x] Contrato del motor de juego, versión 1.
- [x] Protocolo de tiempo real, versión 1.
- [x] API REST, versión 1, en formato OpenAPI.
- [x] Catálogo único de errores y matriz de permisos.
- [x] Documentos de arquitectura, backlog y README al día.
- [x] Revisión de cierre del Hito 0, en [`cierre-hito-0.md`](cierre-hito-0.md).
- [x] Autorización para implementar. Concedida el 2026-11-16 solo para el Hito 1.

Los diagramas de arquitectura están en [`docs/02-arquitectura.md`](../docs/02-arquitectura.md), y el de entidades, en [`docs/03-dominio-datos.md`](../docs/03-dominio-datos.md).

---

## Corte vertical

### Hito 1. Base de la plataforma

- [x] Tomar las decisiones de arranque aplazadas en los ADR. Aceptadas el 2026-11-16 en [ADR-012](../docs/adr/0012-decisiones-de-arranque.md).
- [x] Repositorio con espacios de trabajo: backend, frontend, contratos y motor (ADR-005).
- [x] Comprobación automática de que el motor no depende de nada del servidor (ADR-001, condición 5.5).
- [x] Tipos de la API, del protocolo y del catálogo de errores en el paquete de contratos.
- [x] Base del backend: configuración, conexión a PostgreSQL, migraciones, registro de actividad, comprobación de salud, sobre de respuesta y errores del catálogo.
- [x] Entorno local con el frontend y la API en dos orígenes del mismo sitio, como en producción (ADR-004), con un modo en HTTP y otro en HTTPS (ADR-012, decisión S14).
- [x] Cuenta, perfil y jugador. Registro, inicio y cierre de sesión con cookie. CORS, CSRF y lista de orígenes.
- [x] Catálogo de juegos y versiones, con el registro de motores.
- [x] Frontend mínimo: registro, inicio de sesión y catálogo.

Implementado en noviembre de 2026. El catálogo está vacío hasta el Hito 3, que trae el primer motor de juego.

### Hito 2. Salas y tiempo real

- [x] Crear, listar, ver, entrar, salir y marcarse listo, por la API.
- [x] Capacidad comprobada de forma atómica (7.15) y límite de partidas simultáneas (7.30).
- [x] Conexión WebSocket con identidad en la apertura, latidos y cierre al terminar la sesión.
- [x] Suscripción a salas, avisos de cambios y presencia.
- [x] Cierre de salas inactivas (7.14).
- [x] Frontend: lista de salas y sala de espera.

Decisiones del hito en [ADR-013](../docs/adr/0013-decisiones-del-hito-2.md). En este hito una sala completa todavía no inicia partida: el inicio se conecta en el Hito 3 (H2). Como el catálogo está vacío hasta entonces, las salas se prueban a mano desde el Hito 3 (H3).

Construido el 2026-11-16. Lo que resultó al construir, incluidas cinco elecciones menores que no estaban en ADR-013, está en su sección 13.

### Hito 3. Cuatro en raya en tiempo real

- [x] Motor de Cuatro en raya, con pruebas de sus reglas.
- [x] Inicio de partida automático y atómico, con sorteo de asientos (7.9, 9.19).
- [x] Jugadas con versión del estado, control de repetidas, transacción única y registro de jugadas (8.6 a 8.13).
- [x] Relojes: descuento, vencimiento y jugada con el reloj agotado (7.2 a 7.5).
- [x] Rendición (7.19).
- [x] Final de partida en la misma transacción, con resultado, y vuelta de la sala a la espera para la revancha (8.14, 7.11).
- [x] Frontend: tablero, relojes, resultado e historial.
- [x] Prueba de extremo a extremo de una partida completa y de las jugadas rechazadas.
- [x] Revisión periódica de relojes vencidos (8.17). Adelantada del Hito 4 (ADR-014, K3).
- [x] Prueba en navegador de los diez criterios de aceptación, con Playwright (ADR-014, K8).

Decisiones del hito en [ADR-014](../docs/adr/0014-decisiones-del-hito-3.md). Cuatro en raya se ofrece solo en tiempo real hasta el Hito 5 (K6). Las estadísticas no se escriben todavía: el Hito 6 las rellena con los resultados guardados (K4). Hasta el Hito 4, el tiempo de una parada del servidor se descuenta a quien le tocaba jugar (K3).

Construido el 2026-11-16. Lo que resultó al construir, incluidas siete elecciones menores que no estaban en ADR-014 y se confirmaron el 2026-11-16, está en su sección 13.

### Criterios de aceptación del corte vertical

Los diez se comprueban de forma automática con las pruebas en navegador (`pnpm test:e2e`), en cada pull request.

Dos personas, cada una en su navegador:

1. Se registran e inician sesión.
2. Una crea una sala de Cuatro en raya en tiempo real y la otra entra.
3. Se marcan listas y la partida empieza sola.
4. Alternan jugadas válidas y cada una ve el tablero y los dos relojes al día.
5. Una jugada fuera de turno, una en columna llena y una hecha sobre un estado antiguo se rechazan, cada una con su código.
6. Una jugada reenviada con el mismo identificador de petición no se aplica dos veces.
7. La partida termina por cuatro en línea, por tablero lleno, por tiempo agotado o por rendición, y las dos ven el mismo resultado.
8. Las dos pueden consultar la partida en su historial.
9. La sala vuelve a la espera y pueden jugar la revancha, con los asientos alternados.
10. Ninguna puede actuar en nombre de la otra, envíe lo que envíe.

---

## Resto del MVP

### Hito 4. Reconexión y recuperación

- [x] Reconexión del cliente con espera progresiva y nueva suscripción (7.28). Hecha en el Hito 2, y el reenvío de la orden sin respuesta en el Hito 3 (ADR-014, L4).
- [x] Reconexión inmediata al volver la red o la pestaña (ADR-015, V7).
- [x] Abandono en tiempo real tras 2 minutos sin conexión (7.26), con un margen de 5 segundos al desconectarse (ADR-015, V2 y V3), y salida de la sala de quien abandona (7.32).
- [x] Anotación periódica de actividad del servidor y ajuste de relojes al arrancar (8.18, 7.29).
- [x] Carga de la sesión de juego desde la base de datos cuando hace falta (7.22). Hecha en el Hito 3: no hay copia en memoria (ADR-014, K2).
- Revisión periódica de relojes vencidos (8.17): pasó al Hito 3 (ADR-014, K3).
- [x] Pruebas: reinicio del servidor a mitad de partida y corte de red de un jugador.

Decisiones del hito en [ADR-015](../docs/adr/0015-decisiones-del-hito-4.md).

Construido el 2026-11-16. Lo que resultó al construir, incluidas nueve elecciones menores que no estaban en ADR-015 y se confirmaron el 2026-11-16, está en su sección 13. El criterio de aceptación se comprueba en cada pull request con una prueba en navegador que reinicia la API de verdad a mitad de partida.

**Criterio de aceptación:** tras reiniciar el servidor después de una jugada confirmada, los dos jugadores reconectan, ven el mismo estado y a ninguno se le ha descontado el tiempo de la caída.

### Hito 5. Modalidad por turnos

- [x] Salas por turnos: inicio al completarse la sala y revancha opcional (7.10, 7.31). Hecho en los hitos 2 y 3.
- [x] Controles de tiempo de 12, 24 y 36 horas (ADR-016, N1), y límite de 20 partidas simultáneas (7.2, 7.30). El límite, hecho en el Hito 2.
- [x] Lista de "mis partidas en curso", que indica en cuáles te toca, primero las de tu turno y con la hora límite, también en la portada (N3).
- [x] Aviso de turno dentro de la aplicación: contador en la cabecera, aviso emergente y número en el título de la pestaña (N2).
- [x] Aplicación instalable como PWA, con manifiesto, iconos y service worker propios (N4).
- Probar a mano la instalación en Chrome de escritorio y en un móvil (N6): sin hacer al cerrar el hito, pasó al Hito 7 el 2026-11-19.

Decisiones del hito en [ADR-016](../docs/adr/0016-decisiones-del-hito-5.md), aceptadas el 2026-11-18.

Construido el 2026-11-18. Lo que resultó al construir, incluidas seis elecciones menores que no estaban en ADR-016 y se confirmaron el 2026-11-18, está en su sección 14. El criterio de aceptación se comprueba en cada pull request con una prueba en navegador en la que dos personas se turnan sin coincidir nunca.

**Criterio de aceptación:** dos personas juegan una partida completa sin coincidir conectadas en ningún momento, y cada una ve al entrar que le toca.

### Hito 6. Cuenta, estadísticas y administración

- [x] Edición del perfil y cambio de contraseña.
- [x] Recuperación de contraseña, con el envío de correo simulado en local.
- [x] Perfil público y estadísticas básicas por juego, actualizadas en la transacción del final de partida (8.15). La tabla se crea aquí y se rellena con los resultados de las partidas ya jugadas (ADR-014, K4).
- [x] Administración mínima por API: suspender y reactivar cuentas, cerrar salas, anular partidas, y activar o desactivar juegos y versiones. Los juegos y versiones nuevos llegan inactivos con su motor, y se activan desde aquí (decidido el 2026-11-16, ver [`decisiones-y-pendientes.md`](decisiones-y-pendientes.md)).

Decisiones del hito en [ADR-017](../docs/adr/0017-decisiones-del-hito-6.md). La administración se hace solo por la API, con la guía de [`docs/guia-administracion.md`](../docs/guia-administracion.md) (U2).

Construido y fusionado el 2026-11-19, en la PR #8. Lo que resultó al construir, incluidas ocho elecciones menores que no estaban en ADR-017 y se confirmaron el 2026-11-19, está en su sección 15. El criterio de aceptación se comprueba en cada pull request con cuatro pruebas en navegador.

**Criterio de aceptación** (ADR-017, U1): una persona cambia su nombre visible, que ven los demás, y su contraseña. Después la olvida, la recupera con el enlace del correo simulado y sus sesiones abiertas en otro navegador se cierran. Su perfil público muestra sus estadísticas de Cuatro en raya, que cuentan también las partidas jugadas antes de este hito y se ponen al día al terminar una partida nueva. Un administrador, solo con la API: suspende una cuenta y su dueño sale al instante de todas sus pestañas; anula una partida en curso y los dos jugadores ven que se anuló y que no cuenta; y retira Cuatro en raya del catálogo y lo vuelve a poner, sin desplegar ni tocar la base de datos.

### Hito 7. Preparación para publicar

Depende de las decisiones de alojamiento, que están aplazadas.

- [ ] Límites de frecuencia de la API y del canal de tiempo real, con sus valores revisados.
- [ ] Revisión de seguridad.
- [ ] Alojamiento, copias de seguridad, supervisión y guía de despliegue.
- [ ] Servicio real de envío de correo.
- [ ] Prueba de la cookie de sesión en Safari con un despliegue real (ADR-004).
- [ ] Política de borrado de datos y registro de acciones de administración, si se decide incluirlos.
- [ ] Cierre de la conexión con el código 1008 cuando un cliente incumple el protocolo de forma repetida (ADR-013, H9).
- [ ] Pruebas en navegador también en Firefox y WebKit, y en el modo HTTPS (ADR-014, sección 13).
- [ ] Probar a mano la instalación de la aplicación en Chrome de escritorio y en un móvil (ADR-016, N6). Viene del Hito 5.
- [ ] Cómo sirve el alojamiento `sw.js`, sin guardarlo en caché, y el manifiesto con su tipo (ADR-016, sección 12).
- [ ] Probar el entorno local en Windows (ADR-013 y ADR-014, pendientes).

Las tareas de mejora del [análisis de la aplicación](analisis/informe-de-analisis-y-tareas.md) del 2026-11-19 que tocan este hito (T-06, T-11, T-18, T-19 y T-20) se trabajan cuando se autorice.

### Juegos nuevos, antes de publicar

Decididos el 2026-11-19 ([ADR-019](../docs/adr/0019-batalla-naval-y-jugadas-simultaneas.md), F1): Batalla naval y después Dominó. Se construyen antes de desplegar en servidores.

- [x] Jugadas simultáneas: versión por asiento activo y reloj de otro asiento (T-23; ADR-019, X15 a X17).
- [x] Batalla naval: motor, tablero, alta inactiva y pruebas (ADR-019, X1 a X14). Entra inactiva; se activa desde la administración.
- [x] Asientos retirados con más de dos jugadores: la sesión los guarda, no se retiran dos veces, siguen en la sala sin contar para su límite y salen al terminar (T-24; ADR-020, DO18 a DO22).
- [x] Dominó: motor, generador con semilla, tablero, alta inactiva y pruebas (ADR-020, DO1 a DO17).

El 2026-11-20 quien decide pidió, como prueba, un juego de deducción moderno que tiene en casa ([ADR-022](../docs/adr/0022-cinco-a-ciegas-y-jugadas-fuera-de-turno.md)).

- [x] Jugadas fuera de turno: un motor puede aceptar jugadas de un asiento que no está activo, sin gastar reloj; la página de la partida y la batería común las admiten (T-25; ADR-022, CA19).
- [x] Cinco a ciegas: motor, tablero, hoja de deducción, alta inactiva y pruebas (ADR-022, CA1 a CA18 y CA20).
- [x] Mareas: motor, catálogo propio, simulación de equilibrio, tablero, alta inactiva y pruebas (ADR-023, MA1 a MA20).

---

## Posterior al MVP

Notificaciones push, puntuación y clasificación, panel visual de administración, verificación de correo, acceso con cuentas externas, bots, salas privadas, invitaciones, amigos, emparejamiento automático, espectadores, torneos y monetización (ADR-008).

---

## Reparto del resto del MVP

**Aceptado el 2026-11-16** por quien decide, al terminar el corte vertical, tal como se recomendaba.

| ID | Decisión | Alternativa | Motivo |
|---|---|---|---|
| B1 | **El resto del MVP se reparte en cuatro hitos, en este orden:** reconexión y recuperación, modalidad por turnos, cuenta y administración, y preparación para publicar | Otro orden, o un solo hito con todo | La modalidad por turnos se apoya en la recuperación desde la base de datos, así que va después de ella (ADR-008, punto 8). Lo que depende del alojamiento va al final porque esa decisión está aplazada |
