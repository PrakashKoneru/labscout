import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { MODEL } from "@/lib/llm";

export async function GET() {
  try {
    const result = await getDb().execute(sql`select 1 as ok`);
    return Response.json({
      database: result.rows.length === 1 ? "reachable" : "unexpected response",
      branch: process.env.NEON_BRANCH ?? null,
      gatewayConfigured: Boolean(process.env.NICRRON_API_KEY),
      model: MODEL,
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unexpected error";
    return Response.json({ database: "unreachable", error: message }, { status: 500 });
  }
}
