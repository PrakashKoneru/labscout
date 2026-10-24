// Semantic Scholar — research momentum (stage 1): citations to recent papers.
// Endpoint (verified 200): https://api.semanticscholar.org/graph/v1/author/search
// Optional S2_API_KEY (x-api-key). Unauthenticated works but is shared-rate-limited (429 -> []).
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";
import { mentionsInstitution, namesMatch, sharesWork } from "./match.ts";

export type S2Paper = { title: string | null; year: number | null; citationCount: number | null; externalIds?: Record<string, string | number> | null };
export type S2Author = { authorId: string; url: string; name: string; affiliations: string[] | null; paperCount: number | null; citationCount: number | null; hIndex: number | null; papers?: S2Paper[] | null };

/** Pick the S2 author that matches name AND (affiliation evidence OR a shared paper title/DOI). */
export function matchS2Author(c: Candidate, authors: S2Author[]): S2Author | null {
  let best: S2Author | null = null, bestScore = 0;
  for (const a of authors ?? []) {
    if (!namesMatch(a.name, c.name)) continue;
    const shared = (a.papers ?? []).filter((p) => sharesWork(c, p.title, p.externalIds?.DOI as string | undefined)).length;
    const aff = (a.affiliations ?? []).some((x) => mentionsInstitution(x, c.institutions));
    if (!aff && shared === 0) continue;
    const s = shared + (aff ? 1 : 0);
    if (s > bestScore) { best = a; bestScore = s; }
  }
  return best;
}

export function s2ToSignals(a: S2Author, now = new Date()): Signal[] {
  const y = now.getFullYear(), from = y - 2;
  const recent = (a.papers ?? []).filter((p) => (p.year ?? 0) >= from);
  const n = recent.reduce((s, p) => s + (p.citationCount ?? 0), 0);
  if (n <= 0) return [];
  return [{
    source: "semanticscholar", stage: 1, kind: "citation_velocity",
    label: `S2: ${n} citations to ${from}-${String(y).slice(2)} papers, h-index ${a.hIndex ?? 0}`,
    url: a.url || `https://www.semanticscholar.org/author/${a.authorId}`,
    date: null, weight: Math.min(8, Math.max(1, Math.round(Math.log2(1 + n)))),
  }];
}

export const source: SourceModule = {
  id: "semanticscholar",
  enabled: () => true,
  async enrich(c: Candidate): Promise<Signal[]> {
    try {
      if (!c?.name) return [];
      const fields = "name,affiliations,paperCount,citationCount,hIndex,url,papers.title,papers.year,papers.citationCount,papers.externalIds";
      const url = `https://api.semanticscholar.org/graph/v1/author/search?query=${encodeURIComponent(c.name)}&fields=${fields}&limit=5`;
      const headers: Record<string, string> = { "user-agent": "labscout/0.1" };
      if (process.env.S2_API_KEY) headers["x-api-key"] = process.env.S2_API_KEY;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return []; // 429 when the shared unauthenticated pool is exhausted
      const j: any = await r.json();
      const a = matchS2Author(c, Array.isArray(j?.data) ? j.data : []);
      return a ? s2ToSignals(a) : [];
    } catch {
      return [];
    }
  },
};
