# ADR-005: Un solo repositorio con espacios de trabajo

| Campo | Valor |
|---|---|
| **Estado** | Aceptada |
| **Fecha** | 2026-11-14 |
| **Decidida por** | Fernando Hernandez Argueta |
| **Cierra** | Parte del vacío G-09 de la auditoría (organización del repositorio y forma de compartir tipos) |
| **Depende de** | ADR-001 (NestJS sobre Node.js y TypeScript) |
| **Relacionados** | ADR-003 (WebSocket nativo), ADR-004 (autenticación) |

## 1. Contexto

- Backend y frontend son aplicaciones distintas que se alojarán por separado.
- Ambas están en TypeScript y se comunican mediante contratos: la API REST y el protocolo de tiempo real.
- Está aprobado que el motor de juego sea TypeScript puro, sin importar NestJS, el ORM ni el transporte, con verificación automática (ADR-001, condición 5.5).
- El repositorio actual es único y contiene solo la licencia.

## 2. Decisión

El código vive en **un solo repositorio con espacios de trabajo**. Backend, frontend, contratos compartidos y motor de juego son paquetes separados dentro de él.

Cada paquete es un proyecto independiente, con sus propias dependencias y su propio proceso de construcción. Las dos aplicaciones se construyen y se despliegan por separado.

## 3. Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| Dos repositorios | Los contratos compartidos habría que duplicarlos o publicarlos como paquete versionado. Cada cambio de contrato serían dos pasos coordinados, con más riesgo de que backend y frontend se desincronicen |
| Aplazar la decisión | La organización condiciona el primer cambio que se haga en el repositorio |

## 4. Consecuencias

**Positivas**
- El contrato existe una sola vez. Un cambio en un mensaje o en un tipo de la API se detecta al compilar en ambos lados.
- El motor, como paquete que no declara dependencias de framework, cumple su regla de aislamiento por construcción.
- Un cambio que afecta a contrato, backend y frontend se revisa como una sola unidad.

**Negativas**
- Configuración inicial algo más elaborada.
- La integración continua y los despliegues deben distinguir qué parte cambió.

**Coste de reversión:** bajo. Extraer un paquete a su propio repositorio más adelante es sencillo.

## 5. Estructura propuesta

Los nombres de carpeta son una **propuesta pendiente de confirmación**. La decisión aceptada es la separación en cuatro paquetes, no sus nombres.

| Carpeta | Contenido | Puede depender de |
|---|---|---|
| `apps/backend` | Aplicación NestJS con los módulos de `docs/02` | `packages/contracts`, `packages/game-engine` |
| `apps/frontend` | Aplicación Nuxt | `packages/contracts` |
| `packages/contracts` | Tipos de la API REST y del protocolo de tiempo real | Nada del proyecto |
| `packages/game-engine` | Contrato del motor y motores concretos, en TypeScript puro | Nada del proyecto |
| `docs/` | Documentación de arquitectura y ADRs | |

**Regla de dependencias propuesta:** las flechas van solo de `apps/` hacia `packages/`. Ningún paquete de `packages/` depende de una aplicación, y `game-engine` no depende de `contracts`.

**Quedan fuera de este ADR, para el inicio del Hito 1:**
- Gestor de paquetes y herramienta de orquestación de tareas.
- Si el frontend usará el paquete del motor para mostrar jugadas válidas sin duplicar reglas. El servidor seguiría siendo la única autoridad.
- Herramienta que verifica la regla de dependencias.

## 6. Referencias

- `docs/auditoria/despliegue-y-requisitos.md`, subdecisión 5d.
- `docs/02-arquitectura.md` § Estructura orientativa y § Dependencias y límites.
