import { randomBytes, randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';

/**
 * El azar de la plataforma: el sorteo de asientos y la semilla que recibe
 * el motor (ADR-014, decisión K11). Se inyecta para que las pruebas puedan
 * fijarlo. El motor nunca genera azar por su cuenta.
 */
@Injectable()
export class Randomness {
  /** Una copia de la lista en un orden al azar. */
  shuffle<T>(items: readonly T[]): T[] {
    const shuffled = [...items];
    for (let last = shuffled.length - 1; last > 0; last -= 1) {
      const other = randomInt(last + 1);
      [shuffled[last], shuffled[other]] = [shuffled[other] as T, shuffled[last] as T];
    }
    return shuffled;
  }

  /** Una semilla de 128 bits al azar, en hexadecimal. */
  seed(): string {
    return randomBytes(16).toString('hex');
  }
}
