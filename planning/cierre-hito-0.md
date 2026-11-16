# Revisión de cierre del Hito 0

| Campo | Valor |
|---|---|
| **Fecha** | 2026-11-16 |
| **Qué es** | La comprobación de que la arquitectura quedó decidida y la documentación es coherente, antes de pedir la autorización para implementar |
| **Parte de** | La auditoría inicial, en [`docs/auditoria/`](../docs/auditoria/README.md) |

---

## 1. Resultado

**El Hito 0 está completo.** Los 22 hallazgos de inconsistencia de la auditoría están cerrados. De los 15 pendientes de decisión, 12 están cerrados, 1 lo está en parte y 2 están aplazados por decisión expresa. Ninguno de los asuntos que siguen abiertos impide empezar a implementar.

Quedan tres cosas que no dependen de este documento:

1. **Fusionar la pull request.** Hasta entonces la rama principal solo contiene la licencia.
2. **Autorizar la implementación.** No se ha escrito ni se escribirá código sin esa autorización.
3. **Confirmar dos propuestas al empezar el Hito 1**, porque el primer trabajo depende de ellas: los nombres de las carpetas (ADR-005) y el alcance de la cookie de sesión (ADR-004).

---

## 2. Qué se comprobó

| Comprobación | Cómo | Resultado |
|---|---|---|
| Los archivos de tipos del motor y del protocolo son válidos | Compilación con TypeScript en modo estricto, junto con bocetos de uso y los ejemplos del protocolo | Sin errores |
| El archivo de la API es válido | Validador automático de OpenAPI 3.1 | Sin errores |
| Los valores enumerados coinciden en el modelo de datos, la API, el protocolo y el motor | Comparación de las diez listas | Coinciden |
| Las vistas de sala, partida y resumen de partida tienen los mismos campos en la API y en el protocolo | Comparación automática de las seis formas | Coinciden |
| El catálogo de errores contiene los códigos de los tres contratos, con el mismo estado HTTP y canal | Comparación automática | Coinciden. La lista cerrada del archivo OpenAPI es la del catálogo |
| La matriz de permisos cubre todas las operaciones | Comparación automática con las 28 operaciones y las 6 órdenes | Completa |
| Toda regla, decisión, condición o punto citado existe | Búsqueda automática de las citas en todos los documentos | Ninguna cita rota |
| Las reglas citadas en los documentos nuevos dicen lo que se les atribuye | Lectura, cita por cita | Correctas |
| Todos los enlaces entre documentos funcionan, también los que apuntan a una sección | Comprobación automática | Ninguno roto |
| Los cuatro diagramas son válidos | Se dibujaron | Válidos |
| No quedan términos retirados fuera de las tablas de cambios | Búsqueda de los términos retirados de la documentación inicial | Ninguno |
| Cada cambio que un ADR pedía a un documento está hecho | Repaso de las tablas "Efecto sobre los documentos" de los ADR | Hechos. Una diferencia anotada en la sección 6 |

Las comprobaciones cubren la coherencia de la documentación. No prueban que el diseño funcione: eso lo validará el corte vertical.

---

## 3. Hallazgos de inconsistencia

