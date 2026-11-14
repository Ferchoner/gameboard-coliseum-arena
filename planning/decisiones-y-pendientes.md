# Registro de decisiones y preguntas abiertas

## Acordado conceptualmente
- Backend modular monolítico, API REST + canal realtime WebSocket.
- Motor server-authoritative, desacoplado de red, UI y persistencia.
- Juegos registrados por ID y versión.
- Room, Match y GameSession son conceptos distintos.
- PostgreSQL como almacenamiento persistente propuesto; estado activo en memoria y snapshots transaccionales.
- Redis opcional para evolución.
- Connect Four como primer slice de validación.
- Nuxt/Vue/TypeScript preferido en frontend; Phaser opcional según juego.

## Pendientes de decisión formal (ADR)
1. Framework backend: NestJS, Fastify directo u otro; evaluar mantenibilidad y WebSocket.
2. ORM/query builder: Prisma, Drizzle, TypeORM u otro.
3. Autenticación: cookies/sesiones o tokens; CSRF, rotación, expiración y WebSocket.
4. Transporte realtime: WebSocket nativo, Socket.IO u otro; semántica de ACK y reconexión.
5. Modelo de despliegue inicial: hosting, dominio, TLS, PostgreSQL, backups y observabilidad.
6. Reutilización de Room después de Match y política de rematches.
7. Estados y permisos exactos de salas, partidas y sesiones.
8. Eventos persistidos, retención y replay; no asumir event sourcing.
9. Timeout, abandono, desconexión y recuperación.
10. Ranking: si entra al MVP y algoritmo.
11. Soporte para bots/solitario: alcance y modelo de participantes.
12. Licencias, derechos de arte y selección de juegos que puedan distribuirse.
13. Seguridad de acciones, rate limits, prevención de trampas y protección de información oculta.
14. Consistencia de proyecciones estadísticas y resultados bajo reintentos.
15. Requisitos no funcionales medibles: concurrencia, latencia, disponibilidad y capacidad.

## Inconsistencias de ejemplos anteriores que deben normalizarse
- El campo `playerId` apareció en mensajes entrantes: no confiar en él.
- Se usaron `version` y `gameVersion` con significados distintos: estandarizar.
- Los ejemplos `GameState` muestran datos internos completos: filtrar vistas por jugador.
- La interfaz del motor incluye métodos `initialize/getState`; preferir funciones puras o decidir ciclo de vida antes de implementar.
- Se mencionó persistir cada jugada y también eventos selectivos: snapshot por jugada confirmada, log de eventos opcional.

## Política de colaboración con IA
No inventar decisiones cerradas. Registrar propuestas con alternativas, consecuencias y recomendación. Solicitar aprobación antes de introducir dependencias, cambiar contratos o implementar funcionalidades fuera del slice.
