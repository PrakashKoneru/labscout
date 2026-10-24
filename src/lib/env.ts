import { parseEnv } from "@neon/env";
import neonConfig from "../../neon";

let cached: { databaseUrl: string } | null = null;

/**
 * Neon-managed env vars, validated against the services declared in `neon.ts`.
 * Only `DATABASE_URL` is required here; migrations read the unpooled URL
 * straight from the environment in `drizzle.config.ts`.
 */
export function neonEnv() {
  if (!cached) {
    const { postgres } = parseEnv(neonConfig, ["DATABASE_URL"]);
    cached = { databaseUrl: postgres.databaseUrl };
  }
  return cached;
}
