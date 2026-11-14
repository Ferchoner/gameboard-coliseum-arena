# Plataforma de Juegos de Mesa en Línea — Paquete de transferencia a IA

**Estado:** arquitectura conceptual avanzada; implementación aún no iniciada en este proyecto.  
**Fecha de corte:** 2026-11-13.  
**Propósito:** entregar contexto consistente a Claude Code, Claude Web u otra IA para continuar el diseño y posteriormente implementar un MVP.

## Orden de lectura
1. `docs/01-vision-alcance.md`
2. `docs/02-arquitectura.md`
3. `docs/03-dominio-datos.md`
4. `docs/04-flujos-y-persistencia.md`
5. `contracts/01-rest-api.md`
6. `contracts/02-realtime.md`
7. `contracts/03-game-engine.ts`
8. `planning/decisiones-y-pendientes.md`
9. `planning/backlog-mvp.md`
10. `prompts/CLAUDE-CODE.md` o `prompts/CLAUDE-WEB.md`

## Advertencias
- Los ejemplos JSON y TypeScript son **contratos preliminares**, no implementaciones verificadas.
- No hay selección definitiva de framework backend, ORM, autenticación, despliegue o algoritmo de rating.
- El primer juego de referencia es Connect Four (Cuatro en raya), usado para validar la arquitectura; no implica que otros juegos estén implementados.
- El proyecto es independiente del e-commerce y PAC-BIG-MAN; no asumir que se comparten repositorios, bases de datos o servicios.
- Antes de escribir código, reconciliar discrepancias entre ejemplos y fijar decisiones pendientes mediante ADR.

## Uso rápido
Copiar esta carpeta al repositorio nuevo. En Claude Code abrir `prompts/CLAUDE-CODE.md` y solicitar la fase de auditoría/decisiones. En Claude Web cargar los documentos y usar `prompts/CLAUDE-WEB.md`.
