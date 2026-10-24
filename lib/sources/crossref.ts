// Crossref — commercial pull (stage 3): industry funders and company co-authors on the candidate's own papers.
// Endpoint (verified 200, no key, polite pool via ?mailto=): https://api.crossref.org/works/<doi>
// Real fields: message.title[0], message.funder[] {name, DOI?, award[]?}, message.author[] {given, family, affiliation[{name}]}.
// Quirks: arXiv DOIs (10.48550) are DataCite, not Crossref -> 404, so they are skipped. Funder DOIs are sometimes
// mis-asserted (e.g. "AFOSR" tagged with Google's 10.13039/100006785), so we classify by funder *name* only.
// Disambiguation is implicit: only DOIs already attributed to the candidate (OpenAlex works) are queried.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";
import { namesMatch, normalizeDoi } from "./match.ts";

const UA = "labscout/0.1 (mailto:jak@protocogni.com)";
const CORPS = /\b(google|deepmind|microsoft|amazon|aws|meta|facebook|nvidia|intel|ibm|samsung|apple|openai|anthropic|qualcomm|adobe|bosch|siemens|toyota|honda|sony|huawei|alibaba|tencent|baidu|bytedance|salesforce|oracle|cisco|netflix|uber|snap|pfizer|novartis|roche|genentech|merck|johnson\s*&\s*johnson|j\s*&\s*j|janssen|astrazeneca|gsk|glaxosmithkline|sanofi|bayer|amgen|gilead|regeneron|lilly|abbvie|bristol[- ]myers|moderna|illumina|jpmorgan|j\.?p\.? morgan|goldman sachs|morgan stanley|bloomberg|two sigma|citadel|jane street|de shaw|d\. ?e\. shaw)\b/i;
const CORP_SUFFIX = /\b(inc|llc|ltd|corp|corporation|gmbh|co\.?,? ltd|s\.?a\.?|plc|ag)\.?\s*$/i;
const CORP_WORDS = /\b(technologies|labs?|pharmaceuticals?|therapeutics|semiconductors?|biosciences)\b/i;
export const NON_COMPANY = /university|universit|college|school|institut|foundation|national|council|\bnsf\b|\bnih\b|darpa|iarpa|department|ministry|agency|academy|society|trust|fund\b|office|laborator(y|ies)|\bnasa\b|\bdoe\b|\bonr\b|\bafosr\b|\barl\b|\barmy\b|\bnavy\b|air force|government|commission|hospital|medical center|sloan|simons|packard|keck|moore|schmidt|wellcome|howard hughes|hhmi|center|centre|program/i;

/** Company heuristic: allowlisted corporate name, or corporate suffix/word without any academic/government marker. */
export function isCompany(name: string | null | undefined): boolean {
  const n = String(name ?? "").trim();
  if (!n) return false;
  if (CORPS.test(n)) return !/\b(university|foundation)\b/i.test(n);
  if (NON_COMPANY.test(n)) return false;
  return CORP_SUFFIX.test(n) || CORP_WORDS.test(n);
}

export type CrossrefWork = { DOI?: string; title?: string[]; funder?: { name?: string; DOI?: string; award?: string[] }[];
  author?: { given?: string; family?: string; affiliation?: { name?: string }[] }[]; created?: { "date-time"?: string } };

/** Signals from one Crossref work record (the candidate is already an author via OpenAlex). */
export function crossrefToSignals(c: Candidate, m: CrossrefWork, date: string | null = null): Signal[] {
  const doi = normalizeDoi(m?.DOI);
  if (!doi) return [];
  const title = (m.title?.[0] ?? "").replace(/\s+/g, " ").trim();
  const url = `https://doi.org/${doi}`;
  const out: Signal[] = [];
  const seen = new Set<string>();
  for (const f of m.funder ?? []) {
    const name = (f?.name ?? "").trim();
    if (!isCompany(name) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ source: "crossref", stage: 3, kind: "industry_funder", weight: 3, url, date,
      label: `Crossref: funded by ${name}${f.award?.length && !/^n\/?a$/i.test(f.award[0]) ? ` (${f.award[0]})` : ""} — ${title}` });
  }
  const orgs = new Set<string>();
  for (const a of m.author ?? []) {
    if (namesMatch(`${a.given ?? ""} ${a.family ?? ""}`, c.name)) continue; // the candidate's own affiliation is not "co-author"
    for (const af of a.affiliation ?? []) {
      const org = String(af?.name ?? "").split(",")[0].trim();
      if (isCompany(org)) orgs.add(org);
    }
  }
  for (const o of orgs) out.push({ source: "crossref", stage: 3, kind: "company_coauthor", weight: 2, url, date,
    label: `Crossref: co-author at ${o} — ${title}` });
  return out;
}

/** Dedupe (kind + org), cap industry_funder at 3 and company_coauthor at 2, total <= 15. */
export function capCrossref(signals: Signal[]): Signal[] {
  const max: Record<string, number> = { industry_funder: 3, company_coauthor: 2 };
  const n: Record<string, number> = {}, seen = new Set<string>();
  const out: Signal[] = [];
  let total = 0;
  for (const s of signals) {
    const key = `${s.kind}|${s.label.split(" — ")[0].replace(/ \(.*\)$/, "").toLowerCase()}`;
    if (seen.has(key) || (n[s.kind] ?? 0) >= (max[s.kind] ?? 0) || total + s.weight > 15) continue;
    seen.add(key); n[s.kind] = (n[s.kind] ?? 0) + 1; total += s.weight; out.push(s);
  }
  return out;
}

async function getWork(doi: string): Promise<CrossrefWork | null> {
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=jak@protocogni.com`,
      { headers: { "user-agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    return (await r.json())?.message ?? null;
  } catch {
    return null;
  }
}

export const source: SourceModule = {
  id: "crossref",
  enabled: () => true,
  async enrich(c: Candidate): Promise<Signal[]> {
    try {
      const works = (c?.works ?? []).map((w) => ({ w, doi: normalizeDoi(w.doi) }))
        .filter((x) => x.doi && !x.doi.startsWith("10.48550/")).slice(0, 5);
      const recs = await Promise.all(works.map((x) => getWork(x.doi!)));
      const all = recs.flatMap((m, i) => (m ? crossrefToSignals(c, m, works[i].w.year ? `${works[i].w.year}` : null) : []));
      return capCrossref(all);
    } catch {
      return [];
    }
  },
};
