import { aggregate } from "./aggregate.ts";
import { score, isCurrentStudent } from "./score.ts";
import { searchWorks, getAuthor } from "./openalex.ts";
import { getEducation } from "./orcid.ts";
import { parseQuery, writeBrief, checkFit, sessionFor } from "./llm.ts";
import { cleanCriteria } from "./fit.ts";
import { marketSignals, personMentions, aktaEnabled } from "./akta.ts";
import { saveShortlist, readShortlist, parseShortlist, diffShortlist, roundtableEnabled } from "./roundtable.ts";
import { trace, prismEnabled } from "./prism.ts";
import { SOURCES } from "./sources/index.ts";
import { searchPhases, sourceLabel } from "./search-watch.ts";
import type { LookSink } from "./search-watch.ts";
import type { Signal, SourceContext, SourceModule } from "./sources/types.ts";
import type { Candidate, SearchResponse } from "./types.ts";

const cache = new Map<string, SearchResponse>();

// Per-wave budgets: 14 s + 9 s keeps signal collection well inside the 60 s function limit.
const WAVE_TIMEOUT_MS = { 1: 14000, 2: 9000 } as const;

export type CollectOptions = { onLook?: LookSink; onWave?: (wave: 1 | 2) => void };

function watchWave(cands: Candidate[], active: SourceModule[], onLook?: LookSink) {
  const pending = new Map(active.map((source) => [source.id, cands.length]));
  const announced = new Set<string>();
  return {
    start(source: SourceModule) {
      if (!onLook || announced.has(source.id)) return;
      announced.add(source.id);
      onLook({ type: "source", id: source.id, label: sourceLabel(source.id), state: "looking" });
    },
    finish(source: SourceModule) {
      const left = (pending.get(source.id) ?? 1) - 1;
      pending.set(source.id, left);
      if (left > 0 || !onLook) return;
      onLook({ type: "source", id: source.id, label: sourceLabel(source.id), state: "done" });
    },
  };
}

/** Runs every enabled source on every candidate in parallel, in two waves (wave 2 may read wave-1 signals).
 *  One source can never break or stall the search. */
export async function collectSignals(cands: Candidate[], ctx: SourceContext, sources: SourceModule[] = SOURCES, options?: CollectOptions): Promise<void> {
  const active = sources.filter((s) => { try { return s.enabled(); } catch { return false; } });
  for (const wave of [1, 2] as const) {
    const group = active.filter((s) => (s.wave ?? 1) === wave);
    if (!group.length || !cands.length) continue;
    options?.onWave?.(wave);
    await runWave(cands, ctx, group, WAVE_TIMEOUT_MS[wave], options?.onLook);
  }
}

async function runWave(cands: Candidate[], ctx: SourceContext, active: SourceModule[], timeoutMs: number, onLook?: LookSink): Promise<void> {
  if (!active.length || !cands.length) return;
  const watch = watchWave(cands, active, onLook);
  await Promise.all(cands.flatMap((c) => {
    c.signals ??= [];
    return active.map(async (s) => {
      watch.start(s);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<Signal[]>((resolve) => { timer = setTimeout(() => resolve([]), timeoutMs); });
        const out = await Promise.race([s.enrich(c, ctx), timeout]);
        if (Array.isArray(out)) c.signals.push(...out.filter((x) => x && typeof x.label === "string"));
      } catch { /* source failures are non-fatal */ } finally { clearTimeout(timer); watch.finish(s); }
    });
  }));
}

