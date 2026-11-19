# Visión, alcance y criterios

| Campo | Valor |
|---|---|
| **Estado** | Versión 1 |
| **Sustituye a** | El documento de visión inicial |
| **Recoge** | ADR-006 (frontend), ADR-007 (línea base) y ADR-008 (alcance del MVP) |

Este documento resume decisiones ya aceptadas y no toma ninguna nueva. Donde discrepe de un ADR, vale el ADR.

---

## 1. Objetivo

Una plataforma web de juegos de mesa donde las personas se registran, gestionan su perfil, exploran un catálogo de juegos, crean salas o entran en ellas, y juegan partidas en línea contra otras personas.

El primer juego es **Cuatro en raya**, para dos jugadores (ADR-008, sección 4). Sirve para validar la arquitectura. La plataforma se diseña desde el principio para alojar más juegos, también de más de dos jugadores o con jugadas simultáneas, sin cambiar sus contratos.

---

## 2. Dos modalidades de partida

Toda partida tiene un reloj con un tiempo total por jugador para todas sus jugadas (ADR-009, reglas 7.1 a 7.7).

| Modalidad | Cómo se juega | Reloj por jugador |
|---|---|---|
| **Tiempo real** | Los jugadores están conectados a la vez | Hasta 30 minutos |
| **Por turnos** | Cada jugador entra cuando puede y hace su jugada | 12, 24 o 36 horas |

Quien crea la sala elige la modalidad y el control de tiempo entre los que el juego admite.

---

## 3. Principios

| Principio | Significado | Origen |
|---|---|---|
| Servidor con autoridad | El cliente envía intenciones. El servidor valida, aplica y guarda | Instrucciones del proyecto |
| Plataforma y juegos separados | La plataforma no conoce las reglas de ningún juego, y un motor de juego no conoce la red, la base de datos ni las cuentas | ADR-007, acuerdo B2 |
| Monolito modular | Un solo servidor con módulos de límites claros. Sin microservicios | Instrucciones del proyecto |
| Contratos primero | La API y el protocolo se definen antes que la interfaz, y el frontend los consume | ADR-007, acuerdo B10 |
| La base de datos es la verdad | PostgreSQL es la fuente de verdad de toda partida. No hay copia en memoria del estado de una partida: cada jugada lo lee de la base de datos | ADR-007, acuerdo B6; ADR-014, K2 |
| La identidad sale de la sesión | El servidor nunca acepta un identificador de jugador enviado por el cliente como prueba de identidad | ADR-007, acuerdo B11 |
| Juegos extensibles por contrato | Añadir un juego es añadir un motor que cumple el contrato. No se toca la plataforma | Contrato del motor |

---

## 4. Alcance del MVP

El alcance tiene tres niveles (ADR-008). La tabla completa, con el motivo de cada punto, está en el ADR.

### Corte vertical

Lo mínimo para jugar una partida completa de principio a fin y validar la arquitectura.

- Registro, inicio y cierre de sesión.
- Cuenta, perfil y jugador básicos.
- Catálogo de juegos.
- Salas públicas: crear, listar, entrar, salir y marcarse listo.
- Partida en tiempo real de Cuatro en raya, con reloj.
- Resultado e historial de partidas.

### Resto del MVP

Lo que se añade sobre el corte vertical antes de dar el MVP por terminado.

- Reconexión y recuperación tras un reinicio del servidor.
- Partida por turnos.
- Lista de "mis partidas en curso", que indica en cuáles te toca.
- Aviso de turno dentro de la aplicación.
- Aplicación instalable como PWA.
- Estadísticas básicas por juego: jugadas, ganadas, perdidas y empatadas.
- Administración mínima por API: suspender y reactivar cuentas, cerrar una sala, anular una partida, y activar o desactivar juegos y versiones.
- Recuperación de contraseña por correo.

### Posterior al MVP

La arquitectura no debe impedirlo, pero no se diseña en detalle ahora.

- Aviso de turno por notificación push. Es la primera ampliación prevista.
- Puntuación y clasificación.
- Panel visual de administración.
- Verificación de la dirección de correo y acceso con cuentas externas.
- Bots y juego en solitario.
- Salas privadas, invitaciones, amigos, emparejamiento automático, espectadores, torneos y monetización.

---

## 5. Frontend

| Asunto | Decisión | Origen |
|---|---|---|
| Tecnología | Nuxt, Vue y TypeScript | ADR-007, acuerdo B9 |
| Renderizado | Aplicación renderizada en el navegador. Las páginas públicas se pregeneran al construir. No hay servidor de frontend | ADR-006 |
| Dibujo de los tableros | Se decide juego por juego. Phaser no es obligatorio | ADR-007, acuerdo B9 |
| Alojamiento | Separado del backend, en un subdominio del mismo dominio | ADR-004 |
| Reglas del juego | Las aplica siempre el servidor. El frontend solo muestra | Instrucciones del proyecto |

---

## 6. Fuera de los objetivos inmediatos

- Aplicaciones nativas.
- Microservicios e infraestructura con varias instancias. El MVP funciona con una sola instancia del servidor, sin Redis (ADR-007, acuerdo B7).
- Varios juegos en paralelo durante el corte vertical.
- Economía y monetización.

---

## 7. Lo que sigue sin decidir

| Asunto | Estado |
|---|---|
| Alojamiento del backend y de la base de datos, copias de seguridad y supervisión | Aplazado hasta que haya algo construido que revisar. Mientras tanto se trabaja en local |
| Requisitos medibles de capacidad, latencia y disponibilidad | Aplazados junto con el alojamiento |
| Derechos de arte y selección de los siguientes juegos | Se trata cuando se elija el segundo juego (ADR-008, sección 4) |

El resto de asuntos abiertos está reunido en [`planning/decisiones-y-pendientes.md`](../planning/decisiones-y-pendientes.md).
