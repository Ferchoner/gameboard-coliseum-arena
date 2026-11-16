import { CATALOG_STATUSES } from '@gameboard/contracts';
import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** Un juego del catálogo (modelo de datos, sección 3.2). */
export const games = pgTable(
  'games',
  {
    /** El `gameId` interno. Hacia fuera el juego se identifica por `slug` (ADR-011, 9.5). */
    id: uuid('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status', { enum: CATALOG_STATUSES }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('games_slug_unique').on(table.slug),
    check('games_status_valid', sql`${table.status} in ('ACTIVE', 'INACTIVE')`),
  ],
);

/**
 * Una versión de las reglas de un juego. El número de jugadores y los
 * controles de tiempo no se guardan aquí: los declara el motor (decisión R1).
 */
export const gameVersions = pgTable(
  'game_versions',
  {
    id: uuid('id').primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    /** Versión semántica de las reglas, por ejemplo `1.0.0` (ADR-011, 9.7). */
    version: text('version').notNull(),
    status: text('status', { enum: CATALOG_STATUSES }).notNull(),
    /** La versión vigente es la que toman las partidas nuevas (ADR-011, 9.8). */
    isCurrent: boolean('is_current').notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('game_versions_game_version_unique').on(table.gameId, table.version),
    // Como mucho una versión vigente por juego.
    uniqueIndex('game_versions_current_unique')
      .on(table.gameId)
      .where(sql`${table.isCurrent}`),
    check('game_versions_status_valid', sql`${table.status} in ('ACTIVE', 'INACTIVE')`),
    // La versión vigente debe estar activa.
    check(
      'game_versions_current_is_active',
      sql`not ${table.isCurrent} or ${table.status} = 'ACTIVE'`,
    ),
  ],
);
