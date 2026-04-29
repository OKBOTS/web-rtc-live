import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Ensure the public schema is always on the search path.
  // Some hosted PostgreSQL providers (Neon, Supabase, etc.) don't set it
  // by default, which causes "no schema has been selected" errors.
  options: "--search_path=public",
});
export const db = drizzle(pool, { schema });

export * from "./schema";
