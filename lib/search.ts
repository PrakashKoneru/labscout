import { aggregate } from "./aggregate.ts";
import { score, isCurrentStudent } from "./score.ts";
import { searchWorks, getAuthor } from "./openalex.ts";
import { getEducation } from "./orcid.ts";
import { parseQuery, writeBrief, sessionFor } from "./llm.ts";
import { marketSignals, personMentions, aktaEnabled } from "./akta.ts";
import { saveShortlist, roundtableEnabled } from "./roundtable.ts";
import { trace, prismEnabled } from "./prism.ts";
import { SOURCES } from "./sources/index.ts";
import type { Signal, SourceContext, SourceModule } from "./sources/types.ts";
import type { Candidate, SearchResponse } from "./types.ts";

const cache = new Map<string, SearchResponse>();

// Per-wave budgets: 14 s + 9 s keeps signal collection well inside the 60 s function limit.
const WAVE_TIMEOUT_MS = { 1: 14000, 2: 9000 } as const;

/** Runs every enabled source on every candidate in parallel, in two waves (wave 2 may read wave-1 signals).
 *  One source can never break or stall the search. */
export async function collectSignals(cands: Candidate[], ctx: SourceContext, sources: SourceModule[] = SOURCES): Promise<void> {
  const active = sources.filter((s) => { try { return s.enabled(); } catch { return false; } });
  await runWave(cands, ctx, active.filter((s) => (s.wave ?? 1) === 1), WAVE_TIMEOUT_MS[1]);
  await runWave(cands, ctx, active.filter((s) => s.wave === 2), WAVE_TIMEOUT_MS[2]);
}

async function runWave(cands: Candidate[], ctx: SourceContext, active: SourceModule[], timeoutMs: number): Promise<void> {
  if (!active.length) return;
  await Promise.all(cands.flatMap((c) => {
    c.signals ??= [];
    return active.map(async (s) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<Signal[]>((resolve) => { timer = setTimeout(() => resolve([]), timeoutMs); });
        const out = await Promise.race([s.enrich(c, ctx), timeout]);
        if (Array.isArray(out)) c.signals.push(...out.filter((x) => x && typeof x.label === "string"));
      } catch { /* source failures are non-fatal */ } finally { clearTimeout(timer); }
    });
  }));
}

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
  // Founder signals (GitHub, arXiv, NSF, ...): every enabled source on each of the top 10, all in parallel.
  await collectSignals(top.slice(0, 10), { query: q, keywords });
  top.forEach((c) => (c.score = score(c)));
  top.sort((a, b) => b.score - a.score);
  const final = top.slice(0, 10);
  await Promise.all([
    ...final.map(async (c) => { try { c.brief = await writeBrief(c, q); } catch { c.brief = null; } }),
    ...final.slice(0, 5).map(async (c) => { c.mentions = (await personMentions(c.name, 3, [...c.institutions, ...keywords.split(/\s+/)])).slice(0, 3); }),
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

