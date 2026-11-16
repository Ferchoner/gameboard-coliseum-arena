import {
  MATCH_MODES,
  ROOM_CLOSE_REASONS,
  ROOM_STATUSES,
  type TimeControl,
} from '@gameboard/contracts';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { games } from '../games/games.schema.js';
import { players } from '../players/players.schema.js';

/**
 * Una sala: donde los jugadores se reúnen antes de una partida y entre
 * partidas sucesivas (modelo de datos, sección 3.3).
 */
export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey(),
    /** La sala no guarda versión: cada partida toma la vigente al empezar (ADR-011, 9.8). */
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id),
    /** El anfitrión. */
    ownerPlayerId: uuid('owner_player_id')
      .notNull()
      .references(() => players.id),
    /** No cambia una vez creada la sala (ADR-009, regla 7.1). */
    mode: text('mode', { enum: MATCH_MODES }).notNull(),
    timeControl: jsonb('time_control').$type<TimeControl>().notNull(),
    maxPlayers: smallint('max_players').notNull(),
    /** Si la sala vuelve a la espera al terminar una partida (reglas 7.11 y 7.31). */
    rematchEnabled: boolean('rematch_enabled').notNull(),
    /** Opciones propias del juego, ya validadas por su motor. */
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull(),
    status: text('status', { enum: ROOM_STATUSES }).notNull(),
    closeReason: text('close_reason', { enum: ROOM_CLOSE_REASONS }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    /** Última vez que alguien entró, salió o se marcó listo, o que terminó una partida (regla 7.14). */
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    index('rooms_game_status_mode_idx').on(table.gameId, table.status, table.mode),
    // Para la revisión de salas inactivas.
    index('rooms_waiting_last_activity_idx')
      .on(table.lastActivityAt)
      .where(sql`${table.status} = 'WAITING'`),
    check('rooms_mode_valid', sql`${table.mode} in ('REALTIME', 'TURN_BASED')`),
    check('rooms_status_valid', sql`${table.status} in ('WAITING', 'IN_MATCH', 'CLOSED')`),
    check(
      'rooms_close_reason_valid',
      sql`${table.closeReason} in ('OWNER_LEFT', 'IDLE', 'MATCH_ENDED', 'ADMIN')`,
    ),
    check('rooms_max_players_positive', sql`${table.maxPlayers} >= 1`),
    // El motivo y la fecha de cierre tienen valor si y solo si la sala está cerrada.
    check(
      'rooms_closed_consistent',
      sql`(${table.status} = 'CLOSED') = (${table.closeReason} is not null) and (${table.status} = 'CLOSED') = (${table.closedAt} is not null)`,
    ),
  ],
);

/**
 * Pertenencia a una sala. Contiene solo los miembros actuales: al salir,
 * la fila se borra (modelo de datos, decisión R4). El anfitrión también
 * tiene la suya.
 */
export const roomPlayers = pgTable(
  'room_players',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    /** Marca de "listo". Se limpia al terminar cada partida (regla 7.11). */
    isReady: boolean('is_ready').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ name: 'room_players_pk', columns: [table.roomId, table.playerId] }),
    index('room_players_player_id_idx').on(table.playerId),
  ],
);
