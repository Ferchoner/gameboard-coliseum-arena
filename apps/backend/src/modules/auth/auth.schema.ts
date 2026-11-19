import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema.js';

/**
 * Sesiones de autenticación (modelo de datos, sección 3.1). El valor de la
 * cookie no se guarda: solo su hash (ADR-004, condición 5.1).
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull(),
    /** Caducidad por inactividad. Se renueva con el uso. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Tope que la renovación no puede superar. */
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('auth_sessions_token_hash_unique').on(table.tokenHash),
    index('auth_sessions_user_id_idx').on(table.userId),
    index('auth_sessions_expires_at_idx').on(table.expiresAt),
  ],
);

/**
 * Enlaces de recuperación de la contraseña (modelo de datos, sección 3.1;
 * ADR-017, U7). El token que va en el enlace no se guarda: solo su hash.
 */
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Un token usado no vuelve a servir. */
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('password_reset_tokens_token_hash_unique').on(table.tokenHash),
    index('password_reset_tokens_user_id_idx').on(table.userId),
  ],
);
