import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    // Migrations must not go through PgBouncer, so use the unpooled URL.
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
});
