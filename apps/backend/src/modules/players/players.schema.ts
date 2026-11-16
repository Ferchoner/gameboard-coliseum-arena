import { pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema.js';

/**
 * El jugador: la identidad que participa en salas y partidas (modelo de
 * datos, sección 3.1). `user_id` admite nulo para no cerrar la puerta a
 * jugadores sin cuenta, como los bots (ADR-011, convención 9.14).
 */
export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex('players_user_id_unique').on(table.userId)],
);
