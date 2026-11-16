/**
 * Reparte los asientos de una partida que empieza (ADR-014, decisión K11).
 * Devuelve el jugador de cada asiento: la posición en la lista es el asiento.
 *
 * En la primera partida de una sala, los asientos se sortean. En la
 * revancha con los mismos jugadores, cada uno pasa al asiento siguiente,
 * de modo que quien empezó no vuelve a empezar. Si algún jugador cambió,
 * se sortea de nuevo.
 */
export function assignSeats(
  playerIds: readonly string[],
  previousSeats: readonly string[] | null,
  shuffle: <T>(items: readonly T[]) => T[],
): string[] {
  if (previousSeats && haveSameMembers(previousSeats, playerIds)) {
    const count = previousSeats.length;
    return previousSeats.map((_, seat) => previousSeats[(seat - 1 + count) % count] as string);
  }
  return shuffle(playerIds);
}

function haveSameMembers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((one) => b.includes(one));
}
