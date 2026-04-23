import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const reviews = sqliteTable("reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clientName: text("client_name").notNull(),
  clientEmail: text("client_email").notNull(),
  formType: text("form_type").notNull(),
  fileName: text("file_name").notNull(),
  reviewDate: text("review_date").notNull(),
  status: text("status").notNull(), // pass | fail
  gapCount: integer("gap_count").notNull().default(0),
  gapsJson: text("gaps_json").notNull().default("[]"),
  emailDraftJson: text("email_draft_json").notNull().default("{}"),
  emailSent: integer("email_sent", { mode: "boolean" }).notNull().default(false),
  emailSentDate: text("email_sent_date"),
  notes: text("notes"),
});

export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;
