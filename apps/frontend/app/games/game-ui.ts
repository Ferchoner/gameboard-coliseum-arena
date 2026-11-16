import type { Component } from 'vue';

/** Los textos de un juego: lo que la aplicación dice de él sin dibujar nada. */
export interface GameTexts {
  /** Cómo se llama cada asiento en este juego, por ejemplo el color de sus fichas. */
  readonly seatNames: readonly string[];
  /** Cómo terminó el juego, visto en el tablero final. `null` si no hay nada que añadir. */
  endText(view: unknown): string | null;
  /** El texto de cada motivo con el que el juego rechaza una jugada. */
  readonly rejections: Readonly<Record<string, string>>;
}

/**
 * Lo que la aplicación necesita para mostrar un juego. El tablero recibe
 * `view`, lo que el servidor deja ver a ese asiento, y `canPlay`; y emite
 * `play` con la acción que la persona elige.
 */
export interface GameUi extends GameTexts {
  readonly board: Component;
}
