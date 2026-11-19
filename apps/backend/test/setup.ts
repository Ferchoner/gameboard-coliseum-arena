import 'reflect-metadata';
import { afterAll } from 'vitest';
import { saveSeenResponses } from './contract.js';

// Anota qué respuestas del contrato ha visto este archivo de pruebas, para el
// informe del final (análisis del 2026-11-19, T-02).
afterAll(() => {
  saveSeenResponses();
});
