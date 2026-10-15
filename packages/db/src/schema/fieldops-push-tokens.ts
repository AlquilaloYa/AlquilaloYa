import { index, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

export const fieldopsPushTokens = pgTable(
  "fieldops_push_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    platform: varchar("platform", { length: 20 }).notNull().default("android"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("fieldops_push_tokens_token_key").on(table.token),
    index("fieldops_push_tokens_user_id_idx").on(table.userId),
  ],
);
