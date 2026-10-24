import { probeAll } from "@/lib/labscout";
import { refineNiches, type ThesisRead, type Turn } from "@/lib/thesis";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const thesis = body?.thesis as ThesisRead | undefined;
    const history = body?.history as Turn[] | undefined;

    if (!thesis || !Array.isArray(history) || history.length === 0) {
      return Response.json({ error: "Expected a thesis and a conversation history" }, { status: 400 });
    }

    const { value, model, usage } = await refineNiches(thesis, history);
    const probes = await probeAll(value.niches);

    return Response.json({ reply: value.reply, niches: value.niches, probes, model, usage });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
