import { getStatus } from "../lib/status.ts";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") { res.status(405).json({ error: "GET only" }); return; }
  // ?fresh=1 bypasses the 60 s cache (used by "Refresh live status" after a search)
  const fresh = /[?&]fresh=1/.test(req.url ?? "");
  const out = await getStatus(fresh);
  res.setHeader("cache-control", "no-store");
  res.status(200).json(out);
}
