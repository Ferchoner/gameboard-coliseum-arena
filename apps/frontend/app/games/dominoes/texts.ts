/**
 * Los textos del Dominó. Cada juego tiene los suyos en su carpeta (ADR-018,
 * decisión Z7).
 */
export const dominoesStrings = {
  seats: ['Asiento 1', 'Asiento 2', 'Asiento 3', 'Asiento 4'],
  teams: ['Pareja A', 'Pareja B'],
  tile: (a: number, b: number) => `Ficha ${a} y ${b}`,
  line: 'Línea de fichas',
  emptyLine: 'Todavía no hay fichas en la mesa.',
  yourHand: 'Tu mano',
  playAt: (tile: string, end: 'LEFT' | 'RIGHT') =>
    end === 'LEFT' ? `${tile} a la izquierda` : `${tile} a la derecha`,
  ends: { LEFT: 'A la izquierda', RIGHT: 'A la derecha' },
  chooseEnd: (tile: string) => `${tile} cabe en los dos extremos. ¿Dónde la pones?`,
  cancel: 'Cancelar',
  handNumber: (number: number, target: number) => `Mano ${number} · a ${target} puntos`,
  boneyard: (count: number) =>
    count === 0
      ? 'Pozo vacío'
      : count === 1
        ? 'Queda 1 ficha en el pozo'
        : `Quedan ${count} fichas en el pozo`,
  tiles: (count: number) => (count === 1 ? '1 ficha' : `${count} fichas`),
  points: (points: number) => (points === 1 ? '1 punto' : `${points} puntos`),
  partner: 'tu pareja',
  you: 'Tú',
  retired: 'se retiró',
  turn: 'juega',
  noPlayable: 'No te toca.',
  scoreboard: 'Puntos',
  events: {
    drew: (name: string, count: number, you: boolean) => {
      const tiles = count === 1 ? '1 ficha' : `${count} fichas`;
      return you ? `Robaste ${tiles}.` : `${name} robó ${tiles}.`;
    },
    passed: (name: string, you: boolean) => (you ? 'Pasaste.' : `${name} pasó.`),
  },
  lastHand: {
    title: (number: number) => `Mano ${number}`,
    DOMINO: (name: string, points: string, you: boolean) =>
      you
        ? `Te quedaste sin fichas y anotaste ${points}.`
        : `${name} se quedó sin fichas y anotó ${points}.`,
    BLOCKED: (name: string, points: string, you: boolean) =>
      you
        ? `Tranque. Sumabas menos y anotaste ${points}.`
        : `Tranque. ${name} sumaba menos y anotó ${points}.`,
    BLOCKED_TIE: 'Tranque empatado. Nadie anota.',
    left: 'Fichas que quedaban',
    none: 'ninguna',
  },
  end: {
    reached: 'Llegó a 100 puntos.',
  },
  rejections: {
    MALFORMED_ACTION: 'Esa jugada no es válida.',
    TILE_NOT_IN_HAND: 'Esa ficha no está en tu mano.',
    WRONG_OPENING_TILE: 'En la primera mano hay que salir con el doble más alto.',
    TILE_DOES_NOT_FIT: 'Esa ficha no casa con ese extremo.',
    END_REQUIRED: 'Esa ficha cabe en los dos extremos: elige en cuál.',
  },
} as const;
