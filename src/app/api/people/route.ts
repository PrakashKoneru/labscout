import { search } from "@/lib/labscout";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const query = typeof body?.query === "string" ? body.query.trim() : "";

    if (!query) return Response.json({ error: "Expected a query" }, { status: 400 });

    return Response.json(await search(query));
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
