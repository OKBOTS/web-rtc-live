import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Ensures all required database tables exist.
 * Uses CREATE TABLE IF NOT EXISTS so it is safe to run on every startup —
 * it is a no-op when the schema is already up to date.
 */
export async function runMigrations(): Promise<void> {
  logger.info("Running database migrations...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "rooms" (
      "code"            text                     PRIMARY KEY,
      "title"           text                     NOT NULL,
      "host_name"       text                     NOT NULL,
      "source_type"     text                     NOT NULL,
      "host_token_hash" text                     NOT NULL,
      "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
      "ended_at"        timestamp with time zone,
      "peak_listeners"  integer                  NOT NULL DEFAULT 0
    );
  `);

  logger.info("Database migrations complete.");
}
