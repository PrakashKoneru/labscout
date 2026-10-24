// PRISM by Block Convey — agent observability. One HTTP POST per model exchange.
// Docs: https://blockconvey.com/docs  (header X-PRISMtrace-Key, not Bearer)
const HOST = process.env.PRISMTRACE_HOST || "https://prism.blockconvey.com";

export type TraceInput = {
  model: string;
  input: string;
  output: string;
  latencyMs: number;
  sessionId: string;
  agentId: string;
  metadata?: Record<string, unknown>;
};

export function prismEnabled(): boolean {
  return !!(process.env.PRISMTRACE_API_KEY && process.env.PRISMTRACE_PROJECT_ID);
}

/** Fire-and-forget. Never throws; never blocks the search. */
export async function trace(t: TraceInput): Promise<string | null> {
  if (!prismEnabled()) return null;
  try {
    const r = await fetch(`${HOST}/api/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-PRISMtrace-Key": process.env.PRISMTRACE_API_KEY! },
      body: JSON.stringify({
        project_id: process.env.PRISMTRACE_PROJECT_ID,
        model: t.model,
        input_messages: [{ role: "user", content: t.input }],
        output_message: t.output,
        latency_ms: Math.round(t.latencyMs),
        session_id: t.sessionId,
        agent_id: t.agentId,
        metadata: t.metadata ?? {},
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return d?.id ?? null;
  } catch {
    return null;
  }
}
