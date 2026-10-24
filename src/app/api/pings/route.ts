import { desc } from "drizzle-orm";
import { getDb } from "@/db";
import { pings } from "@/db/schema";

export async function GET() {
  try {
    const rows = await getDb().select().from(pings).orderBy(desc(pings.id)).limit(5);
    return Response.json({ pings: rows });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : "hello from the browser";
    const [row] = await getDb().insert(pings).values({ note }).returning();
    return Response.json({ ping: row }, { status: 201 });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
