import { USER_ROLES, USER_STATUSES } from '@gameboard/contracts';
import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/** La cuenta: credenciales, estado y rol (modelo de datos, sección 3.1). */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    /** Se guarda en minúsculas. */
    email: text('email').notNull(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: USER_ROLES }).notNull().default('USER'),
    status: text('status', { enum: USER_STATUSES }).notNull().default('ACTIVE'),
    /** Reservado. La verificación de correo es posterior al MVP. */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
    // El nombre de usuario es único sin distinguir mayúsculas de minúsculas.
    uniqueIndex('users_username_unique').on(sql`lower(${table.username})`),
    check('users_email_lowercase', sql`${table.email} = lower(${table.email})`),
    check('users_role_valid', sql`${table.role} in ('USER', 'ADMIN')`),
    check('users_status_valid', sql`${table.status} in ('ACTIVE', 'SUSPENDED')`),
  ],
);
