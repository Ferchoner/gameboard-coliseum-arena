/**
 * Los textos de Cinco a ciegas. Cada juego tiene los suyos en su carpeta
 * (ADR-018, decisión Z7). El nombre del juego en que se inspira no aparece
 * en la aplicación (ADR-022, CA1).
 */
export const blindFiveStrings = {
  seats: ['Asiento 1', 'Asiento 2', 'Asiento 3', 'Asiento 4'],
  /** Cada palo, por su figura: es lo que se lee en pantalla y dice el lector (CA3). */
  suits: {
    S1: 'círculo',
    S2: 'triángulo',
    S3: 'cuadrado',
    S4: 'rombo',
    S5: 'estrella',
  },
  dots: (dots: number) => (dots === 1 ? '1 punto' : `${dots} puntos`),
  tile: (number: number, suit: string, dots: string) => `${number}, ${suit}, ${dots}`,
  hiddenTile: (position: number, suit: string) => `Tu ficha ${position}: ${suit}, número oculto`,
  you: 'Tú',
  yourStand: 'Tu atril',
  yourStandHint: 'Ves el palo de tus fichas, de menor a mayor, pero no su número.',
  rivalStand: (name: string) => `Atril de ${name}`,
  out: {
    WRONG_DECLARATION: 'falló',
    RETIRED: 'se retiró',
  },
  youOut: 'Fallaste. La partida sigue sin ti; ya puedes ver tus números.',
  turn: 'juega',
  step: {
    REVEAL: 'Te toca: revela una ficha del palo que quieras.',
    CLUE: 'Ahora elige una ficha boca arriba y pide una pista.',
    DECLARE_ONLY: 'No quedan fichas: solo puedes cantar tus cinco.',
  },
  waiting: 'Puedes cantar tus cinco en cualquier momento, aunque no te toque.',
  faceUp: 'Fichas boca arriba',
  reveal: 'Revelar',
  revealSuit: (suit: string, left: number) =>
    left === 1 ? `Revelar ${suit}: queda 1` : `Revelar ${suit}: quedan ${left}`,
  supplyLeft: (count: number) =>
    count === 0
      ? 'Pozo vacío'
      : count === 1
        ? 'Queda 1 ficha boca abajo'
        : `Quedan ${count} fichas boca abajo`,
  chosen: (tile: string) => `Pista sobre ${tile}:`,
  sort: 'Dónde cae en mi atril',
  compareWith: (position: number) => `¿Mismos puntos que mi ficha ${position}?`,
  cancel: 'Cancelar',
  clues: 'Pistas',
  slot: (slot: number) =>
    slot === 0
      ? 'antes de la primera'
      : slot === 5
        ? 'después de la quinta'
        : `entre la ${slot}.ª y la ${slot + 1}.ª`,
  sortClue: (tile: number, where: string) => `${tile} cae ${where}`,
  compareClue: (tile: number, position: number, same: boolean) =>
    same
      ? `${tile}: mismos puntos que la ${position}.ª`
      : `${tile}: distintos puntos que la ${position}.ª`,
  declare: {
    open: 'Cantar mis cinco',
    title: 'Tus cinco números, de menor a mayor',
    number: (position: number) => `Número ${position}`,
    warning: 'Solo tienes un intento. Si fallas, quedas fuera.',
    confirm: 'Cantar',
    cancel: 'Cancelar',
    invalid: 'Escribe cinco números distintos del 1 al 60, de menor a mayor.',
  },
  declarations: 'Intentos',
  declared: (name: string, numbers: string, correct: boolean) =>
    correct ? `${name} cantó ${numbers} y acertó.` : `${name} cantó ${numbers} y falló.`,
  sheet: {
    title: 'Hoja de deducción',
    hint: 'Se tacha sola lo que ves. Toca un número para descartarlo o marcarlo como posible.',
    seen: 'a la vista',
    crossed: 'descartado',
    possible: 'posible',
    clear: 'Borrar mis marcas',
  },
  /** El aviso neutro sobre el origen, sin la marca (decidido el 2026-11-20; ADR-022, CA1). */
  credit:
    'Inspirado en un juego de mesa comercial. Si te gusta, apoya a sus autores comprando el original.',
  end: {
    guessed: 'Acertó sus cinco números.',
    lastStanding: 'Fue el último en juego.',
  },
  rejections: {
    MALFORMED_ACTION: 'Esa jugada no es válida.',
    WRONG_STEP: 'Ahora no toca eso: primero revela una ficha y después pide la pista.',
    SUIT_EXHAUSTED: 'No quedan fichas boca abajo de ese palo.',
    TILE_NOT_FACE_UP: 'Esa ficha ya no está boca arriba.',
    POSITION_OUT_OF_RANGE: 'Elige una de tus cinco fichas.',
    INVALID_DECLARATION: 'Escribe cinco números distintos del 1 al 60, de menor a mayor.',
    MUST_DECLARE: 'Ya no quedan fichas: solo puedes cantar.',
  },
} as const;
