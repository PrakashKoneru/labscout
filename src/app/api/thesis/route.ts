import { probeAll } from "@/lib/labscout";
import { collect, type Source } from "@/lib/sources";
import { readThesis } from "@/lib/thesis";

/** The probes fan out to the upstream search, which can take a minute. */
export const maxDuration = 60;

function summarize(sources: Source[]) {
  return sources.map(({ text, ...rest }) => ({ ...rest, readable: text !== null }));
}

export async function POST(request: Request) {
  try {
    const { instruction, sources } = await collect(await request.formData());

    if (!instruction && sources.length === 0) {
      return Response.json({ error: "Attach your thesis or describe what you are looking for" }, { status: 400 });
    }

    if (sources.length > 0 && sources.every((source) => !source.text)) {
      return Response.json(
        { error: "Nothing readable in what you sent", sources: summarize(sources) },
        { status: 400 },
      );
    }

    const { value: thesis, model, usage } = await readThesis(sources, instruction);
    const probes = await probeAll(thesis.niches);

    return Response.json({ sources: summarize(sources), thesis, probes, model, usage });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