| ID | Hallazgo | Cómo quedó | Dónde |
|---|---|---|---|
| C-01 | Clasificación y estadísticas, dentro o fuera del MVP | Estadísticas básicas dentro; puntuación y clasificación, después | ADR-008, puntos 13 y 14 |
| C-02 | Administración declarada y ausente | Administración mínima por API, con rol y ocho operaciones | ADR-008, punto 15; API; matriz de permisos |
| C-03 | `/auth/refresh` presuponía una decisión | Sesión de servidor con cookie. La operación desaparece | ADR-004; API |
| C-04 | Entrar y salir de sala, duplicados | La API cambia las salas; el WebSocket solo suscribe | Protocolo, decisión T1 |
| C-05 | `gameId` con tres significados | Nombre corto hacia fuera, UUID dentro de la base de datos | ADR-011, convención 9.5 |
| C-06 | Quién fija la versión del juego | La partida toma la versión vigente al empezar | ADR-011, convención 9.8 |
| C-07 | Cuatro conceptos llamados "versión" | Cuatro nombres distintos | ADR-011, convención 9.10 |
| C-08 | Tabla de eventos sin propósito | Sustituida por el registro de jugadas | ADR-010, regla 8.2 |
| C-09 | Idempotencia sin soporte en los datos | El identificador de petición vive en el registro de jugadas | ADR-010, reglas 8.12 y 8.13 |
| C-10 | Un snapshot o un historial | Un único snapshot que se sobrescribe | ADR-010, regla 8.1 |
| C-11 | Mensajes de pausa para un estado opcional | Sin pausas en el MVP | ADR-009, regla 7.6; protocolo |
| C-12 | Resultados que no nacen del motor | El motor determina siempre el resultado; la capa de sesión añade el motivo | ADR-009, regla 7.17; contrato del motor |
| C-13 | Qué dispara el inicio de la partida | Empieza sola | ADR-009, reglas 7.9, 7.10 y 7.31 |
| C-14 | Nota obsoleta sobre el motor | Retirada. El motor es de funciones puras | Contrato del motor |
| C-15 | Redundancias en el contrato del motor | Siete operaciones sin solapes, con asientos | Contrato del motor, decisiones M1 a M11 |
| C-16 | Mensajes redundantes o sin dirección | Seis órdenes y once notificaciones, sin nombres compartidos | Protocolo |
| C-17 | Términos con varios significados | Glosario con un significado por término | ADR-011, sección 6 |
| C-18 | Identificadores que no eran UUID | Todos los ejemplos usan UUID | ADR-011, convención 9.4 |
| C-19 | El diagrama ponía la base de datos bajo el motor | Diagrama nuevo. El motor no tiene flechas de salida | `docs/02-arquitectura.md`, sección 3 |
| C-20 | Referencias a material inexistente | Retiradas. Los diagramas existen. La documentación está en la pull request, pendiente de fusionar | `README.md`; backlog |
| C-21 | Tres nombres públicos | Dos: nombre de usuario y nombre visible | ADR-011, convención 9.12 |
| C-22 | Acuerdos redactados como propuestas | Ratificados como decisiones | ADR-007, acuerdos B5 y B9 |

---

## 4. Vacíos

| ID | Vacío | Cómo quedó | Dónde |
|---|---|---|---|
| G-01 | Lenguaje y entorno del backend | TypeScript sobre Node.js 26 | ADR-001 |
| G-02 | Verificación de correo, recuperación de contraseña y política de contraseñas | Recuperación dentro; verificación después. Longitud y hash definidos | ADR-008, puntos 17 y 18; ADR-004, condición 5.9; API, decisión A14 |
| G-03 | Roles y permisos | Dos roles y una matriz por operación | ADR-011, convención 9.15; matriz de permisos |
| G-04 | Catálogo de errores | Una lista única de 41 códigos | Catálogo de errores |
| G-05 | Presencia frente a pertenencia | Son cosas distintas, con reglas para cada modalidad | ADR-009, reglas 7.24 a 7.27 |
| G-06 | Aleatoriedad | La semilla la da siempre la plataforma | Contrato del motor |
| G-07 | Capacidad de la sala | La declara el motor y la plataforma valida contra ello | ADR-011, convención 9.9; modelo de datos, decisión R1 |
| G-08 | Decisiones sin requisitos medibles | **Aplazado**, junto con el alojamiento | Sección 6 |
| G-09 | Organización del repositorio | Un repositorio con espacios de trabajo. El gestor de paquetes se elige al iniciar el Hito 1 | ADR-005; ADR-006 |
| G-10 | Inicio de partida y validación de opciones | Inicio automático. El motor valida las opciones | ADR-009; contrato del motor |

---

## 5. Efectos de las dos modalidades

El requisito de jugar en tiempo real y por turnos llegó después de la auditoría y tuvo ocho efectos.

