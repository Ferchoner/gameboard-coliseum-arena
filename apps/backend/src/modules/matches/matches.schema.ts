import {
  MATCH_ABORT_REASONS,
  MATCH_END_REASONS,
  MATCH_MODES,
  MATCH_STATUSES,
  SEAT_OUTCOMES,
  type TimeControl,
} from '@gameboard/contracts';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { gameVersions } from '../games/games.schema.js';
import { players } from '../players/players.schema.js';
import { rooms } from '../rooms/rooms.schema.js';

/**
 * Una partida: el registro de que se jugó, entre quiénes y cómo acabó
 * (modelo de datos, sección 3.4). Su estado vivo está en `game_sessions`.
 */
export const matches = pgTable(
  'matches',
  {
    /** El único identificador de partida que ven los clientes (ADR-011, 9.16). */
    id: uuid('id').primaryKey(),
    /** Una sala puede albergar varias partidas sucesivas (ADR-009, regla 7.11). */
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),
    /** Se fija al empezar y no cambia (regla 7.23). El juego se obtiene a través de la versión. */
    gameVersionId: uuid('game_version_id')
      .notNull()
      .references(() => gameVersions.id),
    /** Copia de la modalidad y del control de tiempo de la sala al empezar. */
    mode: text('mode', { enum: MATCH_MODES }).notNull(),
    timeControl: jsonb('time_control').$type<TimeControl>().notNull(),
    /**
     * Las opciones del juego tal como las devolvió su motor al empezar, y la
     * semilla con la que creó el estado inicial. Con ellas y el registro de
     * jugadas se puede volver a crear cualquier estado de la partida (ADR-018,
     * decisión Z1). La semilla es nula solo en las partidas empezadas antes
     * del 2026-11-19, que no la guardaron.
     */
    settings: jsonb('settings').$type<unknown>().notNull(),
    seed: text('seed'),
    status: text('status', { enum: MATCH_STATUSES }).notNull(),
    abortReason: text('abort_reason', { enum: MATCH_ABORT_REASONS }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    /** Instante en que terminó o se anuló. */
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    // Como mucho una partida en curso por sala.
    uniqueIndex('matches_room_in_progress_unique')
      .on(table.roomId)
      .where(sql`${table.status} = 'IN_PROGRESS'`),
    // Sirve también para alternar los asientos en la revancha.
    index('matches_room_started_at_idx').on(table.roomId, table.startedAt),
    check('matches_mode_valid', sql`${table.mode} in ('REALTIME', 'TURN_BASED')`),
    check('matches_status_valid', sql`${table.status} in ('IN_PROGRESS', 'FINISHED', 'ABORTED')`),
    check('matches_abort_reason_valid', sql`${table.abortReason} in ('ADMIN', 'FAILURE')`),
    // El motivo de anulación tiene valor si y solo si la partida está anulada.
    check(
      'matches_abort_consistent',
      sql`(${table.status} = 'ABORTED') = (${table.abortReason} is not null)`,
    ),
    // La fecha de final tiene valor si y solo si la partida ya no está en curso.
    check(
      'matches_ended_consistent',
      sql`(${table.status} = 'IN_PROGRESS') = (${table.endedAt} is null)`,
    ),
  ],
);

/** Quién jugó una partida y en qué asiento. No cambia una vez empezada. */
export const matchPlayers = pgTable(
  'match_players',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id),
    /** Asiento, empezando en 0. Lo reparte la plataforma al empezar (ADR-011, 9.19). */
    seat: smallint('seat').notNull(),
  },
  (table) => [
    primaryKey({ name: 'match_players_pk', columns: [table.matchId, table.playerId] }),
    // Un asiento por jugador y un jugador por asiento.
    uniqueIndex('match_players_match_seat_unique').on(table.matchId, table.seat),
    // Para el historial y para "mis partidas en curso".
    index('match_players_player_match_idx').on(table.playerId, table.matchId),
    check('match_players_seat_valid', sql`${table.seat} >= 0`),
  ],
);

/** El resultado de una partida terminada. Una partida admite uno solo (ADR-010, regla 8.15). */
export const matchResults = pgTable(
  'match_results',
  {
    matchId: uuid('match_id')
      .primaryKey()
      .references(() => matches.id),
    reason: text('reason', { enum: MATCH_END_REASONS }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      'match_results_reason_valid',
      sql`${table.reason} in ('COMPLETED', 'TIMEOUT', 'RESIGNATION', 'ABANDONMENT')`,
    ),
  ],
);

/** El resultado de cada participante. Lo da siempre el motor (ADR-009, regla 7.17). */
export const playerResults = pgTable(
  'player_results',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matchResults.matchId),
    playerId: uuid('player_id').notNull(),
    outcome: text('outcome', { enum: SEAT_OUTCOMES }).notNull(),
    /** Puntos, para los juegos que los tengan. */
    score: integer('score'),
  },
  (table) => [
    primaryKey({ name: 'player_results_pk', columns: [table.matchId, table.playerId] }),
    // Solo un participante puede tener resultado.
    foreignKey({
      name: 'player_results_match_player_fk',
      columns: [table.matchId, table.playerId],
      foreignColumns: [matchPlayers.matchId, matchPlayers.playerId],
    }),
    index('player_results_player_id_idx').on(table.playerId),
    check('player_results_outcome_valid', sql`${table.outcome} in ('WIN', 'LOSS', 'DRAW')`),
  ],
);
