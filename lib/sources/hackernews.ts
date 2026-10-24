// Hacker News — early traction (stage 5): Show HN / Launch HN and front-page stories about the candidate's artifacts.
// Algolia HN Search API, no key (verified 200): https://hn.algolia.com/api/v1/search?query=<q>&tags=story
// Wave 2: queries come from wave-1 evidence (GitHub repo URLs, Hugging Face profile) plus the candidate's paper titles —
// never from a bare person name. Quirk: Algolia matching is fuzzy/prefix-y (github.com/x/dinov2 also returns dinov3,
// huggingface.co/srush returns unrelated HF links), so every hit is re-verified by exact URL / title match. hit.url may be null.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";
import { normalizeTitle } from "./match.ts";

export type HnHit = { objectID: string; title: string; url?: string | null; author?: string; points?: number | null; num_comments?: number | null; created_at?: string };
export type HnEvidence = { repos: string[]; hf: string[]; arxiv: string[]; titles: string[] };

const lc = (s: string) => s.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bareTitle = (t: string) => normalizeTitle(String(t ?? "").replace(/^(show|launch) hn\s*[:–-]\s*/i, "").replace(/\s*[([](\d{4}|pdf|video)[)\]]\s*$/i, ""));

/** Evidence derived from wave-1 signals and the candidate's works. */
export function hnEvidence(c: Candidate): HnEvidence {
  const repos = new Set<string>(), hf = new Set<string>(), arxiv = new Set<string>();
  for (const s of c.signals ?? []) {
    const u = s.url ?? "";
    const r = u.match(/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+)/i);
    if (s.source === "github" && s.kind === "repo" && r) repos.add(`github.com/${r[1]}`.toLowerCase());
    const h = u.match(/^https?:\/\/(?:www\.)?huggingface\.co\/([\w.-]+)\/?$/i);
    if (s.source === "huggingface" && s.kind === "profile" && h) hf.add(`huggingface.co/${h[1]}`.toLowerCase());
  }
  for (const w of c.works ?? []) {
    const m = `${w.doi ?? ""} ${w.url ?? ""}`.match(/(?:arxiv\.|arxiv\.org\/(?:abs|pdf)\/)(\d{4}\.\d{4,5})/i);
    if (m) arxiv.add(m[1]);
  }
  const titles = (c.works ?? []).map((w) => w.title).filter((t) => t && normalizeTitle(t).length > 10);
  return { repos: [...repos].slice(0, 3), hf: [...hf].slice(0, 1), arxiv: [...arxiv], titles: titles.slice(0, 3) };
}

export function hnQueries(e: HnEvidence): string[] {
  return [...e.repos, ...e.titles.map((t) => `"${t.replace(/"/g, " ").trim()}"`), ...e.hf];
}

/** A hit counts only when its URL points at the candidate's repo / HF space / arXiv paper, or its title is a work title. */
export function hitMatches(h: HnHit, e: HnEvidence, c: Candidate): boolean {
  if (!h?.objectID || !h.title) return false;
  const u = h.url ? lc(h.url) : "";
  if (u && e.repos.some((r) => new RegExp(`^${esc(r)}(?:[/#?]|$)`).test(u))) return true;
  if (u && e.hf.some((r) => new RegExp(`^${esc(r)}(?:[/#?]|$)`).test(u))) return true;
  if (u && e.arxiv.some((id) => new RegExp(`^arxiv\\.org/(?:abs|pdf|html)/${esc(id)}(?:v\\d+)?(?:[/#?.]|$)`).test(u))) return true;
  const t = bareTitle(h.title);
  return t.length > 10 && (c.works ?? []).some((w) => normalizeTitle(w.title ?? "") === t);
}

export function hnToSignals(hits: HnHit[]): Signal[] {
  const seen = new Set<string>(), uniq: HnHit[] = [];
  for (const h of [...hits].sort((a, b) => (b.points ?? 0) - (a.points ?? 0))) {
    const k = h.url ? lc(h.url) : `id:${h.objectID}`;
    if (seen.has(h.objectID) || seen.has(k)) continue;
    seen.add(h.objectID); seen.add(k); uniq.push(h);
  }
  let total = 0;
  return uniq.slice(0, 3).map((h): Signal => {
    const pts = h.points ?? 0, show = /^(show|launch) hn\b/i.test(h.title);
    return {
      source: "hackernews", stage: 5, kind: show ? "show_hn" : "hn_story",
      label: `HN: ${h.title} — ${pts} points, ${h.num_comments ?? 0} comments (${(h.created_at ?? "").slice(0, 7)})`,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`, date: h.created_at ?? null,
      weight: show ? 6 : Math.min(5, 1 + Math.round(Math.log2(1 + pts) / 2)),
    };
  }).map((s) => { const w = Math.min(s.weight, 15 - total); total += w; return { ...s, weight: w }; }).filter((s) => s.weight > 0);
}

export const source: SourceModule = {
  id: "hackernews",
  wave: 2,
  enabled: () => true,
  async enrich(c) {
    try {
      const e = hnEvidence(c);
      const qs = hnQueries(e);
      if (!qs.length) return [];
      const res = await Promise.all(qs.map(async (q) => {
        try {
          const r = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=20`,
            { headers: { "user-agent": "labscout/0.1" }, signal: AbortSignal.timeout(12000) });
          if (!r.ok) return [];
          const j: any = await r.json();
          return (j?.hits ?? []) as HnHit[];
        } catch { return []; }
      }));
      return hnToSignals(res.flat().filter((h) => hitMatches(h, e, c)));
    } catch {
      return [];
    }
  },
};
