import { runSearch } from "../../lib/search.ts";
import type { Look } from "../../lib/search-watch.ts";

type StreamLine = Look | { type: "result"; data: unknown } | { type: "error"; message: string };

export async function streamSearch(request: Request): Promise<Response> {
  const raw = await request.text();
  let body: { q?: unknown; criteria?: unknown };
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const q = body.q;
  if (!q || typeof q !== "string") return Response.json({ error: "q required" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: StreamLine) => {
        controller.enqueue(encoder.encode(JSON.stringify(line) + "\n"));
      };
      try {
        const data = await runSearch(q, body.criteria, send);
        send({ type: "result", data });
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "Search failed.";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
