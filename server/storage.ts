import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { reviews, type Review, type InsertReview } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

const sqlite = new Database("qc_reviews.db");
const db = drizzle(sqlite);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    form_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    review_date TEXT NOT NULL,
    status TEXT NOT NULL,
    gap_count INTEGER NOT NULL DEFAULT 0,
    gaps_json TEXT NOT NULL DEFAULT '[]',
    email_draft_json TEXT NOT NULL DEFAULT '{}',
    email_sent INTEGER NOT NULL DEFAULT 0,
    email_sent_date TEXT,
    notes TEXT
  )
`);

export interface IStorage {
  createReview(review: InsertReview): Review;
  getReviews(): Review[];
  getReview(id: number): Review | undefined;
  updateEmailSent(id: number, sentDate: string): Review | undefined;
}

export class Storage implements IStorage {
  createReview(review: InsertReview): Review {
    return db.insert(reviews).values(review).returning().get();
  }

  getReviews(): Review[] {
    return db.select().from(reviews).orderBy(desc(reviews.id)).all();
  }

  getReview(id: number): Review | undefined {
    return db.select().from(reviews).where(eq(reviews.id, id)).get();
  }

  updateEmailSent(id: number, sentDate: string): Review | undefined {
    return db
      .update(reviews)
      .set({ emailSent: true, emailSentDate: sentDate })
      .where(eq(reviews.id, id))
      .returning()
      .get();
  }
}

export const storage = new Storage();
