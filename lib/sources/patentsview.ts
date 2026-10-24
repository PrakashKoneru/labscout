// USPTO PatentsView — IP movement (stage 4): patents where the person is an inventor;
// university-assigned (patent filed) vs company/self-assigned (IP moving out of the lab).
// STATUS: PatentSearch API (search.patentsview.org) is NXDOMAIN since the USPTO Open Data Portal
// migration (2026-03-20); USPTO has no relaunch date and old keys won't work on ODP.
// enabled() requires PATENTSVIEW_API_KEY; PATENTSVIEW_API_URL overrides the base URL for when it returns.
// Query format per the PatentSearch docs: q={"_and":[{"inventors.inventor_name_first":..},{"inventors.inventor_name_last":..}]}
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";
import { mentionsInstitution, namesMatch, splitName } from "./match.ts";

export type PvPatent = {
  patent_id: string; patent_title?: string; patent_date?: string;
  inventors?: { inventor_name_first?: string; inventor_name_last?: string; inventor_city?: string; inventor_state?: string }[];
  assignees?: { assignee_organization?: string | null; assignee_individual_name_first?: string | null; assignee_individual_name_last?: string | null }[];
};

const UNIVERSITY = /\b(university|college|institute of technology|trustees|regents|school of medicine|research foundation)\b/i;

export function buildPatentQuery(name: string): { q: string; f: string; o: string } {
  const { first, last } = splitName(name);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return {
    q: JSON.stringify({ _and: [{ "inventors.inventor_name_first": cap(first) }, { "inventors.inventor_name_last": cap(last) }] }),
    f: JSON.stringify(["patent_id", "patent_title", "patent_date", "inventors.inventor_name_first", "inventors.inventor_name_last",
      "inventors.inventor_city", "inventors.inventor_state", "assignees.assignee_organization",
      "assignees.assignee_individual_name_first", "assignees.assignee_individual_name_last"]),
    o: JSON.stringify({ size: 25 }),
  };
}

export function patentToSignals(c: Candidate, p: PvPatent): Signal[] {
  const inv = (p.inventors ?? []).some((i) => namesMatch(`${i.inventor_name_first ?? ""} ${i.inventor_name_last ?? ""}`, c.name));
  if (!inv) return [];
  const orgs = (p.assignees ?? []).map((a) => a.assignee_organization ?? "").filter(Boolean);
  const selfAssigned = (p.assignees ?? []).some((a) => namesMatch(`${a.assignee_individual_name_first ?? ""} ${a.assignee_individual_name_last ?? ""}`, c.name));
  const atOurs = orgs.some((o) => mentionsInstitution(o, c.institutions));
  const nyInventor = (p.inventors ?? []).some((i) => namesMatch(`${i.inventor_name_first ?? ""} ${i.inventor_name_last ?? ""}`, c.name) && /^(NY|New York)$/i.test(i.inventor_state ?? ""));
  if (!atOurs && !nyInventor) return []; // disambiguation: need institution or NY-based inventor evidence
  const base = { source: "patentsview" as const, url: `https://patents.google.com/patent/US${p.patent_id}`, date: p.patent_date ?? null };
  const yr = (p.patent_date ?? "").slice(0, 4);
  const university = orgs.length > 0 && orgs.every((o) => UNIVERSITY.test(o));
  if (university) return [{ ...base, stage: 4, kind: "patent", weight: 4,
    label: `Patent US${p.patent_id}: ${p.patent_title ?? ""} — assigned to ${orgs[0]} (${yr})` }];
  if (selfAssigned || orgs.length > 0) return [{ ...base, stage: 4, kind: "ip_movement", weight: 8,
    label: `Patent US${p.patent_id}: ${p.patent_title ?? ""} — assigned to ${selfAssigned ? "inventor" : orgs[0]} (${yr})` }];
  return [];
}

export function patentsToSignals(c: Candidate, ps: PvPatent[]): Signal[] {
  const out: Signal[] = [];
  let total = 0;
  for (const s of ps.flatMap((p) => patentToSignals(c, p)).sort((a, b) => b.weight - a.weight)) {
    if (total + s.weight > 15) continue;
    total += s.weight; out.push(s);
  }
  return out;
}

export const source: SourceModule = {
  id: "patentsview",
  enabled: () => !!process.env.PATENTSVIEW_API_KEY,
  async enrich(c: Candidate): Promise<Signal[]> {
    try {
      const key = process.env.PATENTSVIEW_API_KEY;
      if (!key || !c?.name) return [];
      const base = process.env.PATENTSVIEW_API_URL || "https://search.patentsview.org/api/v1/patent/";
      const { q, f, o } = buildPatentQuery(c.name);
      const url = `${base}?q=${encodeURIComponent(q)}&f=${encodeURIComponent(f)}&o=${encodeURIComponent(o)}`;
      const r = await fetch(url, { headers: { "X-Api-Key": key, accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return [];
      const j: any = await r.json();
      return patentsToSignals(c, Array.isArray(j?.patents) ? j.patents : []);
    } catch {
      return [];
    }
  },
};
