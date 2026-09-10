import {
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Token de Google Calendar vinculado a UN usuario (agenda personal).
 * accessToken/refreshToken se guardan CIFRADOS (AES-256-GCM, mismo cifrador
 * que las credenciales de conectores). Clave: el email de la sesion.
 */
export const userGoogleTokens = pgTable(
  "user_google_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes").notNull().default(""),
    calendarId: varchar("calendar_id", { length: 255 }).notNull().default("primary"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("user_google_tokens_email_unique").on(table.email)]
);

export type UserGoogleTokenRow = typeof userGoogleTokens.$inferSelect;
export type NewUserGoogleTokenRow = typeof userGoogleTokens.$inferInsert;