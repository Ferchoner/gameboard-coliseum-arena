# Paso 5. Despliegue inicial y requisitos no funcionales

> **Documento histórico de análisis.** Se conserva como registro del razonamiento previo a la decisión. No se mantiene al día. La decisión vigente está en [ADR-005](../adr/0005-organizacion-del-repositorio.md) y [ADR-006](../adr/0006-renderizado-del-frontend.md) para lo ya decidido. Las decisiones de alojamiento siguen aplazadas.

**Estado:** parcialmente **[APLAZADO]** por decisión de Fernando el 2026-11-14 (UTC). Todo lo que sigue es análisis y recomendación.

> **Aplazamiento.** Fernando indicó que de momento se trabajará de forma local y que las decisiones de alojamiento se tomarán cuando haya algo construido que revisar.
>
> | Subdecisión | Situación |
> |---|---|
> | 5a. Alojamiento del backend | **Aplazada** |
> | 5b. PostgreSQL gestionado o autoadministrado | **Aplazada** |
> | 5c. Modo de renderizado del frontend | **[APROBADA]** el 2026-11-14 (UTC): renderizado en el navegador, con las páginas públicas pregeneradas |
> | 5d. Organización del repositorio | **[APROBADA]** el 2026-11-14 (UTC): un solo repositorio con espacios de trabajo. Ver `docs/adr/0005-organizacion-del-repositorio.md` |
> | 5e. Objetivos no funcionales | Aplazados los de disponibilidad y recuperación. Los de latencia y precisión del reloj se retoman al definir las pruebas |
> | 5f. Mínimo de operación | Aplazados copias de seguridad, supervisión y despliegue. Registros y comprobaciones de salud se retoman al iniciar el Hito 1 |
>
> **Lo que no se aplaza:** las restricciones de la sección 1 siguen vigentes, porque derivan de decisiones aprobadas. El entorno local debe reproducir el mismo modelo que producción: frontend y API en orígenes distintos del mismo sitio, con los orígenes permitidos como configuración. Así no habrá que rehacer nada al desplegar.
**Cierra:** pendientes P5 (despliegue) y P15 (requisitos no funcionales medibles), y los vacíos G-08 y G-09 de la auditoría.
**Alcance:** aquí se decide el *modelo* de despliegue, no el proveedor concreto. No comparo proveedores ni precios todavía; lo haré, con datos verificados, cuando el modelo esté elegido.

---

## 1. Lo que ya está fijado por las decisiones aprobadas

Estas restricciones no se discuten en este paso. Son consecuencia directa de lo aprobado.

| Restricción | Origen |
|---|---|
| El backend es un proceso Node.js 26 de larga duración, con conexiones WebSocket abiertas | ADR-001, ADR-003 |
| Una sola instancia de backend durante el MVP | Acuerdo B6; ADR-003, condición 5.7 (suscripciones en memoria) |
| El backend debe estar siempre en marcha para vigilar los relojes de las partidas | Requisito de reloj por jugador |
| Base de datos PostgreSQL | ADR-002 |
| Frontend y API en subdominios de un mismo dominio propio, cada uno en su alojamiento | ADR-004 |
| Todo el tráfico va cifrado, también el WebSocket | ADR-004 (cookie Secure); requisito de las PWA |
| La API acepta peticiones solo del origen del frontend | ADR-004, condiciones 5.3 a 5.5 |

**Consecuencia inmediata:** el backend no puede alojarse en un servicio de funciones sin servidor ni en uno que apague el proceso cuando no hay tráfico. Esos modelos no mantienen conexiones WebSocket abiertas, no conservan estado en memoria y no pueden vigilar relojes. El frontend sí puede alojarse en casi cualquier sitio.

## 2. Subdecisiones de este paso

Propongo resolverlas en este orden, una por una.

