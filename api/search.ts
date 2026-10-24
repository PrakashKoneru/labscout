import { runSearch } from "../lib/search.ts";

export { runSearch };

// Vercel Node serverless handler (req, res style)
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  let body: any;
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {}); }
  catch { res.status(400).json({ error: "invalid JSON" }); return; }
  const q = body.q;
  if (!q || typeof q !== "string") { res.status(400).json({ error: "q required" }); return; }
  try { res.status(200).json(await runSearch(q)); }
  catch (e: any) { res.status(500).json({ error: e?.message ?? String(e) }); }
}
