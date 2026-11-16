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
import { matches, matchPlayers } from '../matches/matches.schema.js';

export const GAME_SESSION_STATUSES = ['ACTIVE', 'CLOSED'] as const;
export type GameSessionStatus = (typeof GAME_SESSION_STATUSES)[number];

/** Tiempo que le queda a cada asiento, en milisegundos, con el asiento como clave. */
export type StoredClocks = Readonly<Record<string, number>>;

/**
 * La sesión de juego: el estado vivo de una partida (modelo de datos,
 * sección 3.5). Hay exactamente una por partida y se crea con ella. Es un
 * concepto interno del servidor: los clientes solo conocen la partida
 * (ADR-011, 9.16).
 */
export const gameSessions = pgTable(
  'game_sessions',
  {
    matchId: uuid('match_id')
      .primaryKey()
      .references(() => matches.id),
    status: text('status', { enum: GAME_SESSION_STATUSES }).notNull(),
    /**
     * El snapshot: el estado del juego tal como lo serializa el motor. Hay
     * uno solo, que se sobrescribe con cada jugada, y es la fuente de
     * verdad (ADR-010, reglas 8.1 y 8.3).
     */
    state: jsonb('state').$type<unknown>().notNull(),
    /** Contador de cambios. Empieza en 0 y sube con cada jugada y con cada retirada. */
    stateVersion: integer('state_version').notNull(),
    /** Asientos que pueden jugar ahora: sus relojes son los que corren. Vacía si está cerrada. */
    activeSeats: smallint('active_seats').array().notNull(),
    /** Tiempo restante de cada asiento, medido en `turnStartedAt` (regla 8.4). */
    clocks: jsonb('clocks').$type<StoredClocks>().notNull(),
    /** Instante en que se midieron los relojes. Desde entonces corren los de los asientos activos. */
    turnStartedAt: timestamp('turn_started_at', { withTimezone: true }),
    /** Instante en que se agota el primer reloj de los asientos activos si nadie juega. */
    turnDeadlineAt: timestamp('turn_deadline_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // Para la revisión periódica de relojes vencidos (regla 8.17).
    index('game_sessions_active_deadline_idx')
      .on(table.turnDeadlineAt)
      .where(sql`${table.status} = 'ACTIVE'`),
    check('game_sessions_status_valid', sql`${table.status} in ('ACTIVE', 'CLOSED')`),
    check('game_sessions_state_version_valid', sql`${table.stateVersion} >= 0`),
    // Una sesión activa siempre tiene a alguien que puede jugar y una fecha límite.
    check(
      'game_sessions_active_has_deadline',
      sql`${table.status} <> 'ACTIVE' or (${table.turnStartedAt} is not null and ${table.turnDeadlineAt} is not null)`,
    ),
  ],
);

/**
 * El registro de jugadas: cada jugada aceptada, como una fila que solo se
 * añade (ADR-010, regla 8.2). El estado nunca se reconstruye a partir de
 * este registro (regla 8.3).
 */
export const matchActions = pgTable(
  'match_actions',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id),
    /** Número de orden, desde 1. Coincide con el `stateVersion` que resultó de la jugada. */
    sequence: integer('sequence').notNull(),
    playerId: uuid('player_id').notNull(),
    /** Identificador de petición generado por el cliente (regla 8.12). */
    requestId: uuid('request_id').notNull(),
    /** La acción, tal como la aceptó el motor. */
    action: jsonb('action').$type<unknown>().notNull(),
    /** Tiempo que le quedaba a quien jugó, una vez confirmada la jugada. */
    clockRemainingMs: integer('clock_remaining_ms').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ name: 'match_actions_pk', columns: [table.matchId, table.sequence] }),
    // Impide aplicar dos veces la misma petición (reglas 8.12 y 8.13).
    uniqueIndex('match_actions_request_unique').on(table.matchId, table.playerId, table.requestId),
    // Solo un participante puede tener jugadas.
    foreignKey({
      name: 'match_actions_match_player_fk',
      columns: [table.matchId, table.playerId],
      foreignColumns: [matchPlayers.matchId, matchPlayers.playerId],
    }),
    check('match_actions_sequence_valid', sql`${table.sequence} >= 1`),
  ],
);

/**
 * La anotación de actividad del servidor: una sola fila, con `id` 1
 * (modelo de datos, sección 3.7). El servidor anota cada pocos segundos
 * que sigue en marcha, y otra vez al apagarse en orden, para saber al
 * arrancar cuánto tiempo estuvo parado (ADR-010, regla 8.18; ADR-015,
 * decisión V4).
 */
export const serverLiveness = pgTable(
  'server_liveness',
  {
    id: smallint('id').primaryKey(),
    /** Último arranque. */
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    /** Última anotación. */
    lastAliveAt: timestamp('last_alive_at', { withTimezone: true }).notNull(),
  },
  (table) => [check('server_liveness_single_row', sql`${table.id} = 1`)],
);
