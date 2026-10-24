// Minimal stateless MCP server (Streamable HTTP, JSON responses). Zero dependencies.
// Spec: JSON-RPC 2.0 over POST. Methods: initialize, notifications/*, ping, tools/list, tools/call.
import { renderShortlist } from "./roundtable.ts";
import type { SearchResponse } from "./types.ts";

export const PROTOCOL_VERSION = "2025-06-18";

export const TOOLS = [
  {
    name: "search_students",
    description:
      "Find current students at Columbia, NYU, Cornell and Cornell Tech who are already publishing on a VC investment thesis. " +
      "Returns a ranked shortlist with a 3-line 'why this student' brief, score breakdown, source links (OpenAlex, ORCID, papers), " +
      "akta.pro market news for the thesis, and the Roundtable file the shortlist was saved to. Takes 10-20 s.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Investment thesis in plain English, e.g. 'protein design with diffusion models'" },
        limit: { type: "integer", minimum: 1, maximum: 10, default: 10, description: "Max students to return" },
        criteria: { type: "array", items: { type: "string" }, maxItems: 4, description: "Optional investor criteria; each student gets a yes/partial/no fit verdict with evidence" },
      },
      required: ["query"],
    },
  },
];

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };
type Search = (q: string, criteria?: unknown) => Promise<SearchResponse>;

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** Returns the JSON-RPC response, or null for notifications (HTTP 202, no body). */
export async function handleRpc(msg: Rpc, search: Search): Promise<object | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return err(msg?.id, -32600, "Invalid Request");
  if (msg.id === undefined || msg.method.startsWith("notifications/")) return null;
  switch (msg.method) {
    case "initialize":
      return ok(msg.id, {
        protocolVersion: msg.params?.protocolVersion ?? PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "labscout", title: "Labscout — PitchBook for students", version: "0.1.0" },
        instructions: "Call search_students with a VC thesis to get ranked NYC student researchers with sourced briefs.",
      });
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, { tools: TOOLS });
    case "tools/call": {
      const name = msg.params?.name;
      const args = msg.params?.arguments ?? {};
      if (name !== "search_students") return err(msg.id, -32602, `Unknown tool: ${name}`);
      if (!args.query || typeof args.query !== "string") return err(msg.id, -32602, "query (string) is required");
      try {
        const res = await search(args.query, args.criteria);
        const limit = Math.max(1, Math.min(10, Number(args.limit) || 10));
        const candidates = res.candidates.slice(0, limit);
        let text = renderShortlist(res.query, res.keywords, candidates);
        if (res.market.length) text += "\n## Market pull (akta.pro)\n" + res.market.map((m) => `- ${m.title} — ${m.publisher ?? ""} ${m.url}`).join("\n");
        if (res.roundtable) text += `\n\nSaved to Roundtable: ${res.roundtable.path}${res.roundtable.version ? ` (version ${res.roundtable.version})` : ""}`;
        return ok(msg.id, { content: [{ type: "text", text }], structuredContent: { ...res, candidates }, isError: false });
      } catch (e: any) {
        return ok(msg.id, { content: [{ type: "text", text: `Search failed: ${e?.message ?? e}` }], isError: true });
      }
    }
    default:
      return err(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
