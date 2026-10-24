import { aggregate } from "../lib/aggregate.ts";
import { score, isCurrentStudent } from "../lib/score.ts";
import { searchWorks, getAuthor } from "../lib/openalex.ts";
import { getEducation } from "../lib/orcid.ts";
import { parseQuery, writeBrief, sessionFor } from "../lib/llm.ts";
import { marketSignals, personMentions, aktaEnabled } from "../lib/akta.ts";
import { saveShortlist, roundtableEnabled } from "../lib/roundtable.ts";
import { trace, prismEnabled } from "../lib/prism.ts";
import type { SearchResponse } from "../lib/types.ts";

const cache = new Map<string, SearchResponse>();

export async function runSearch(q: string): Promise<SearchResponse> {
  const hit = cache.get(q);
  if (hit) return hit;
  const t0 = Date.now();
  const { keywords } = await parseQuery(q);
  // akta.pro market pull runs in parallel with the academic search
  const marketP = marketSignals(keywords);
  const works = await searchWorks(keywords);
  const candidates = aggregate(works);
  candidates.forEach((c) => (c.score = score(c)));
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 15);
  await Promise.all(top.map(async (c) => {
    const [author, education] = await Promise.all([getAuthor(c.authorId), getEducation(c.orcid)]);
    Object.assign(c, author, { education, isCurrentStudent: isCurrentStudent(education) });
    c.score = score(c);
  }));
  top.sort((a, b) => b.score - a.score);
  const final = top.slice(0, 10);
  await Promise.all([
    ...final.map(async (c) => { try { c.brief = await writeBrief(c, q); } catch { c.brief = null; } }),
    ...final.slice(0, 5).map(async (c) => { c.mentions = await personMentions(c.name); }),
  ]);
  const market = await marketP;
  const roundtable = await saveShortlist(q, keywords, final);
  const payload: SearchResponse = {
    query: q, keywords, totalWorks: works.length, candidates: final, market, roundtable,
    integrations: { nicrron: true, prism: prismEnabled(), akta: aktaEnabled(), roundtable: roundtableEnabled() },
  };
  // One summary trace per search so PRISM shows the whole run, not only the model calls.
  void trace({ model: "labscout-pipeline", input: q, output: `${final.length} candidates; top: ${final.map((c) => c.name).join(", ")}`,
    latencyMs: Date.now() - t0, sessionId: sessionFor(q), agentId: "search-orchestrator",
    metadata: { keywords, totalWorks: works.length, market: market.length, roundtable: roundtable?.path ?? null } });
  cache.set(q, payload);
  return payload;
}

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
