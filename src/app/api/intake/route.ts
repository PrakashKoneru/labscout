import { extractProfile } from "@/lib/extract";
import { collect, type Source } from "@/lib/sources";

/** Swap this for the upstream service's URL once it exists. */
function matchEndpoint(request: Request) {
  return process.env.MATCH_API_URL ?? new URL("/api/match", request.url).toString();
}

/** Drops the document bodies, which the browser does not need back. */
function summarize(sources: Source[]) {
  return sources.map(({ text, ...rest }) => ({ ...rest, readable: text !== null }));
}

export async function POST(request: Request) {
  try {
    const { instruction, sources } = await collect(await request.formData());

    if (sources.length === 0) {
      return Response.json({ error: "Attach a document or paste a Google Doc link" }, { status: 400 });
    }

    if (sources.every((source) => !source.text)) {
      return Response.json(
        { error: "Nothing readable in what you sent", sources: summarize(sources) },
        { status: 400 },
      );
    }

    const { profile, model, usage } = await extractProfile(sources, instruction);

    const response = await fetch(matchEndpoint(request), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile }),
    });

    const matchData = await response.json().catch(() => null);

    if (!response.ok) {
      return Response.json(
        {
          error: `The matching API returned ${response.status}`,
          sources: summarize(sources),
          profile,
        },
        { status: 502 },
      );
    }

    return Response.json({
      sources: summarize(sources),
      instruction,
      profile,
      model,
      usage,
      match: matchData,
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
