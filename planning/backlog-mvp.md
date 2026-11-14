# Backlog inicial por hitos

## Hito 0 — Decisiones y contratos
- [ ] ADR stack backend, ORM, auth, realtime.
- [ ] Diagramas C4 y ER revisados.
- [ ] OpenAPI v1 y protocolo realtime v1 validados.
- [ ] Contrato GameEngine y serialización aprobado.
- [ ] Matriz de permisos, errores y estados.

## Hito 1 — Base plataforma
- [ ] Proyecto backend, migraciones, health checks, logging, tests.
- [ ] Auth, User, Profile, Player.
- [ ] Catálogo Game y GameVersion.
- [ ] Frontend mínimo login/lobby.

## Hito 2 — Salas y tiempo real
- [ ] Crear/listar/unirse/salir de sala.
- [ ] WebSocket autenticado, ready, estado de sala.
- [ ] Validaciones de capacidad y concurrencia.

## Hito 3 — Vertical slice Connect Four
- [ ] Motor puro con tests de reglas.
- [ ] Crear Match y GameSession de forma atómica.
- [ ] Acciones con idempotencia, versionado y snapshots.
- [ ] Vista de juego y sincronización de dos clientes.
- [ ] Finalización, resultados e historial.

## Hito 4 — Resiliencia y entrega
- [ ] Reconexión tras pérdida de red.
- [ ] Recuperación tras reinicio del proceso.
- [ ] Pruebas e2e de partida completa y acciones inválidas.
- [ ] Seguridad, rate limits, backups, monitoreo y guía de despliegue.

## Criterios de aceptación del slice
Dos usuarios independientes pueden registrarse, ingresar a una misma sala, iniciar Connect Four, alternar jugadas válidas, rechazar acciones fuera de turno, terminar una partida y consultar su resultado. Un reintento con el mismo requestId no duplica la jugada. Un reinicio después de una jugada confirmada permite restaurar el estado. Un cliente no puede suplantar otro playerId.
