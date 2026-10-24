// CORDIS — EU research funding (stage 6): Horizon / ERC / MSCA projects the candidate published under.
// Endpoint (verified 200, no key): https://cordis.europa.eu/api/search/results?q='<First Last>'&format=json&num=25
// CORDIS does not expose project participants as people. A quoted-name search returns (a) "projectPublication" results
// {authors:"A, B, C", title, doi, publishedYear, journalTitle, relatedProjectReference, relatedProjectAcronym} and
// (b) "project" records {id, acronym, title, teaser, startDate:"1 {{month_09}} 2025", programme[]} whose full text matched.
// Person evidence therefore comes only from publication author lists: the name must match an author AND the publication
// must be the candidate's (shared DOI/title) or mention their institution, or be topically on-thesis. Project records are
// only used to label the project. One signal per distinct EU project.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule, SourceContext } from "./types.ts";
import { mentionsInstitution, namesMatch, sharesWork, topicOverlap } from "./match.ts";

const UA = "labscout/0.1 (mailto:jak@protocogni.com)";

export type CordisResult = { contentType?: string; pseudoContentType?: string; id?: string; reference?: string; acronym?: string;
  title?: string; teaser?: string; startDate?: string; programme?: { title?: string }[]; authors?: string; doi?: string;
  publishedYear?: string; journalTitle?: string; relatedProjectReference?: string; relatedProjectAcronym?: string };

export function cordisDate(s?: string): string | null {
  const m = s?.match(/(\d{1,2}) \{\{month_(\d{2})\}\} (\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1].padStart(2, "0")}` : null;
}

export function cordisToSignals(c: Candidate, results: CordisResult[], keywords: string): Signal[] {
  const projects = new Map<string, CordisResult>();
  for (const r of results) if (r.contentType === "project" && (r.id || r.reference)) projects.set(String(r.id ?? r.reference), r);
  const hits = new Map<string, CordisResult>();
  for (const r of results) {
    if (r.pseudoContentType !== "projectPublication" || !r.relatedProjectReference) continue;
    const authors = String(r.authors ?? "").split(/\s*[,;]\s*/);
    if (!authors.some((a) => namesMatch(a, c.name))) continue;
    const p = projects.get(r.relatedProjectReference);
    const ok = sharesWork(c, r.title, r.doi) || mentionsInstitution(`${r.journalTitle ?? ""} ${r.title ?? ""}`, c.institutions) ||
      topicOverlap(c, `${r.title ?? ""} ${p?.title ?? ""} ${p?.teaser ?? ""}`, keywords);
    if (ok && !hits.has(r.relatedProjectReference)) hits.set(r.relatedProjectReference, r);
  }
  const out: Signal[] = [];
  for (const [ref, pub] of hits) {
    const p = projects.get(ref);
    const prog = p?.programme?.[0]?.title;
    out.push({ source: "cordis", stage: 6, kind: "eu_grant", weight: 3,
      url: `https://cordis.europa.eu/project/id/${ref}`, date: cordisDate(p?.startDate) ?? (pub.publishedYear || null),
      label: `CORDIS: EU project ${pub.relatedProjectAcronym ?? p?.acronym ?? ref}${p?.title ? ` — ${p.title}` : ""}${prog ? ` (${prog})` : ""}; co-authored "${pub.title}"` });
    if (out.length >= 2) break;
  }
  return out;
}

export const source: SourceModule = {
  id: "cordis",
  enabled: () => true,
  async enrich(c: Candidate, ctx: SourceContext): Promise<Signal[]> {
    try {
      if (!c?.name) return [];
      const q = encodeURIComponent(`'${c.name.replace(/'/g, " ")}'`);
      const r = await fetch(`https://cordis.europa.eu/api/search/results?q=${q}&format=json&num=25`,
        { headers: { "user-agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return [];
      const j: any = await r.json();
      return cordisToSignals(c, Array.isArray(j?.payload?.results) ? j.payload.results : [], ctx?.keywords ?? "");
    } catch {
      return [];
    }
  },
};
