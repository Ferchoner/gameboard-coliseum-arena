/**
 * Los textos de Cuatro en raya. Cada juego tiene los suyos en su carpeta
 * (ADR-018, decisión Z7).
 */
export const fourInARowStrings = {
  seats: ['Rojas', 'Amarillas'],
  dropIn: (column: number) => `Soltar ficha en la columna ${column}`,
  columnState: (tokens: number, capacity: number) => `${tokens} de ${capacity} fichas`,
  end: {
    line: 'Cuatro en línea.',
    full: 'El tablero se llenó sin cuatro en línea.',
  },
  rejections: {
    MALFORMED_ACTION: 'Esa jugada no es válida.',
    COLUMN_OUT_OF_RANGE: 'Esa columna no existe.',
    COLUMN_FULL: 'Esa columna está llena.',
  },
} as const;
