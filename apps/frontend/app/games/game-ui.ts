import type { GameEventView, MatchPlayerView } from '@gameboard/contracts';
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
 * Lo que recibe todo tablero (ADR-018, decisión Z7). Un tablero solo dibuja
 * lo que envía el servidor y emite `play` con la acción que la persona
 * elige: no decide si una jugada es válida (ADR-014, decisión K7). Para
 * colorear un asiento usa la clase `seat-N`, que fija `--seat-color`.
 */
export interface BoardProps<TView = unknown> {
  /** Lo que el servidor deja ver a este asiento. */
  readonly view: TView;
  /** El asiento de quien mira. */
  readonly yourSeat: number;
  /** Los asientos que pueden jugar ahora. */
  readonly activeSeats: readonly number[];
  readonly players: readonly MatchPlayerView[];
  /** Los eventos de juego del último cambio, si llegó en vivo; vacía al cargar la página. */
  readonly events: readonly GameEventView[];
  /** La versión del juego de la partida. */
  readonly gameVersion: string;
  /** Si a quien mira le toca y puede jugar ahora mismo. */
  readonly canPlay: boolean;
  /**
   * Si quien mira puede enviar ahora una jugada aunque no le toque: la
   * partida está en curso, no se ha retirado, hay conexión y no espera
   * otra respuesta. Solo la usan los juegos con jugadas fuera de turno
   * (ADR-022, decisión CA19); los demás tableros emiten solo con `canPlay`.
   */
  readonly canSend: boolean;
}

/** Lo que la aplicación necesita para mostrar un juego. */
export interface GameUi extends GameTexts {
  /** El tablero, que recibe `BoardProps` y emite `play`. Se carga cuando hace falta. */
  readonly board: Component;
}
