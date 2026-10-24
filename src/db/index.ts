import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { neonEnv } from "@/lib/env";
import * as schema from "./schema";

let pool: Pool | null = null;
let database: NodePgDatabase<typeof schema> | null = null;

export function getDb() {
  if (!database) {
    pool = new Pool({ connectionString: neonEnv().databaseUrl, max: 5 });
    // Lets Vercel drain the pool when a Fluid compute instance suspends.
    attachDatabasePool(pool);
    database = drizzle(pool, { schema });
  }
  return database;
}