export async function runSearch(q: string, criteriaIn: unknown = [], onLook?: LookSink): Promise<SearchResponse> {
  const criteria = cleanCriteria(criteriaIn);
  const key = criteria.length ? `${q}\u0000${criteria.join("|")}` : q;
  const hit = cache.get(key);
  if (hit) {
    onLook?.({ type: "phase", id: "saved", label: "Opening a saved search", index: 0, total: 1 });
    return hit;
  }
  const enabled = SOURCES.filter((s) => { try { return s.enabled(); } catch { return false; } });
  const phases = searchPhases({
    signals: enabled.some((s) => (s.wave ?? 1) === 1),
    follow: enabled.some((s) => s.wave === 2),
  });
  const emit = (id: string) => {
    const index = phases.findIndex((phase) => phase.id === id);
    if (index < 0) return;
    const phase = phases[index];
    onLook?.({ type: "phase", id: phase.id, label: phase.label, index, total: phases.length });
  };
  const t0 = Date.now();
  emit("thesis");
  // Previous saved shortlist for this thesis ("since last run"). Starts now so it costs no wall time.
  const prevP = readShortlist(q);
  const { keywords } = await parseQuery(q);
  // akta.pro market pull runs in parallel with the academic search
  let marketP = marketSignals(keywords);
  if (aktaEnabled()) {
    onLook?.({ type: "source", id: "akta", label: "the news", state: "looking" });
    marketP = marketP.finally(() => { onLook?.({ type: "source", id: "akta", label: "the news", state: "done" }); });
  }
  emit("papers");
  const works = await searchWorks(keywords);
  const candidates = aggregate(works);
  candidates.forEach((c) => (c.score = score(c)));
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 15);
  emit("roster");
  await Promise.all(top.map(async (c) => {
    const [author, education] = await Promise.all([getAuthor(c.authorId), getEducation(c.orcid)]);
    Object.assign(c, author, { education, isCurrentStudent: isCurrentStudent(education) });
    c.score = score(c);
  }));
  top.sort((a, b) => b.score - a.score);
  // Founder signals (GitHub, arXiv, NSF, ...): every enabled source on each of the top 10, all in parallel.
  const slice = top.slice(0, 10);
  if (phases.some((phase) => phase.id === "signals")) emit("signals");
  await collectSignals(slice, { query: q, keywords }, SOURCES, {
    onLook,
    onWave(wave) { if (wave === 2) emit("follow"); },
  });
  if (!slice.length && phases.some((phase) => phase.id === "follow")) emit("follow");
  top.forEach((c) => (c.score = score(c)));
  top.sort((a, b) => b.score - a.score);
  const final = top.slice(0, 10);
  emit("briefs");
  // Briefs, thesis-fit checks and press mentions all run in parallel.
  await Promise.all([
    ...final.map(async (c) => { try { c.brief = await writeBrief(c, q); } catch { c.brief = null; } }),
    ...final.map(async (c) => { try { c.fit = await checkFit(c, criteria, q); } catch { c.fit = []; } }),
    ...final.slice(0, 5).map(async (c) => { c.mentions = (await personMentions(c.name, 3, [...c.institutions, ...keywords.split(/\s+/)])).slice(0, 3); }),
  ]);
  if (criteria.length) { final.forEach((c) => (c.score = score(c))); final.sort((a, b) => b.score - a.score); }
  const market = await marketP;
  emit("shortlist");
  const prevMd = await prevP;
  const prev = prevMd ? parseShortlist(prevMd) : null;
  const changes = prev && prev.names.length ? diffShortlist(prev, final.map((c) => c.name)) : null;
  const roundtable = await saveShortlist(q, keywords, final);
  const tookMs = Date.now() - t0;
  const payload: SearchResponse = {
    query: q, keywords, criteria, totalWorks: works.length, candidates: final, market, roundtable, changes, tookMs,
    integrations: { nicrron: true, prism: prismEnabled(), akta: aktaEnabled(), roundtable: roundtableEnabled() },
  };
  // One summary trace per search so PRISM shows the whole run, not only the model calls.
  void trace({ model: "labscout-pipeline", input: q, output: `${final.length} candidates; top: ${final.map((c) => c.name).join(", ")}`,
    latencyMs: tookMs, sessionId: sessionFor(q), agentId: "search-orchestrator",
    metadata: { keywords, criteria: criteria.length, totalWorks: works.length, market: market.length, roundtable: roundtable?.path ?? null, newSinceLastRun: changes?.added.length ?? null } });
  cache.set(key, payload);
  return payload;
}