| ID | Efecto | Cómo quedó | Dónde |
|---|---|---|---|
| R-1 | La memoria pasa a ser una caché | La base de datos es la fuente de verdad | ADR-007, acuerdo B6; ADR-009, regla 7.22 |
| R-2 | Los plazos deben guardarse | Relojes y fecha límite en la sesión de juego, con una revisión periódica | ADR-010, reglas 8.4 y 8.17 |
| R-3 | Resultado por tiempo agotado | El motor retira el asiento y da el resultado | ADR-009, reglas 7.17 y 7.18 |
| R-4 | Aviso de turno a quien no está conectado | Dentro de la aplicación en el MVP; por notificación push después | ADR-008, puntos 10 y 12 |
| R-5 | Versiones del motor en partidas largas | La versión se conserva hasta que la partida termina | ADR-009, regla 7.23 |
| R-6 | Varias partidas a la vez | Hasta 20 por turnos y una en tiempo real, con la lista de "mis partidas" | ADR-009, regla 7.30; API |
| R-7 | Presencia distinta de abandono | Por turnos no hay abandono por desconexión | ADR-009, regla 7.27 |
| R-8 | Capacidad medida en partidas activas | **Aplazado**, junto con el alojamiento | Sección 6 |

Los quince pendientes de decisión, con su situación, están en [`decisiones-y-pendientes.md`](decisiones-y-pendientes.md), sección 2.

---

## 6. Lo que no está cerrado

| Asunto | Situación | ¿Impide empezar? |
|---|---|---|
| Alojamiento, copias de seguridad, supervisión y requisitos medibles | Aplazado por decisión expresa. Se trabaja en local | No |
| Derechos de arte y selección de los siguientes juegos | Se trata al elegir el segundo juego | No |
| Nombres de las carpetas de los espacios de trabajo | Propuesta sin confirmar desde ADR-005 | Hay que confirmarla al empezar el Hito 1 |
| Cookie de sesión ligada solo al host de la API | Propuesta sin confirmar desde ADR-004 | Hay que confirmarla al implementar la autenticación, en el Hito 1 |
| Reparto del resto del MVP en hitos (B1) | Propuesta. Se decide al terminar el corte vertical | No |
| Decisiones de arranque: gestor de paquetes, librería de validación, versión de Drizzle y otras | Aplazadas a propósito al inicio del Hito 1 | No. Son el primer paso del Hito 1 |

El resto de asuntos abiertos, ordenados por cuándo toca resolverlos, está en [`decisiones-y-pendientes.md`](decisiones-y-pendientes.md), sección 5.

**Una diferencia respecto a un ADR, ya aceptada.** ADR-008 pedía mantener la ruta `/players/me/statistics`. La API la sustituyó por `/players/{username}/statistics`, que sirve para las estadísticas propias y para las de otro jugador. El cambio figura en las notas de la API y se aceptó con ella.

---

## 7. Correcciones hechas durante la revisión

| Corrección | Documento |
|---|---|
| El recuento de tablas decía 16 y son 17. Las tablas no cambian | Modelo de datos, sección 3 |
| La operación de registro no mencionaba que también crea la sesión de autenticación, como fija la decisión A6 de la API | Modelo de datos, sección 6 |

Ninguna cambia una decisión.

---

## 8. Qué se pide

La autorización para empezar a implementar. La recomendación es autorizar **solo el Hito 1**, la base de la plataforma, y seguir como hasta ahora: un paso cada vez, con revisión antes del siguiente.

El Hito 1 empezaría por las decisiones de arranque, que se presentarían con alternativas y recomendación antes de escribir código:

1. Nombres de las carpetas y gestor de paquetes.
2. Herramienta que comprueba el aislamiento del motor.
3. Librería de validación de datos de entrada.
4. Versión de Drizzle y controlador de PostgreSQL.
5. Gestión de sesiones propia o con librería, y alcance de la cookie.
6. Estado del Argon2id incorporado en Node.js 26.

Conviene fusionar antes la pull request de la documentación, para que el código vaya en una pull request aparte.
