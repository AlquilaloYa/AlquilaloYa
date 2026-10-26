import {
  boolean,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const issueTypes = pgTable(
  "issue_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 80 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("issue_types_name_unique").on(table.name),
    index("issue_types_active_order_idx").on(table.isActive, table.displayOrder),
  ],
);

export type IssueTypeRow = typeof issueTypes.$inferSelect;
