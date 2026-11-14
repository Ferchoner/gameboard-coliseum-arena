# Visión, alcance y criterios

## Objetivo
Plataforma web de juegos de mesa donde personas puedan registrarse, gestionar su perfil, explorar juegos, crear/unirse a salas y disputar partidas en línea. Se contempla juego individual y multijugador como visión de producto; **el primer corte vertical validará multijugador por turnos de dos personas**.

## Principios
- Backend/API primero, frontend consumidor de contratos.
- Plataforma y reglas de cada juego separadas.
- Servidor autoritativo: cliente envía intenciones, servidor valida y aplica.
- Monolito modular para MVP; no microservicios prematuros.
- Juegos extensibles por contrato, sin acoplamiento a transporte, persistencia o interfaz.
- Navegador como plataforma inicial; PWA opcional.

## MVP propuesto
Autenticación, usuarios/perfiles/jugadores, catálogo, salas públicas, ingreso/salida, ready, partida, sesión, WebSocket, motor de juego, Connect Four, resultado/historial y administración básica. Recuperación de sesión y protección contra doble ejecución son requisitos técnicos.

## Posterior al MVP
Matchmaking, rankings/rating avanzado, estadísticas completas, amigos, invitaciones, logros, torneos, espectadores, monetización. El ranking básico puede implementarse después del vertical slice, sin impedir persistir resultados desde el inicio.

## Frontend
Nuxt + Vue + TypeScript como opción preferida por experiencia previa; Phaser + TypeScript como opción para renderizar juegos, **no obligatorio para todos los tableros**. La lógica autoritativa permanece en backend.

## No objetivos inmediatos
Aplicaciones nativas, microservicios, infraestructura multinodo, múltiples juegos en paralelo durante el primer slice, economía/monetización.
