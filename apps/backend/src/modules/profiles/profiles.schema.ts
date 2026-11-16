import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../users/users.schema.js';

/** El perfil: cómo se presenta la persona (modelo de datos, sección 3.1). */
export const profiles = pgTable('profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  /** El nombre que se muestra. No es único. */
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  biography: text('biography'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
