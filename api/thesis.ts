// POST /api/thesis {text, filename} -> {title, query, keywords, criteria}
import { thesisFromText } from "../lib/thesis.ts";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  let body: any;
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body ?? {}); }
  catch { res.status(400).json({ error: "invalid JSON" }); return; }
  if (!body.text || typeof body.text !== "string") { res.status(400).json({ error: "text required" }); return; }
  try { res.status(200).json(await thesisFromText(body.text, typeof body.filename === "string" ? body.filename : "")); }
  catch (e: any) { res.status(422).json({ error: e?.message ?? String(e) }); }
}
