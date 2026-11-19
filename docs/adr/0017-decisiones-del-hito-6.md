# ADR-017: Decisiones del Hito 6, cuenta, estadísticas y administración

| Campo | Valor |
|---|---|
| **Estado** | Propuesta |
| **Fecha** | 2026-11-19 |
| **Decide** | Fernando Hernandez Argueta |
| **Cierra** | Las estadísticas aplazadas (ADR-014, K4) y la administración del catálogo (decisión del 2026-11-16) |
| **Depende de** | ADR-004, ADR-008 (puntos 15 a 17), ADR-009 (reglas 7.12, 7.14, 7.20, 7.26 y 7.32), ADR-010 (regla 8.15), ADR-014, el modelo de datos, la API, el protocolo y la matriz de permisos |

---

## 1. Contexto

El Hito 6 está autorizado desde el 2026-11-19, con la condición de siempre: sus decisiones abiertas se presentan antes de escribir código. Su alcance, según el backlog:

- Edición del perfil y cambio de contraseña.
- Recuperación de contraseña, con el envío de correo simulado en local.
- Perfil público y estadísticas básicas por juego, actualizadas en la transacción del final de partida (8.15). La tabla se crea aquí y se rellena con los resultados de las partidas ya jugadas (K4).
- Administración mínima por API: suspender y reactivar cuentas, cerrar salas, anular partidas, y activar o desactivar juegos y versiones. Los juegos y versiones nuevos llegan inactivos con su motor y se activan desde aquí.

A diferencia de los hitos anteriores, **casi todo lo que hace este hito ya está fijado en los contratos**, que se aceptaron en el Hito 0 pensando en él. Lo comprobé en los documentos y en el código:

| Qué | Dónde está fijado | Estado en el código |
|---|---|---|
| Las 14 operaciones del hito: `PATCH /me`, `PUT /me/password`, `/auth/password-reset/request` y `/confirm`, `/players/{username}` y `/statistics`, y las 8 de `/admin` | API, versión 1 | Los tipos y la validación están en `packages/contracts`. El servidor no implementa ninguna |
| Quién puede hacer cada una y en qué orden se comprueba | Matriz de permisos, secciones 2, 5 y 7 | El rol se lee de la base de datos en cada petición, así que conceder o retirar el rol surte efecto al momento |
| Los códigos de error: `FORBIDDEN`, `INVALID_RESET_TOKEN`, `INVALID_CURRENT_PASSWORD`, `USER_NOT_FOUND`, `CANNOT_CHANGE_OWN_STATUS`, `GAME_VERSION_IS_CURRENT`, `ENGINE_NOT_REGISTERED` y el resto | Catálogo de errores | Ya están en el catálogo del código |
| Las tablas `password_reset_tokens` y `game_statistics` | Modelo de datos, secciones 3.1 y 3.6 | No existen todavía |
| Cerrar una sala con partida anula la partida en la misma transacción; una partida anulada devuelve la sala a la espera o la cierra, como al terminar | Modelo de datos, R8 | La anulación por fallo técnico (K12) ya lo hace. La del administrador usará el mismo camino, con el motivo `ADMIN` |
| Al suspender, se cierran las sesiones y las conexiones al instante, con el código 4001 | API y protocolo | Una cuenta suspendida ya no puede iniciar sesión, y su sesión deja de valer en la siguiente petición |
| Cambiar la contraseña cierra las demás sesiones; recuperarla, todas | API | Por hacer |
| La pantalla de partida anulada por un administrador | Frontend | Ya existe: "Un administrador anuló la partida. No cuenta para nadie." |

Lo que falta decidir son los huecos que los contratos no cubren, cómo se opera la administración sin panel visual, cómo se simula el correo y cómo se prueba. Son las decisiones de este documento.

## 2. Cómo leer este documento

