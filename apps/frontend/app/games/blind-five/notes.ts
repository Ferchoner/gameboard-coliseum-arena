/**
 * Las marcas de la hoja de deducción (ADR-022, decisión CA16). Son del
 * jugador, no del juego: se guardan solo en su navegador, por partida y
 * asiento, y el servidor no las conoce. Si el navegador no deja guardar,
 * la hoja funciona igual y las marcas se pierden al cerrar la página.
 */

/** Lo que el jugador marcó en un número. */
export type NoteMark = 'CROSSED' | 'POSSIBLE';

export type Notes = Readonly<Record<number, NoteMark>>;

const PREFIX = 'blind-five:notes:';

/** El siguiente estado de una marca al tocarla: nada, descartado, posible y vuelta a empezar. */
export function cycleMark(mark: NoteMark | undefined): NoteMark | undefined {
  if (mark === undefined) return 'CROSSED';
  return mark === 'CROSSED' ? 'POSSIBLE' : undefined;
}

export function toggled(notes: Notes, number: number): Notes {
  const mark = cycleMark(notes[number]);
  const rest = Object.entries(notes).filter(([key]) => Number(key) !== number);
  return Object.fromEntries(mark === undefined ? rest : [...rest, [number, mark]]) as Notes;
}

/**
 * La clave de una partida. El tablero no recibe el identificador de la
 * partida, así que se usa lo que la distingue desde el principio: las cinco
 * fichas que se pusieron boca arriba al empezar, y el asiento.
 */
export function notesKey(firstFaceUp: readonly number[], seat: number): string {
  return `${PREFIX}${firstFaceUp.slice(0, 5).join('-')}:${seat}`;
}

export function parseNotes(text: string | null): Notes {
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
    const notes: Record<number, NoteMark> = {};
    for (const [key, mark] of Object.entries(value)) {
      const number = Number(key);
      if (Number.isInteger(number) && number >= 1 && number <= 60) {
        if (mark === 'CROSSED' || mark === 'POSSIBLE') notes[number] = mark;
      }
    }
    return notes;
  } catch {
    return {};
  }
}

export function loadNotes(key: string): Notes {
  try {
    return parseNotes(globalThis.localStorage?.getItem(key) ?? null);
  } catch {
    return {};
  }
}

export function saveNotes(key: string, notes: Notes): void {
  try {
    if (Object.keys(notes).length === 0) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, JSON.stringify(notes));
  } catch {
    // Sin almacenamiento, las marcas viven solo mientras la página está abierta.
  }
}

/**
 * Lo que está a la vista de quien mira y por eso se tacha solo: los atriles
 * de los demás y todo lo que ha estado boca arriba. No deduce nada más: eso
 * es el juego.
 */
export function seenNumbers(
  stands: readonly (readonly { readonly number: number | null }[])[],
  revealed: readonly number[],
): Set<number> {
  const seen = new Set<number>(revealed);
  for (const stand of stands) {
    for (const tile of stand) if (tile.number !== null) seen.add(tile.number);
  }
  return seen;
}

/** Comprueba una cantada antes de enviarla: cinco números distintos del 1 al 60, de menor a mayor. */
export function validDeclaration(numbers: readonly number[]): boolean {
  return (
    numbers.length === 5 &&
    numbers.every((one) => Number.isInteger(one) && one >= 1 && one <= 60) &&
    numbers.every((one, index) => index === 0 || (numbers[index - 1] as number) < one)
  );
}
