import { pool } from "@workspace/db";
import { logger } from "./logger";

/**
 * Returns the schema name the current connection should use.
 *
 * Some hosted PostgreSQL providers assign a non-public schema to the user and
 * leave search_path empty (or point it to "$user" with no matching schema),
 * which causes "no schema has been selected to create in" errors.
 *
 * Resolution order:
 *   1. DATABASE_SCHEMA env var — explicit override
 *   2. current_schema() — whatever the server has configured for this role
 *   3. First non-system schema visible to the current user
 *   4. "public" as a last resort
 */
async function resolveSchema(): Promise<string> {
  // 1. Explicit override
  if (process.env.DATABASE_SCHEMA) return process.env.DATABASE_SCHEMA;

  // 2. Server-configured default for this connection
  const { rows: curr } = await pool.query<{ s: string | null }>(
    "SELECT current_schema() AS s",
  );
  if (curr[0]?.s) return curr[0].s;

  // 3. First non-system schema the current user can see
  const { rows: owned } = await pool.query<{ schema_name: string }>(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
      AND schema_name NOT LIKE 'pg_%'
    ORDER BY schema_name
    LIMIT 1
  `);
  if (owned[0]?.schema_name) return owned[0].schema_name;

  // 4. Fall back to public
  return "public";
}

/**
 * Ensures all required database tables exist and configures the connection
 * pool so every subsequent query (including Drizzle ORM) uses the same schema.
 *
 * Uses CREATE TABLE IF NOT EXISTS — safe and a no-op on subsequent restarts.
 */
export async function runMigrations(): Promise<void> {
  logger.info("Running database migrations...");

  const schema = await resolveSchema();
  logger.info({ schema }, "Using database schema");

  // Pin every new pool connection to this schema so Drizzle ORM queries work
  // without schema-qualifying every table name.
  pool.on("connect", (client) => {
    client.query(`SET search_path TO "${schema}"`).catch(() => {});
  });

  await pool.query(`SET search_path TO "${schema}"`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "${schema}"."rooms" (
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
