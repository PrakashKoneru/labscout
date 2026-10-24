// SEC EDGAR Form D (Reg D private placements) — spinout intent (stage 4): the candidate is a named related person
// (executive officer / director / promoter) of a young company that raised money.
// Search (verified 200, no key; SEC requires a UA with contact, <=10 req/s):
//   https://efts.sec.gov/LATEST/search-index?q=%22First%20Last%22&forms=D  -> hits.hits[]._source {display_names[],
//   ciks[], file_date, form "D" | "D/A", adsh, biz_states[], biz_locations[], inc_states[]}, _id "<adsh>:primary_doc.xml".
// The full-text hit only says the name appears; we then fetch the newest filing's primary_doc.xml (max 2 entities) and
// require a relatedPersonInfo whose name matches, plus yearOfInc <withinFiveYears>, and skip pooled investment funds.
// Corroboration: issuer/person address in NY, or topic overlap / distinctive paper-title token in the entity name.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule, SourceContext } from "./types.ts";
import { UA, capTotal, entityCorroborated, within } from "./entity.ts";
import { namesMatch } from "./match.ts";

export type EdgarHit = { _id: string; _source: { display_names?: string[]; ciks?: string[]; file_date?: string; form?: string;
  adsh?: string; biz_states?: string[]; biz_locations?: string[] } };

export type FormD = { entity: string; state: string | null; withinFiveYears: boolean | null; yearOfInc: number | null;
  fund: boolean; industry: string | null; amountSold: number | null;
  persons: { name: string; state: string | null; relationships: string[] }[] };

const tag = (xml: string, t: string) => xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1]?.trim() ?? null;
const tags = (xml: string, t: string) => [...xml.matchAll(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, "g"))].map((m) => m[1].trim());

export function parseFormD(xml: string): FormD | null {
  const issuer = tag(xml, "primaryIssuer");
  if (!issuer) return null;
  const yoi = tag(issuer, "yearOfInc") ?? "";
  const industry = tag(xml, "industryGroupType");
  const sold = Number(tag(xml, "totalAmountSold"));
  return {
    entity: tag(issuer, "entityName") ?? "", state: tag(tag(issuer, "issuerAddress") ?? "", "stateOrCountry"),
    withinFiveYears: /<withinFiveYears>true/.test(yoi) ? true : /<overFiveYears>true/.test(yoi) ? false : null,
    yearOfInc: Number(tag(yoi, "value")) || null, industry, fund: /pooled investment fund/i.test(industry ?? ""),
    amountSold: Number.isFinite(sold) && sold > 0 ? sold : null,
    persons: tags(xml, "relatedPersonInfo").map((p) => ({
      name: [tag(p, "firstName"), tag(p, "middleName"), tag(p, "lastName")].filter(Boolean).join(" "),
      state: tag(tag(p, "relatedPersonAddress") ?? "", "stateOrCountry"), relationships: tags(p, "relationship"),
    })),
  };
}

export function entityName(h: EdgarHit): string {
  return (h._source.display_names?.[0] ?? "").replace(/\s*\(CIK \d+\)\s*$/, "").trim();
}

/** Group hits by issuer CIK (newest filing first). */
export function groupHits(hits: EdgarHit[]): { cik: string; hits: EdgarHit[] }[] {
  const by = new Map<string, EdgarHit[]>();
  for (const h of hits) {
    const cik = h?._source?.ciks?.[0];
    if (!cik || !/^D(\/A)?$/.test(h._source.form ?? "")) continue;
    by.set(cik, [...(by.get(cik) ?? []), h]);
  }
  return [...by].map(([cik, hs]) => ({ cik, hits: hs.sort((a, b) => String(b._source.file_date).localeCompare(String(a._source.file_date))) }))
    .sort((a, b) => String(b.hits[0]._source.file_date).localeCompare(String(a.hits[0]._source.file_date)));
}

/** One signal per issuer: +10 for the first filing, +3 per further filing (amendments / new rounds). `doc` = parsed primary_doc
 *  of the newest filing (null if unavailable -> fall back to hit metadata: all of the person's filings must be < 5 y old). */
export function formDToSignal(c: Candidate, g: { cik: string; hits: EdgarHit[] }, doc: FormD | null, keywords = "", now = Date.now()): Signal | null {
  const newest = g.hits[0]._source;
  if (!within(newest.file_date, 5, now)) return null;
  const name = doc?.entity || entityName(g.hits[0]);
  if (doc) {
    if (doc.fund || doc.withinFiveYears === false) return null;
    if (doc.yearOfInc && doc.yearOfInc < new Date(now).getUTCFullYear() - 5) return null;
  } else if (!g.hits.every((h) => within(h._source.file_date, 5, now))) return null;
  if (/\b(fund|l\.?p\.?|capital partners)\b/i.test(name)) return null;
  const person = doc?.persons.find((p) => namesMatch(p.name, c.name));
  if (doc && !person) return null;                                         // full-text hit was a namesake/other context
  const ny = newest.biz_states?.includes("NY") || doc?.state === "NY" || person?.state === "NY";
  if (!ny && !entityCorroborated(c, name, doc?.industry ?? "", keywords)) return null;
  const amt = doc?.amountSold ? `, $${doc.amountSold >= 1e6 ? (doc.amountSold / 1e6).toFixed(1) + "M" : Math.round(doc.amountSold / 1e3) + "k"} sold` : "";
  const role = person?.relationships.length ? ` (${person.relationships.join("/")})` : "";
  return {
    source: "edgar", stage: 4, kind: "form_d", weight: 10 + 3 * (g.hits.length - 1), date: newest.file_date ?? null,
    label: `SEC Form D: ${name} (filed ${newest.file_date}${g.hits.length > 1 ? `, ${g.hits.length} filings` : ""}${amt}) names ${c.name}${role}`,
    url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${g.cik}&type=D`,
  };
}

async function get(url: string): Promise<Response | null> {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json, text/xml" }, signal: AbortSignal.timeout(12000) });
    return r.ok ? r : null;
  } catch {
    return null;
  }
}

export const source: SourceModule = {
  id: "edgar",
  enabled: () => true,
  async enrich(c: Candidate, ctx: SourceContext): Promise<Signal[]> {
    try {
      if (!c?.name || c.name.trim().split(/\s+/).length < 2) return [];
      const r = await get(`https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${c.name.trim()}"`)}&forms=D`);
      if (!r) return [];
      const j: any = await r.json();
      const groups = groupHits(Array.isArray(j?.hits?.hits) ? j.hits.hits : [])
        .filter((g) => within(g.hits[0]._source.file_date, 5)).slice(0, 3);
      const out: Signal[] = [];
      for (const g of groups) {                                              // sequential: stay well under SEC's 10 req/s
        const h = g.hits[0];
        const [adsh, file] = h._id.split(":");
        const x = await get(`https://www.sec.gov/Archives/edgar/data/${Number(g.cik)}/${adsh.replace(/-/g, "")}/${file || "primary_doc.xml"}`);
        const doc = x ? parseFormD(await x.text()) : null;
        const s = formDToSignal(c, g, doc, ctx?.keywords ?? "");
        if (s) out.push(s);
      }
      return capTotal(out.slice(0, 2));
    } catch {
      return [];
    }
  },
};
