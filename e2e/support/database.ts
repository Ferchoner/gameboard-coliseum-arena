import pg from 'pg';
import { DATABASE_URL } from './settings.mjs';

/**
 * Deja sin tiempo a quien tiene el turno en una partida: retrasa diez
 * minutos el inicio de su turno, como si llevara ese tiempo pensando. Es la
 * única forma de ver una partida terminar por tiempo sin esperar los
 * minutos enteros del reloj. Lo demás lo hace el servidor por su cuenta.
 */
export async function runOutTheClock(matchId: string): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `update game_sessions
          set turn_started_at = turn_started_at - interval '10 minutes',
              turn_deadline_at = turn_deadline_at - interval '10 minutes'
        where match_id = $1 and status = 'ACTIVE'`,
      [matchId],
    );
    if (result.rowCount !== 1) throw new Error(`No hay una partida en curso con id ${matchId}`);
  } finally {
    await client.end();
  }
}