| # | Subdecisión | Recomendación preliminar |
|---|---|---|
| 5a | Modelo de alojamiento del backend | Plataforma gestionada de contenedores con proceso persistente |
| 5b | PostgreSQL gestionado o autoadministrado | Gestionado, en la misma región que el backend |
| 5c | Modo de renderizado del frontend | Aplicación estática renderizada en el navegador, con páginas públicas pregeneradas |
| 5d | Organización del repositorio | Un solo repositorio con espacios de trabajo separados para backend, frontend, contratos compartidos y motor |
| 5e | Objetivos no funcionales iniciales | Los de la sección 4 |
| 5f | Mínimo de operación: registros, comprobaciones de salud, copias de seguridad y despliegues | Los de la sección 5 |

### 5a. Modelo de alojamiento del backend

| Opción | Ventajas | Desventajas |
|---|---|---|
| **A. Plataforma gestionada de contenedores con proceso persistente** | Poca operación: despliegue desde el repositorio, certificados y dominio gestionados, reinicios automáticos. Admite WebSocket. Coste predecible a esta escala | Menos control. Hay que comprobar los límites de cada plataforma: tiempo máximo de conexión inactiva, política de reinicios y que no apague el proceso sin tráfico |
| **B. Servidor virtual administrado por ti** | Control total y normalmente el coste fijo más bajo. Sin límites impuestos sobre conexiones | Tú mantienes el sistema: parches de seguridad, certificados, cortafuegos, supervisión y reinicios. Más trabajo que no es producto |
| **C. Funciones sin servidor** | Ninguna para este backend | **No viable**, por lo explicado en la sección 1 |

**[RECOMENDACIÓN] Opción A.** Para un equipo pequeño, el tiempo dedicado a administrar un servidor es tiempo que no va al producto, y la arquitectura no necesita nada que una plataforma gestionada no ofrezca. La opción B es razonable si ya administras servidores con soltura o si el coste fijo es prioritario.

**Coste de reversión:** bajo. El backend se empaqueta como contenedor en ambos casos, así que pasar de una opción a la otra es sobre todo un cambio de configuración.

### 5b. PostgreSQL

| Opción | Ventajas | Desventajas |
|---|---|---|
| **A. Servicio gestionado** | Copias de seguridad automáticas, recuperación a un punto en el tiempo, actualizaciones y supervisión incluidas | Coste mensual propio. Hay que elegir la misma región que el backend |
| **B. En el mismo servidor que el backend** | Sin coste adicional y latencia mínima | Las copias de seguridad, su verificación y la recuperación son responsabilidad tuya. Un fallo del servidor afecta a todo |

**[RECOMENDACIÓN] Opción A.** La base de datos es la fuente de verdad de todas las partidas en curso. Perderla es el único fallo sin vuelta atrás.

### 5c. Modo de renderizado del frontend

| Opción | Ventajas | Desventajas |
|---|---|---|
| **A. Aplicación estática renderizada en el navegador**, con páginas públicas pregeneradas | Se aloja como archivos estáticos en cualquier sitio. La cookie de sesión puede quedar ligada solo a la API. Encaja de forma natural con una PWA. Sin servidor de frontend que mantener | Las páginas con contenido dinámico no se indexan igual de bien en buscadores, aunque las públicas pregeneradas sí |
| **B. Renderizado en servidor** | Mejor para buscadores y para la primera carga de páginas dinámicas | Añade un segundo servidor que mantener. Si renderiza páginas con sesión, la cookie debe compartirse entre subdominios, lo que amplía su alcance |

**[RECOMENDACIÓN] Opción A.** Un lobby y un tablero de juego son contenido personal y en tiempo real que no necesita indexarse. Las páginas públicas (portada, catálogo, reglas) pueden pregenerarse.

**Datos verificados el 2026-11-14 en el registro de npm:** la versión actual de Nuxt es la 4.6.4 y admite Node.js 26, la versión aprobada para el backend. Nuxt permite fijar el modo de renderizado por ruta, así que no es una elección de todo o nada: las páginas públicas pueden pregenerarse y las zonas con sesión renderizarse solo en el navegador.

**Efecto sobre ADR-004.** Con la opción A, la cookie de sesión puede quedar ligada únicamente a la API, que es el alcance más restringido. Con la opción B habría que compartirla entre subdominios para que el servidor del frontend la reciba.

