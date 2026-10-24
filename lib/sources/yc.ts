// Y Combinator — early traction (stage 5): the candidate is a listed founder of a recent YC company.
// The yc-oss mirror (https://yc-oss.github.io/api/companies/all.json, ~6.3k companies, ~10 MB, verified 200) has NO founder
// fields (keys: id, name, slug, former_names, website, one_liner, batch, status, tags, regions, all_locations, url, ...).
// Founders ARE on the public company page https://www.ycombinator.com/companies/<slug> (Inertia JSON in the `data-page`
// attribute: props.company.founders[{full_name,title,founder_bio}]), but there is no founder search.
// So this is WAVE 2: company names come from wave-1 signals (NY entity, Form D, SBIR, ORCID founder_role, GitHub company/bio);
// a name that equals a YC company (batch within 5 y) is then VERIFIED by fetching its YC page and requiring a founder whose
// full_name matches the candidate. Without a verified founder nothing is emitted. List cached in module scope for 6 h.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";
import { UA, entityNamesFromSignals, normalizeEntity } from "./entity.ts";
import { namesMatch } from "./match.ts";

export type YcCompany = { name: string; slug: string; batch?: string; one_liner?: string; former_names?: string[] | string; website?: string };
export type YcFounder = { full_name?: string; title?: string; founder_bio?: string };

const TTL = 6 * 3600 * 1000;
let cache: { at: number; list: Promise<YcCompany[]> } | null = null;

export function batchYear(batch?: string): number | null {
  const s = String(batch ?? "");
  const m = s.match(/\b(20\d\d)\b/) ?? s.match(/^[WSFX](\d\d)$/i);              // "Winter 2026" | "W26"
  return m ? (m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1])) : null;
}

const formerNames = (f: YcCompany["former_names"]): string[] =>
  Array.isArray(f) ? f : typeof f === "string" ? (f.match(/'([^']+)'|"([^"]+)"/g) ?? []).map((s) => s.slice(1, -1)) : [];

/** YC companies (batch within 5 y) whose current or former name equals one of `names` (legal suffixes ignored). */
export function matchYc(list: YcCompany[], names: string[], now = Date.now()): YcCompany[] {
  const want = new Set(names.map(normalizeEntity).filter((n) => n.length >= 3));
  const minYear = new Date(now).getUTCFullYear() - 5;
  return list.filter((co) => (batchYear(co.batch) ?? 0) >= minYear
    && [co.name, ...formerNames(co.former_names)].some((n) => want.has(normalizeEntity(n))));
}

/** Founders from a ycombinator.com/companies/<slug> page (data-page JSON). */
export function parseYcFounders(html: string): YcFounder[] {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return [];
  const raw = m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  try { return JSON.parse(raw)?.props?.company?.founders ?? []; } catch { return []; }
}

export function ycToSignal(c: Candidate, co: YcCompany, founders: YcFounder[]): Signal | null {
  const f = founders.find((x) => namesMatch(x.full_name ?? "", c.name));
  if (!f) return null;
  return {
    source: "yc", stage: 5, kind: "yc_company", weight: 12, date: batchYear(co.batch) ? `${batchYear(co.batch)}-01-01` : null,
    label: `YC ${co.batch ?? "?"}: ${co.name} — ${(co.one_liner ?? "").slice(0, 80)}${f.title ? ` (${f.title})` : ""}`,
    url: `https://www.ycombinator.com/companies/${co.slug}`,
  };
}

async function get(url: string): Promise<Response | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(12000) });
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

function loadList(): Promise<YcCompany[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.list;
  const list = (async () => {
    const r = await get("https://yc-oss.github.io/api/companies/all.json");
    const j: any = r ? await r.json() : null;
    if (!Array.isArray(j)) { cache = null; return []; }             // don't cache failures
    return j.map((x: any) => ({ name: x.name, slug: x.slug, batch: x.batch, one_liner: x.one_liner, former_names: x.former_names }));
  })().catch(() => { cache = null; return [] as YcCompany[]; });
  cache = { at: Date.now(), list };
  return list;
}

export const source: SourceModule = {
  id: "yc",
  wave: 2,
  enabled: () => true,
  async enrich(c: Candidate): Promise<Signal[]> {
    try {
      const names = entityNamesFromSignals(c, true);
      if (!c?.name || !names.length) return [];
      for (const co of matchYc(await loadList(), names).slice(0, 2)) {
        const r = await get(`https://www.ycombinator.com/companies/${encodeURIComponent(co.slug)}`);
        const s = r ? ycToSignal(c, co, parseYcFounders(await r.text())) : null;
        if (s) return [s];                                                   // one YC company = 12 points
      }
      return [];
    } catch {
      return [];
    }
  },
};

/** Test hook: drop the cached company list. */
export function _resetYcCache(): void { cache = null; }
