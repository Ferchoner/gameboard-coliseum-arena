import { sql } from 'drizzle-orm';
import { check, integer, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { games } from '../games/games.schema.js';
import { players } from '../players/players.schema.js';

/**
 * Estadísticas básicas de un jugador en un juego (modelo de datos, sección
 * 3.6). Suman todas las modalidades y versiones del juego. Se ponen al día
 * en la transacción del final de partida (ADR-010, regla 8.15; ADR-017, U8).
 */
export const gameStatistics = pgTable(
  'game_statistics',
  {
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    played: integer('played').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    losses: integer('losses').notNull().default(0),
    draws: integer('draws').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.playerId, table.gameId] }),
    check(
      'game_statistics_played_is_sum',
      sql`${table.played} = ${table.wins} + ${table.losses} + ${table.draws}`,
    ),
    check(
      'game_statistics_counts_not_negative',
      sql`${table.wins} >= 0 and ${table.losses} >= 0 and ${table.draws} >= 0`,
    ),
  ],
);
