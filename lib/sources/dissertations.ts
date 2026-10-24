// Dissertations — spinout timing (stage 4) + research (stage 1): a freshly deposited PhD thesis means the candidate is
// graduating / just graduated — the classic window for starting a company.
// Endpoints (verified 200, no key):
//   Columbia Academic Commons (Hyrax): https://academiccommons.columbia.edu/api/v1/search?search_type=keyword&q=<name>&type[]=Theses&per_page=10
//     records[] {id, title, author:["Last, First"], abstract, date:"2026" (year only), department[], type:["Theses"],
//     persistent_url:"https://doi.org/10.7916/...", created_at (deposit timestamp)}. `filters[...]` params return 400; use `type[]=`.
//   Cornell eCommons (DSpace 7): https://ecommons.cornell.edu/server/api/discover/search/objects?query=<name>&size=10&dsoType=item
//     &f.itemtype=dissertation or thesis,equals -> _embedded.searchResult._embedded.objects[]._embedded.indexableObject
//     {uuid, handle, name, metadata{"dc.contributor.author","dc.date.issued","dc.type":"dissertation or thesis","dc.description.abstract"}}.
//   NYU: archive.nyu.edu is DSpace 5.4 — /server/api 404, /rest 500, /open-search 400; NYU PhD theses live in ProQuest (closed). Skipped.
// Match: thesis type AND author name match (repository is already institution-scoped) AND issued within 24 months
// (older theses count only when on-topic).
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule, SourceContext } from "./types.ts";
import { mentionsInstitution, namesMatch, topicOverlap } from "./match.ts";

const UA = "labscout/0.1 (mailto:jak@protocogni.com)";

export type Thesis = { title: string; authors: string[]; date: string; type: string; abstract: string; url: string; repo: string };

/** "Last, First M." -> "First M. Last" */
export function flipName(s: string): string {
  const m = String(s ?? "").match(/^\s*([^,]+),\s*(.+?)\s*$/);
  return m ? `${m[2]} ${m[1]}` : String(s ?? "").trim();
}

export function parseAcademicCommons(j: any): Thesis[] {
  return (j?.records ?? []).map((r: any) => ({
    title: String(r?.title ?? "").trim(), authors: (r?.author ?? []).map(flipName),
    date: String(r?.created_at ?? r?.date ?? "").slice(0, 10), type: (r?.type ?? []).join(" "),
    abstract: String(r?.abstract ?? ""), url: r?.persistent_url ?? `https://academiccommons.columbia.edu/doi/${r?.id}`,
    repo: "Columbia Academic Commons",
  }));
}

export function parseECommons(j: any): Thesis[] {
  return (j?._embedded?.searchResult?._embedded?.objects ?? []).map((o: any) => {
    const io = o?._embedded?.indexableObject ?? {}, m = io.metadata ?? {};
    const v = (k: string) => (m[k] ?? []).map((x: any) => String(x?.value ?? ""));
    return {
      title: String(io.name ?? v("dc.title")[0] ?? "").trim(), authors: v("dc.contributor.author").map(flipName),
      date: v("dc.date.issued")[0] ?? "", type: [...v("dc.type"), ...v("thesis.degree.name")].join(" "),
      abstract: v("dc.description.abstract").join(" "),
      url: io.handle ? `https://hdl.handle.net/${io.handle}` : `https://ecommons.cornell.edu/items/${io.uuid}`,
      repo: "Cornell eCommons",
    };
  });
}

export function thesesToSignals(c: Candidate, theses: Thesis[], keywords: string, now = new Date()): Signal[] {
  const cutoff = now.getTime() - 730 * 24 * 3600 * 1000;
  const out: Signal[] = [];
  const seen = new Set<string>();
  for (const t of theses) {
    if (!/thes[ie]s|dissertation/i.test(t.type) || !t.authors.some((a) => namesMatch(a, c.name))) continue;
    const key = t.title.toLowerCase();
    if (!t.title || seen.has(key)) continue;
    const ts = Date.parse(t.date.length === 4 ? `${t.date}-06-30` : t.date);
    const recent = Number.isFinite(ts) && ts >= cutoff;
    const onTopic = topicOverlap(c, `${t.title} ${t.abstract}`, keywords);
    if (!recent && !onTopic) continue;
    seen.add(key);
    if (recent) out.push({ source: "dissertations", stage: 4, kind: "dissertation", weight: 6, url: t.url, date: t.date || null,
      label: `Dissertation deposited ${t.date.slice(0, 7)}: ${t.title} (${t.repo})` });
    if (onTopic) out.push({ source: "dissertations", stage: 1, kind: "thesis_topic_match", weight: 2, url: t.url, date: t.date || null,
      label: `Thesis on-topic: ${t.title} (${t.repo}, ${t.date.slice(0, 4)})` });
  }
  out.sort((a, b) => b.weight - a.weight || String(b.date).localeCompare(String(a.date)));
  const capped: Signal[] = [];
  let total = 0;
  for (const s of out) if (total + s.weight <= 8 && !capped.some((x) => x.kind === s.kind)) { total += s.weight; capped.push(s); }
  return capped;
}

async function getJson(url: string): Promise<any> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

export const source: SourceModule = {
  id: "dissertations",
  enabled: () => true,
  async enrich(c: Candidate, ctx: SourceContext): Promise<Signal[]> {
    try {
      if (!c?.name) return [];
      const insts = c.institutions?.length ? c.institutions : ["Columbia", "Cornell"];
      const q = encodeURIComponent(c.name);
      const jobs: Promise<Thesis[]>[] = [];
      if (mentionsInstitution("Columbia University", insts)) jobs.push(getJson(
        `https://academiccommons.columbia.edu/api/v1/search?search_type=keyword&q=${q}&type[]=Theses&per_page=10`).then(parseAcademicCommons));
      if (mentionsInstitution("Cornell University", insts)) jobs.push(getJson(
        `https://ecommons.cornell.edu/server/api/discover/search/objects?query=${q}&size=10&dsoType=item&f.itemtype=${encodeURIComponent("dissertation or thesis,equals")}`).then(parseECommons));
      if (!jobs.length) return [];
      const theses = (await Promise.all(jobs)).flat();
      return thesesToSignals(c, theses, ctx?.keywords ?? "");
    } catch {
      return [];
    }
  },
};
