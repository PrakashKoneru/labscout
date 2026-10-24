// Zenodo — builder signal (stage 2): software releases (incl. GitHub-release DOIs) and datasets with real downloads.
// Endpoint (verified 200, no key): https://zenodo.org/api/records?q=<query>&size=20&sort=mostrecent
// Query: (creators.name:"Last, First" OR creators.name:"First Last") AND (resource_type.type:software OR resource_type.type:dataset)
// Real fields: hits.hits[].{id, conceptrecid, doi, metadata:{title, publication_date, keywords?, resource_type:{type},
//   creators:[{name, affiliation?, orcid?}]}, stats:{downloads, unique_downloads, views}, links:{self_html}}
// Quirks: creator names come both as "Last, First" and "First Last"; each version of a record is its own hit
// (dedupe by conceptrecid); affiliation may be null; orcid is a bare id ("0000-0001-...").
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule, SourceContext } from "./types.ts";
import { mentionsInstitution, namesMatch, sharesWork } from "./match.ts";

export type ZenodoHit = {
  id?: number | string; conceptrecid?: string; doi?: string;
  metadata?: { title?: string; publication_date?: string; keywords?: string[]; resource_type?: { type?: string };
    creators?: { name?: string; affiliation?: string | null; orcid?: string }[] };
  stats?: { downloads?: number; unique_downloads?: number; views?: number };
  links?: { self_html?: string };
};

/** "Last, First" -> "First Last". */
export const flipName = (n: string) => (n.includes(",") ? n.split(",").map((s) => s.trim()).reverse().join(" ") : n).trim();
const bareOrcid = (s?: string | null) => String(s ?? "").match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/i)?.[0].toUpperCase() ?? "";

export function zenodoQuery(name: string): string {
  const parts = name.replace(/["\\,:()]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return "";
  const first = parts[0], last = parts[parts.length - 1];
  return `(creators.name:"${last}, ${first}" OR creators.name:"${first} ${last}") AND (resource_type.type:software OR resource_type.type:dataset)`;
}

/** Record counts if a creator namesMatch the candidate AND (same ORCID | institution | shared work).
 *  Topic overlap alone is NOT enough: common names on Zenodo produce on-topic namesakes (e.g. auto-archived GitHub releases). */
export function zenodoMatches(c: Candidate, h: ZenodoHit, _keywords: string): boolean {
  const m = h?.metadata;
  if (!m?.title) return false;
  return (m.creators ?? []).some((cr) => namesMatch(flipName(cr?.name ?? ""), c.name) && (
    (!!c.orcid && bareOrcid(cr.orcid) !== "" && bareOrcid(cr.orcid) === bareOrcid(c.orcid)) ||
    mentionsInstitution(cr.affiliation, c.institutions) || sharesWork(c, m.title, h.doi)));
}

export function zenodoToSignals(c: Candidate, hits: ZenodoHit[], keywords: string): Signal[] {
  const best = new Map<string, ZenodoHit>(); // one per concept (all versions share conceptrecid), most downloads wins
  for (const h of hits ?? []) {
    const type = h?.metadata?.resource_type?.type;
    if ((type !== "software" && type !== "dataset") || !zenodoMatches(c, h, keywords)) continue;
    const k = String(h.conceptrecid ?? h.id);
    const prev = best.get(k);
    if (!prev || (h.stats?.downloads ?? 0) > (prev.stats?.downloads ?? 0)) best.set(k, h);
  }
  const out: Signal[] = [];
  let total = 0;
  for (const h of [...best.values()].sort((a, b) => (b.stats?.downloads ?? 0) - (a.stats?.downloads ?? 0))) {
    if (out.length >= 4) break;
    const m = h.metadata!, dl = h.stats?.downloads ?? 0, type = m.resource_type!.type!;
    const weight = Math.min(5, 1 + Math.round(Math.log10(dl + 1)));
    if (total + weight > 15) continue;
    total += weight;
    out.push({ source: "zenodo", stage: 2, kind: type, label: `Zenodo ${type}: ${m.title!.replace(/\s+/g, " ").slice(0, 120)} — ${dl} download${dl === 1 ? "" : "s"}`,
      url: h.links?.self_html ?? (h.doi ? `https://doi.org/${h.doi}` : null), date: m.publication_date ?? null, weight });
  }
  return out;
}

export const source: SourceModule = {
  id: "zenodo",
  enabled: () => true,
  async enrich(c: Candidate, ctx: SourceContext): Promise<Signal[]> {
    try {
      const q = zenodoQuery(c?.name ?? "");
      if (!q) return [];
      const r = await fetch(`https://zenodo.org/api/records?q=${encodeURIComponent(q)}&size=20&sort=mostrecent`,
        { headers: { "user-agent": "labscout/0.1", accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return [];
      const j: any = await r.json();
      return zenodoToSignals(c, Array.isArray(j?.hits?.hits) ? j.hits.hits : [], ctx?.keywords ?? "");
    } catch {
      return [];
    }
  },
};
