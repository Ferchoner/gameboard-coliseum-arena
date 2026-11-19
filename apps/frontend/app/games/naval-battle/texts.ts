/**
 * Los textos de Batalla naval. Cada juego tiene los suyos en su carpeta
 * (ADR-018, decisión Z7).
 */
export const navalBattleStrings = {
  seats: ['Flota roja', 'Flota amarilla'],
  ships: {
    S5: 'Portaaviones',
    S4: 'Acorazado',
    S3A: 'Crucero',
    S3B: 'Submarino',
    S2: 'Destructor',
  },
  rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
  cellName: (row: string, col: number) => `${row}${col}`,
  ownGrid: 'Tu flota',
  rivalGrid: 'Flota rival',
  placement: {
    title: 'Coloca tu flota',
    help: 'Elige un barco, gíralo si quieres y toca la casilla donde empieza. Los barcos no pueden tocarse, ni en diagonal.',
    shipSize: (size: number) => `${size} casillas`,
    rotate: (horizontal: boolean) => (horizontal ? 'Girar: en horizontal' : 'Girar: en vertical'),
    random: 'Colocar al azar',
    clear: 'Quitar todos',
    ready: 'Listo',
    placeAt: (ship: string, cell: string) => `Colocar ${ship} en ${cell}`,
    waiting: 'Flota colocada. Esperando a que el rival coloque la suya.',
    rivalPlaced: 'El rival ya colocó su flota.',
  },
  firing: {
    fireAt: (cell: string) => `Disparar a ${cell}`,
    remaining: (count: number) =>
      count === 1 ? 'Le queda 1 barco a flote.' : `Le quedan ${count} barcos a flote.`,
  },
  shot: {
    MISS: 'agua',
    HIT: 'tocado',
    SUNK: 'hundido',
  },
  end: {
    sunkAll: 'Hundió toda la flota rival.',
  },
  rejections: {
    MALFORMED_ACTION: 'Esa jugada no es válida.',
    WRONG_PHASE: 'Ahora no se puede hacer eso.',
    INVALID_FLEET: 'La flota tiene que llevar los cinco barcos, una vez cada uno.',
    SHIP_OUT_OF_BOUNDS: 'Un barco se sale de la cuadrícula.',
    SHIPS_OVERLAP: 'Dos barcos ocupan la misma casilla.',
    SHIPS_TOUCHING: 'Dos barcos se tocan. Tienen que quedar separados, también en diagonal.',
    CELL_OUT_OF_RANGE: 'Esa casilla no existe.',
    CELL_ALREADY_FIRED: 'Ya disparaste a esa casilla.',
  },
} as const;
