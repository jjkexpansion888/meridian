import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  data: text("data").notNull(),
  revision: integer("revision").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});