### 5d. Organización del repositorio

| Opción | Ventajas | Desventajas |
|---|---|---|
| **A. Un solo repositorio con espacios de trabajo** | Los tipos de los contratos se comparten sin publicarlos. Un cambio de contrato actualiza backend y frontend en el mismo cambio. El motor puede ser un paquete aislado, lo que facilita verificar que no importa nada del framework | Configuración inicial algo más elaborada. Los despliegues deben distinguir qué parte cambió |
| **B. Dos repositorios** | Separación total y despliegues independientes por construcción | Los contratos compartidos hay que duplicarlos o publicarlos como paquete. Más fácil que backend y frontend se desincronicen |

**[RECOMENDACIÓN] Opción A.** Que backend y frontend se alojen por separado no obliga a separar el código. El repositorio actual ya es único.

**Relacionado: Paso 0, todavía pendiente.** La documentación sigue sin estar en el repositorio y falta ratificar la línea base de la auditoría (acuerdos B1 a B12). Propongo tratarlo junto con esta subdecisión, porque ambas definen cómo se organiza el repositorio.

## 3. Lo que este paso deja anotado para otros

| Cuestión | Paso |
|---|---|
| Qué ocurre con los relojes de las partidas en tiempo real durante un despliegue o una caída. El tiempo de inactividad del servidor no debería descontarse a los jugadores | 7 |
| Notificaciones push y envío de correo, que añadirían servicios externos | 6 |
| Prueba real del límite de 7 días de Safari sobre la cookie de sesión | Al tener un primer despliegue |

## 4. Objetivos no funcionales iniciales (5e)

**[RECOMENDACIÓN]** Son puntos de partida para un MVP en una sola instancia. No están medidos; sirven para tener algo contra lo que probar. Ajústalos a lo que esperas del producto.

| Atributo | Objetivo propuesto | Comentario |
|---|---|---|
| Conexiones simultáneas | 500 | Muy por debajo del límite de un proceso Node.js; es un objetivo de prueba, no un techo |
| Partidas en tiempo real simultáneas | 100 | |
| Partidas por turnos activas | 2.000 | Solo ocupan memoria mientras alguien las tiene abiertas |
| Confirmación de una jugada | Menos de 300 ms en el servidor para el 95 % de las jugadas | Sin contar el tiempo de red del jugador |
| Precisión del reloj en tiempo real | Vencimiento detectado en menos de 1 segundo | |
| Precisión del reloj por turnos | Vencimiento detectado en menos de 1 minuto | |
| Disponibilidad mensual | 99 % | Equivale a unas 7 horas de indisponibilidad al mes. Una sola instancia no permite prometer mucho más |
| Interrupción por despliegue | Menos de 1 minuto, con reconexión automática de los clientes | |
| Pérdida máxima de datos ante un desastre | 5 minutos | Requiere recuperación a un punto en el tiempo en PostgreSQL |
| Tiempo máximo de recuperación | 1 hora | |

## 5. Mínimo de operación (5f)

**[RECOMENDACIÓN]**

| Elemento | Mínimo propuesto |
|---|---|
| Registros | Estructurados, con un identificador de correlación por petición y por mensaje, sin datos personales ni credenciales |
| Comprobaciones de salud | Una que indique que el proceso responde y otra que indique que llega a la base de datos |
| Copias de seguridad | Automáticas diarias más recuperación a un punto en el tiempo, con una restauración de prueba antes del lanzamiento |
| Despliegue | Apagado ordenado: el servidor deja de aceptar conexiones, termina las jugadas en curso y cierra los WebSocket con un código que indica al cliente que reconecte |
| Supervisión | Una comprobación externa de disponibilidad con aviso |
| Integración continua | Pruebas automáticas en cada cambio antes de desplegar |

No propongo todavía herramientas concretas para ninguno de estos puntos. Cada una sería una dependencia nueva y se justificaría al iniciar el Hito 1.
