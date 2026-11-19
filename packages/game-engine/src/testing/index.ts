/**
 * Entrada de pruebas del paquete: un motor de pruebas y la comprobación
 * común de las reglas del contrato (ADR-018, decisión Z3). No la importa el
 * código de producción.
 */
export { createFakeEngine } from './fake-engine.js';
export { checkEngineConformance, type ConformanceFixture } from './conformance.js';
