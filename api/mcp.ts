// Labscout MCP endpoint: POST https://labscout-jakdemir.vercel.app/api/mcp
import { handleRpc } from "../lib/mcp.ts";
import { runSearch } from "../lib/search.ts";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-protocol-version, mcp-session-id, authorization");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).setHeader("Allow", "POST").json({ error: "MCP over Streamable HTTP: POST JSON-RPC here" }); return; }
  let body: any;
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "null") : req.body; }
  catch { res.status(400).json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); return; }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handleRpc(m, runSearch)))).filter(Boolean);
    if (!out.length) { res.status(202).end(); return; }
    res.status(200).json(out); return;
  }
  const out = await handleRpc(body, runSearch);
  if (!out) { res.status(202).end(); return; }
  res.status(200).json(out);
}