- Cada decisión tiene un identificador (U1 a U18), sus alternativas y una recomendación.
- Las decisiones U1 a U10 afectan a la experiencia, a la arquitectura o cuesta deshacerlas. Van explicadas una a una.
- Las decisiones U11 a U18 son menores y fáciles de cambiar. Van en una tabla.
- **Ninguna está aceptada.** Lo que dice "recomendación" es solo eso hasta que quien decide la confirme.
- **Ninguna cambia un contrato ni una regla aceptada, y ninguna añade dependencias.** Dos piden atención: **U2** mantiene el alcance aprobado (sin panel visual) frente a una alternativa que lo cambiaría, y **U5** precisa qué pasa con las salas existentes cuando un administrador cambia el catálogo, que el contrato no dice.

## 3. Resumen

| ID | Asunto | Recomendación |
|---|---|---|
| U1 | Criterio de aceptación | El hito no tiene uno. Se propone uno que cubre cuenta, estadísticas y administración, y se comprueba en el navegador |
| U2 | Cómo se opera la administración | Solo por la API, como dice el alcance, con una guía de uso con `curl`. Sin páginas de administración |
| U3 | Cómo se concede el rol de administrador | Una orden, `pnpm admin:role <usuario> ADMIN` o `USER`, que cambia la base de datos |
| U4 | Qué más pasa al suspender una cuenta | Además de cerrar sesiones y conexiones, sale de las salas en espera. Sus partidas en curso siguen sus reglas |
| U5 | Las salas cuando cambia el catálogo | Al desactivar un juego se cierran sus salas; las que tienen partida, al terminarla. Si la versión vigente nueva no admite las opciones de una sala, la sala se cierra igual |
| U6 | Correo simulado | Cada correo se guarda como archivo en una carpeta local y se anota en el registro. Sin dependencias |
| U7 | Recuperación de contraseña | Enlace de un solo uso, válido 1 hora, con el token tras `#` en la dirección. Un enlace nuevo anula los anteriores. A una cuenta suspendida no se le envía |
| U8 | Estadísticas | La tabla se crea y se rellena en la misma migración, y desde entonces se actualiza en la transacción del final de partida |
| U9 | Pantallas | `/cuenta` para el perfil y la contraseña, `/recuperar-contrasena` y `/jugadores/[username]` con el perfil y las estadísticas |
| U10 | Pruebas | Pruebas del servidor de todas las operaciones y sus permisos, y cuatro pruebas en navegador |
| U11 a U18 | Decisiones menores | [Sección 9](#9-decisiones-menores) |

---

## 4. Alcance y uso

### U1. Criterio de aceptación

Los hitos 3 a 5 tienen un criterio de aceptación en el backlog. El Hito 6 no tiene ninguno.

| Opción | A favor | En contra |
|---|---|---|
| **Un criterio que recorre las tres partes del hito**, que se comprueba con pruebas en navegador (U10) | El hito se da por terminado con algo que se puede ver, como los anteriores | Un criterio largo |
| Sin criterio: basta con marcar las tareas | Nada que escribir | No hay una forma acordada de dar el hito por bueno |

**Recomendación:** este criterio.

> Una persona cambia su nombre visible, que ven los demás, y su contraseña. Después la olvida, la recupera con el enlace del correo simulado y sus sesiones abiertas en otro navegador se cierran. Su perfil público muestra sus estadísticas de Cuatro en raya, que cuentan también las partidas jugadas antes de este hito y se ponen al día al terminar una partida nueva. Un administrador, solo con la API: suspende una cuenta y su dueño sale al instante de todas sus pestañas; anula una partida en curso y los dos jugadores ven que se anuló y que no cuenta; y retira Cuatro en raya del catálogo y lo vuelve a poner, sin desplegar ni tocar la base de datos.

La activación de una versión nueva y el cambio de versión vigente se comprueban en las pruebas del servidor con un juego de pruebas, porque hoy no hay una segunda versión de ningún juego.

### U2. Cómo se opera la administración

El alcance aprobado dice "administración mínima por API" (ADR-008, punto 15) y deja el panel visual para después del MVP (punto 16). El 2026-11-16, al decidir cómo llegan los juegos nuevos, quien decide dijo que "debería ser solo a través del panel administrador". Se anotó entonces que en el MVP ese panel es la API. Falta decidir cómo se usa en la práctica: la API exige la cookie de sesión y la cabecera `Origin` del frontend (ADR-004).

| Opción | A favor | En contra |
|---|---|---|
| **Solo la API, con una guía.** Un documento nuevo, `docs/guia-administracion.md`, con cada operación como una orden de `curl` lista para copiar: iniciar sesión guardando la cookie, y después buscar una cuenta, suspenderla, cerrar una sala, anular una partida y cada paso del catálogo | Respeta el alcance aprobado. Nada nuevo que construir ni probar en el frontend. La guía sirve también de prueba a mano | Hay que copiar identificadores de una respuesta a la siguiente. Incómodo para un uso frecuente |
| Páginas mínimas de administración en el frontend: una lista de cuentas con el botón de suspender y la tabla del catálogo con sus interruptores | Mucho más cómodo, y es lo que quien decide describió el 2026-11-16 | **Cambia el alcance aprobado** (ADR-008, punto 16). Unas tres páginas más, con sus pruebas, y probablemente la librería de componentes que K7 dejó para "la administración visual" |
| Órdenes de consola en el servidor que llaman a los servicios sin pasar por la API | Sin cookies ni cabeceras | Hay que estar en la máquina del servidor. Duplica la API y se salta sus comprobaciones |

**Recomendación:** solo la API, con la guía. Si se quiere el panel, conviene decidirlo como un cambio de alcance explícito, en este hito o después del MVP; la API que se construye ahora es la que usaría.

### U3. Cómo se concede el rol de administrador

La decisión A5 dice que el rol no se concede por la API, sino en la base de datos. No dice cómo.

| Opción | A favor | En contra |
|---|---|---|
| **Una orden: `pnpm admin:role <usuario> ADMIN`**, y `USER` para retirarlo. Es un script del backend que usa la misma configuración y conexión que el servidor, cambia la columna `role` y dice qué cambió. No necesita que el servidor esté parado, porque el rol se lee en cada petición | Sin SQL a mano. Comprueba que la cuenta existe y que el valor es válido. Sirve en local y, más adelante, en el alojamiento | Un script más que mantener |
| Una instrucción SQL documentada en la guía | Nada que construir | Fácil equivocarse de cuenta o de valor. Hay que conectarse a la base de datos a mano |
| Una variable de entorno con la lista de administradores | Se ve en la configuración | El rol estaría en dos sitios que pueden discrepar. Cambiarlo exige reiniciar |

**Recomendación:** la orden. Las pruebas en navegador la usan para crear su administrador.

## 5. Administración

### U4. Qué más pasa al suspender una cuenta

El contrato dice que al suspender se cierran todas las sesiones y conexiones de la cuenta, al instante. No dice qué pasa con las salas en las que está ni con sus partidas en curso.

| Opción | A favor | En contra |
|---|---|---|
| **Cerrar sesiones y conexiones, y sacarla de las salas en espera, en la misma transacción.** Salir de una sala en espera es lo mismo que si saliera ella: deja libre su plaza y, si era el anfitrión, la sala se cierra (7.12). Sus partidas en curso siguen sus reglas: en tiempo real, sin conexión, pierde por abandono a los 2 minutos (7.26) y sale de la sala (7.32); por turnos, su reloj sigue corriendo. Si hace falta acabar antes, el administrador puede anular la partida | Ninguna regla nueva. Nadie se queda esperando en una sala a alguien que no puede volver. El resultado de una partida no lo decide el administrador | Por turnos, el rival puede esperar hasta que se agote el reloj, hasta 36 horas |
| Solo lo que dice el contrato | Lo mínimo | Una cuenta suspendida ocupa plazas en salas en espera hasta que se cierran solas (30 minutos o 7 días, 7.14). Si es el anfitrión, la sala queda bloqueada |
| Además, que pierda al momento por abandono todas sus partidas en curso | El rival no espera | Regla nueva: el abandono solo existe en tiempo real (7.26, 7.27). Una suspensión por error le cuesta partidas que no se pueden devolver |

**Recomendación:** cerrar sesiones y conexiones y sacarla de las salas en espera. Reactivar una cuenta solo cambia su estado: no la devuelve a ninguna sala.

Un caso que queda cubierto por las reglas de siempre: si una sala por turnos con revancha vuelve a la espera después de que su miembro suspendido perdiera por tiempo, ese miembro sigue en ella y la sala se cierra sola a los 7 días (7.14).

### U5. Las salas cuando cambia el catálogo

El contrato dice que desactivar un juego "lo retira del catálogo e impide crear salas nuevas" y que "las partidas en curso continúan". No dice qué pasa con las salas que ya existen. Y hoy, al empezar una partida, el servidor toma la versión vigente del juego sin mirar si el juego sigue activo ni si esa versión admite las opciones de la sala: si un administrador cambia la versión vigente por una que no admite el reloj o el número de jugadores de una sala, esa sala fallaría con un error del servidor al empezar su siguiente partida.

| Opción | A favor | En contra |
|---|---|---|
| **Retirar las salas afectadas, sin cortar ninguna partida.** Al desactivar un juego, sus salas en espera se cierran con el motivo `ADMIN` en la misma transacción, y las que tienen una partida en curso la terminan y después se cierran, sin revancha. Al cambiar la versión vigente, cada sala sigue con la nueva en su siguiente partida, como hoy; si la versión nueva no admite sus opciones (modalidad, reloj, número de jugadores u opciones del juego), la sala se cierra igual: al momento si está en espera, al terminar si tiene partida. Volver a activar un juego no reabre nada | Desactivar un juego lo retira de verdad. Ninguna partida se corta. Desaparece el error del servidor | Los jugadores de una sala en espera la pierden sin haber hecho nada. Ven el aviso de sala cerrada que ya existe |
| Dejar las salas como están | Lo mínimo | Un juego retirado se sigue jugando sin límite en las salas con revancha. El error del servidor con una versión incompatible sigue ahí |
| Rechazar la operación mientras haya salas abiertas del juego | Nadie pierde su sala | El administrador no puede retirar un juego mientras alguien juegue, y con salas por turnos de 7 días puede no poder nunca. Necesita un código de error que el contrato no tiene |

**Recomendación:** retirar las salas afectadas, sin cortar ninguna partida. Desactivar una versión que no es la vigente no afecta a ninguna sala, porque una partida empieza siempre con la vigente, y el contrato ya impide desactivar la vigente.

## 6. Recuperación de contraseña

### U6. Correo simulado

El alcance pide que en local el envío se simule; el servicio real se elige con el alojamiento, en el Hito 7.

| Opción | A favor | En contra |
|---|---|---|
| **Un buzón de archivos.** El servidor envía el correo a través de una interfaz, `Mailer`, con una sola implementación por ahora: guarda cada correo como un archivo de texto con su destinatario, asunto y cuerpo en una carpeta local, `apps/backend/var/mail/`, fuera del control de versiones, y anota en el registro a quién se envió y dónde quedó. En las pruebas del servidor se usa una que lo guarda en memoria | Sin dependencias. Las pruebas en navegador leen el enlace del archivo. Cambiar al servicio real será añadir otra implementación de la misma interfaz | No se ve como un correo de verdad |
| Mailpit en Docker, que recibe por SMTP y enseña los correos en una página | Se ve como un correo real | Un contenedor más en el entorno local y un cliente SMTP como dependencia nueva, cuando el servicio real puede no usar SMTP |
| Solo una línea en el registro con el enlace | Lo más simple | Las pruebas en navegador tendrían que leer la salida del servidor |

**Recomendación:** el buzón de archivos. Con U18, el servidor en modo producción no arranca con el correo simulado, para que nadie lo publique sin servicio real.

### U7. Cómo funciona el enlace de recuperación

El contrato fija lo esencial: un enlace de un solo uso, la misma respuesta exista o no la cuenta, y al usarlo se cierran todas las sesiones. El modelo de datos guarda solo un hash del token, su caducidad y si se usó.

| Asunto | Recomendación | Alternativa |
|---|---|---|
| El token | 32 bytes al azar, guardado como hash SHA-256, igual que el de la sesión | Un código corto de 6 cifras. El contrato habla de un enlace |
| Validez | 1 hora, configurable | 24 horas. Un enlace que vive más es más fácil de aprovechar si alguien lee el correo |
| Varios enlaces | Pedir uno nuevo anula los anteriores sin usar, y usar uno anula todos los de la cuenta | Dejar válidos todos hasta que caduquen |
| La dirección | `<frontend>/recuperar-contrasena#token=…`. Lo que va tras `#` no sale del navegador: no llega a los registros de ningún servidor ni a la cabecera `Referer` | Como parámetro, `?token=…`, que sí viaja al servidor del frontend |
| Cuenta suspendida | Se responde lo mismo, pero no se envía nada. No podría iniciar sesión de todos modos | Enviarlo. Cambiaría la contraseña y seguiría sin poder entrar |
| Tiempo de respuesta | El correo se prepara y se guarda después de responder, para que la respuesta no tarde más cuando la cuenta existe | Responder al terminar el envío |
| Al usarlo | Una sola transacción: nueva contraseña, token usado, los demás tokens y todas las sesiones borrados. Después se cierran las conexiones con 4001 | |

**Recomendación:** todo lo de la tabla. Los límites de frecuencia, que el contrato ya prevé con `429`, son del Hito 7.

## 7. Estadísticas

### U8. Cómo se crean, se rellenan y se actualizan

K4 dejó para este hito crear `game_statistics` y rellenarla con los resultados guardados desde el Hito 3. La regla 8.15 pide que, desde entonces, se actualicen en la transacción del final de partida.

| Opción | A favor | En contra |
|---|---|---|
| **Crear y rellenar en la misma migración.** La migración crea la tabla y, en una sola consulta, suma los resultados de cada jugador en las partidas terminadas, por juego. Desde ese momento, el final de partida suma uno a cada participante en la misma transacción que guarda el resultado | Imposible que una partida quede sin contar o cuente dos veces: lo que termina antes de la migración lo cuenta el relleno, y lo que termina después, el final de partida. Lo que dicen las estadísticas coincide siempre con los resultados guardados | La migración hace algo más que crear una tabla |
| Un script de relleno aparte | La migración solo crea la tabla | Si se olvida ejecutar, las estadísticas faltan. Si se ejecuta dos veces, cuentan doble |
| No guardar la tabla y calcular al pedirlas | Nada que mantener al día | Contradice el modelo de datos y la regla 8.15. Cada consulta recorre todo el historial del jugador |

**Recomendación:** crear y rellenar en la misma migración. Las estadísticas suman todas las modalidades y versiones de un juego, como dice el contrato, que da una entrada por juego. Una partida anulada no cuenta nunca (7.20), y anular una partida solo es posible mientras está en curso, así que nunca hay que restar.

## 8. Pantallas y pruebas

### U9. Pantallas

| Opción | A favor | En contra |
|---|---|---|
| **Tres páginas nuevas.** `/cuenta`: el correo y el nombre de usuario, que no se cambian; el nombre visible y la biografía, que sí; y el cambio de contraseña, con la actual y la nueva. `/recuperar-contrasena`: sin token, pide el correo y responde "Si hay una cuenta con ese correo, te hemos enviado un enlace"; con el token, pide la contraseña nueva y lleva a "Entrar". `/jugadores/[username]`: el perfil público y una tabla por juego con jugadas, ganadas, perdidas y empatadas. En "Entrar" aparece el enlace "¿Olvidaste tu contraseña?". En la cabecera, el nombre lleva a `/cuenta`. Los nombres de los jugadores en las salas, las partidas y el historial llevan a su perfil | Cada cosa en un sitio previsible. Las estadísticas se ven desde donde se ve al rival | Tres páginas más |
| El perfil propio y el público en la misma página, editable cuando es el tuyo | Una página menos | Mezcla lo que ven todos con lo que solo ves tú, como el correo |

**Recomendación:** las tres páginas. No hay páginas de administración (U2).

### U10. Pruebas

| Opción | A favor | En contra |
|---|---|---|
| **Dos niveles.** (1) Pruebas del servidor, con la base de datos real como hasta ahora: cada operación nueva con sus casos de error; la sección 5 de la matriz de permisos completa (un jugador recibe `FORBIDDEN` y un anónimo `UNAUTHENTICATED` en cada operación de `/admin`); los efectos de suspender, cerrar una sala y anular una partida, con sus avisos en tiempo real; cada paso del catálogo con un juego de pruebas, incluidos `ENGINE_NOT_REGISTERED`, `GAME_VERSION_IS_CURRENT` y las salas de U5; las estadísticas al terminar, también con una jugada final repetida, y el relleno de la migración; y el ciclo de vida del enlace de recuperación con el tiempo controlado. (2) Cuatro pruebas en navegador, que recorren el criterio de U1: cuenta, recuperación, perfil con estadísticas y administración vista desde los navegadores de los jugadores | Se prueba el criterio tal como se describe. Lo que no se ve en un navegador, como una versión nueva, se prueba en el servidor | Unos 40 segundos más en el trabajo "Pruebas en navegador" |
| Solo pruebas del servidor | Rápidas | El criterio habla de lo que ve cada persona: salir al instante de todas las pestañas, ver la partida anulada |

**Recomendación:** los dos niveles.

---

## 9. Decisiones menores

| ID | Asunto | Recomendación | Alternativa |
|---|---|---|---|
| U11 | Registro de acciones de administración | Una línea en el registro de actividad del servidor por cada acción: quién, qué y sobre qué. Sin tabla. Si se guarda en la base de datos se decide en el Hito 7, como ya dice el backlog | Crear ya una tabla. Es una decisión de retención de datos que va con la política de borrado |
| U12 | El avatar | No se edita: el contrato no lo admite en `PATCH /me`, así que `avatarUrl` sigue vacío. Las páginas muestran la inicial del nombre | Cambiar el contrato para admitir una dirección o una imagen. Fuera del alcance |
| U13 | Nombre visible y biografía | El servidor recorta los espacios de los extremos, al editar y también al registrarse, que hoy no lo hace. Una biografía vacía se guarda como nula. Un nombre visible vacío tras recortar es `VALIDATION_ERROR` | Guardar lo que llega tal cual, como hoy el registro. Un nombre de solo espacios se vería en blanco |
| U14 | Limpieza de enlaces de recuperación | La tarea periódica que ya borra las sesiones caducadas borra también los enlaces caducados o usados | Conservarlos. No sirven para nada |
| U15 | Perfil de una cuenta suspendida | `GET /players/{username}` y sus estadísticas responden `PLAYER_NOT_FOUND`. La matriz de permisos dice que la suspensión es el remedio para un perfil inaceptable (P7), y eso exige dejar de mostrarlo. Su nombre sigue en las partidas pasadas | Mostrarlo igual. Un perfil inaceptable seguiría a la vista |
| U16 | Activar un juego sin versión vigente activa | Se permite, pero el juego no aparece en el catálogo público hasta tener una versión vigente activa con motor. La lista de administración lo deja ver. No hace falta un código de error nuevo | Rechazarlo con un código nuevo. Cambia el contrato |
| U17 | Orden y búsqueda en `/admin` | Cuentas: las más recientes primero, con cursor como el resto de listas; el nombre de usuario se busca por el principio sin distinguir mayúsculas, y el correo, exacto sin distinguirlas. Juegos: por nombre corto, y sus versiones de la más nueva a la más antigua | Otro orden |
| U18 | Correo simulado en producción | El servidor no arranca con `NODE_ENV=production` si el correo es el simulado, como ya pasa con la cookie sin `Secure`. El servicio real llega con el alojamiento | Arrancar con un aviso. Se podría publicar sin que nadie reciba los enlaces |

---

## 10. Huecos y contradicciones encontrados

| Hallazgo | Qué se propone |
|---|---|
| El Hito 6 no tiene criterio de aceptación | U1 |
| El alcance deja el panel visual fuera del MVP, y quien decide describió el 2026-11-16 la administración como un panel | U2. Se mantiene el alcance salvo decisión explícita |
| A5 dice que el rol se concede en la base de datos, pero no hay forma de hacerlo salvo con SQL | U3 |
| El contrato no dice qué pasa con las salas de una cuenta suspendida ni con las de un juego desactivado | U4 y U5 |
| Al empezar una partida, el servidor toma la versión vigente sin comprobar que el juego sigue activo ni que la versión admite las opciones de la sala. Con una versión incompatible, la sala fallaría con un error del servidor | U5 |
| La matriz de permisos cuenta con la suspensión para retirar un perfil inaceptable, pero el contrato no dice si el perfil de una cuenta suspendida se sigue mostrando | U15 |
| El contrato no tiene un código para activar un juego sin versión vigente | U16 |

Ninguno obliga a cambiar un contrato.

## 11. Lo que se comprobó antes de recomendar

| Comprobación | Resultado |
|---|---|
| Tipos del contrato | `packages/contracts` ya tiene los esquemas de las 14 operaciones, `AdminUser`, `AdminGame`, `PublicPlayer` y `PlayerGameStatistics`, y todos los códigos de error del hito |
| El rol y el estado en cada petición | La sesión lee la cuenta en cada petición: si está suspendida, borra la sesión y responde como a un anónimo; el rol sale de esa misma lectura |
| Inicio de partida | `startMatch` toma la versión con `is_current` sin mirar el estado del juego, y lanza un error si el motor rechaza las opciones de la sala (U5) |
| Anulación | Ya existe para el fallo técnico (K12), con la vuelta de la sala a la espera o su cierre y los avisos. La del administrador cambia solo el motivo |
| Contraseñas y tokens | Las contraseñas usan Argon2 de `node:crypto`, y los tokens de sesión, SHA-256. Nada nuevo que añadir |
| Correos | Se guardan en minúsculas, con una restricción en la base de datos, así que la búsqueda exacta sin distinguir mayúsculas es directa |
| Producción | La configuración ya se niega a arrancar en producción con la cookie sin `Secure`. U18 sigue el mismo patrón |

## 12. Supuestos que se comprueban al construir

Si alguno falla, se avisa antes de cambiar de opción.

| Supuesto | Si falla |
|---|---|
| La consulta de relleno de U8 da los mismos números que contar los resultados uno a uno | Se corrige la consulta. La prueba de la migración lo compara |
| Cerrar las conexiones de una cuenta suspendida activa el abandono en tiempo real como cualquier otra desconexión | Se marca la ausencia de forma explícita al suspender |
| Las pruebas en navegador pueden leer el buzón de archivos del servidor que arrancan | El buzón se coloca en una carpeta que indiquen las propias pruebas |

## 13. Lo que no se decide ahora

| Asunto | Cuándo |
|---|---|
| Panel visual de administración | Después del MVP (ADR-008, punto 16), salvo que se decida otra cosa en U2 |
| Tabla de acciones de administración y política de borrado | Hito 7 |
| Servicio real de correo y límites de frecuencia de la recuperación | Hito 7, con el alojamiento |
| Avatar editable | Cuando se decida cómo se guardan las imágenes |

## 14. Efecto sobre los documentos

Hechos al aceptarse las decisiones, salvo el backlog, que se marca al construir. Ninguno cambia un contrato.

| Documento | Cambio |
|---|---|
| `planning/backlog-mvp.md` | Se añade el criterio de aceptación de U1 |
| `planning/decisiones-y-pendientes.md` | Se cierra el pendiente de las estadísticas (K4) y se pone al día el índice |
| `docs/adr/0014-decisiones-del-hito-3.md` | Se anota en K4, con fecha, que las estadísticas las crea U8 |
| `docs/guia-administracion.md` | Nuevo, al construir (U2) |
| `docs/adr/README.md` | Se añade este ADR |
