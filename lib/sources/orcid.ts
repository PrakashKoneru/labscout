// ORCID — self-reported employments and fundings (stages 3/4/6). Only runs when the candidate has an ORCID iD.
// Endpoints (verified 200, no key): https://pub.orcid.org/v3.0/<id>/employments and /fundings (Accept: application/json).
// Real fields: employments["affiliation-group"][].summaries[]["employment-summary"] {organization{name}, "role-title",
// "department-name", "start-date"{year{value},month{value}}, "end-date" (null = current), url{value}};
// fundings.group[]["funding-summary"][] {title{title{value}}, type ("award"|"grant"|"contract"|"salary-award"), organization{name},
// "start-date", "end-date", url, "external-ids"}. Most student records are sparse (many have empty groups).
// Disambiguation: ORCID iD equality — the record belongs to the candidate by construction.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";

const UA = "labscout/0.1 (mailto:jak@protocogni.com)";
export const ACADEMIC = /universit|college|school|institut|academy|hospital|medical center|medicine|laborator|national lab|foundation|\bnih\b|\bnsf\b|government|ministry|department of|council|agency/i;
const FOUNDER = /\b(co-?founder|founder|ceo|cto|coo|chief\b)/i;

type YMD = { year?: { value?: string } | null; month?: { value?: string } | null } | null | undefined;
export type OrcidEmployment = { organization?: { name?: string }; "role-title"?: string | null; "department-name"?: string | null;
  "start-date"?: YMD; "end-date"?: YMD; url?: { value?: string } | null };
export type OrcidFunding = { title?: { title?: { value?: string } }; type?: string; organization?: { name?: string };
  "start-date"?: YMD; "end-date"?: YMD; url?: { value?: string } | null };

export function bareOrcid(o: string | null | undefined): string | null {
  const m = String(o ?? "").match(/\d{4}-\d{4}-\d{4}-\d{3}[\dX]/i);
  return m ? m[0].toUpperCase() : null;
}

function ym(d: YMD): string | null {
  const y = d?.year?.value;
  if (!y) return null;
  const m = d?.month?.value;
  return m ? `${y}-${m.padStart(2, "0")}` : y;
}

export function parseEmployments(j: any): OrcidEmployment[] {
  const out: OrcidEmployment[] = [];
  for (const g of j?.["affiliation-group"] ?? []) for (const s of g?.summaries ?? []) if (s?.["employment-summary"]) out.push(s["employment-summary"]);
  return out;
}

export function parseFundings(j: any): OrcidFunding[] {
  const out: OrcidFunding[] = [];
  for (const g of j?.group ?? []) for (const f of g?.["funding-summary"] ?? []) if (f) out.push(f);
  return out;
}

export function orcidToSignals(orcid: string, emps: OrcidEmployment[], funds: OrcidFunding[]): Signal[] {
  const url = `https://orcid.org/${orcid}`;
  const founder: Signal[] = [], industry: Signal[] = [], fellow: Signal[] = [], grants: Signal[] = [];
  for (const e of emps) {
    const org = e.organization?.name?.trim() ?? "";
    const role = e["role-title"]?.trim() ?? "";
    const current = !e["end-date"]?.year?.value;
    const start = ym(e["start-date"]), end = ym(e["end-date"]);
    const span = `${start ?? "?"}–${current ? "present" : end ?? "?"}`;
    if (!org) continue;
    if (current && FOUNDER.test(role)) founder.push({ source: "orcid", stage: 4, kind: "founder_role", weight: 10, url, date: start,
      label: `ORCID: ${role} at ${org} (${span})` });
    else if (!ACADEMIC.test(org)) industry.push({ source: "orcid", stage: 3, kind: "industry_role", weight: 3, url, date: start,
      label: `ORCID: ${role || "role"} at ${org} (${span})` });
  }
  for (const f of funds) {
    const title = f.title?.title?.value?.trim() ?? "";
    if (!title) continue;
    const org = f.organization?.name?.trim();
    const date = ym(f["start-date"]);
    const label = `ORCID: ${title}${org ? ` — ${org}` : ""}${date ? ` (${date.slice(0, 4)})` : ""}`;
    if (f.type === "award" || f.type === "salary-award" || /fellow/i.test(title))
      fellow.push({ source: "orcid", stage: 1, kind: "fellowship", weight: 3, url, date, label });
    else grants.push({ source: "orcid", stage: 6, kind: "grant", weight: 2, url, date, label });
  }
  const byDate = (a: Signal, b: Signal) => String(b.date ?? "").localeCompare(String(a.date ?? ""));
  const all = [...founder.slice(0, 1), ...industry.sort(byDate).slice(0, 2), ...fellow.sort(byDate), ...grants.sort(byDate).slice(0, 2)];
  const out: Signal[] = [];
  let total = 0;
  for (const s of all) if (total + s.weight <= 15) { total += s.weight; out.push(s); }
  return out;
}

async function get(id: string, path: string): Promise<any> {
  const r = await fetch(`https://pub.orcid.org/v3.0/${id}/${path}`,
    { headers: { Accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`orcid ${r.status}`);
  return r.json();
}

export const source: SourceModule = {
  id: "orcid",
  enabled: () => true,
  async enrich(c: Candidate): Promise<Signal[]> {
    try {
      const id = bareOrcid(c?.orcid);
      if (!id) return [];
      const [e, f] = await Promise.all([get(id, "employments").catch(() => null), get(id, "fundings").catch(() => null)]);
      if (!e && !f) return [];
      return orcidToSignals(id, parseEmployments(e), parseFundings(f));
    } catch {
      return [];
    }
  },
};
