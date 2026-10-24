// SBIR.gov — commercialization funding (stage 4): SBIR/STTR awards whose PI is the candidate.
// STATUS: https://api.www.sbir.gov/public/api/awards returns HTTP 403 {"message":"Forbidden"} for every
// query (SBIR.gov says "APIs are currently undergoing maintenance"). The API has no person search;
// documented params are firm, agency, year, keyword, rows, start — so we search keyword=<thesis keywords>
// and match the pi_name field. Disabled unless SBIR_API_ENABLED=1 (flip on when the API returns).
// NSF SBIR/STTR awards are still detected via lib/sources/nsf.ts (fundProgramName "SBIR Phase I/II").
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule, SourceContext } from "./types.ts";
import { namesMatch } from "./match.ts";

export type SbirAward = {
  firm?: string; award_title?: string; agency?: string; branch?: string; phase?: string; program?: string;
  award_year?: string | number; award_amount?: string | number; pi_name?: string; proposal_award_date?: string;
  award_link?: string; ri_name?: string;
};

export function sbirAwardToSignal(c: Candidate, a: SbirAward): Signal | null {
  if (!a?.pi_name || !namesMatch(a.pi_name, c.name)) return null;
  const amt = Number(a.award_amount ?? 0);
  const money = amt ? ` $${amt >= 1e6 ? (amt / 1e6).toFixed(1) + "M" : Math.round(amt / 1e3) + "k"}` : "";
  return {
    source: "sbir", stage: 4, kind: "sbir_award", weight: 10,
    label: `${a.program ?? "SBIR"} ${a.phase ?? ""} — ${a.firm ?? "?"} (${a.agency ?? "?"}, ${a.award_year ?? "?"})${money}: ${a.award_title ?? ""}`.replace(/\s+/g, " "),
    url: a.award_link ? (String(a.award_link).startsWith("http") ? String(a.award_link) : `https://www.sbir.gov/awards/${a.award_link}`)
      : `https://www.sbir.gov/awards?keywords=${encodeURIComponent(a.firm ?? "")}`,
    date: a.proposal_award_date || (a.award_year ? `${a.award_year}-01-01` : null),
  };
}

export const source: SourceModule = {
  id: "sbir",
  enabled: () => process.env.SBIR_API_ENABLED === "1",
  async enrich(c: Candidate, ctx: SourceContext): Promise<Signal[]> {
    try {
      if (!c?.name) return [];
      const kw = (ctx?.keywords || ctx?.query || "").trim();
      if (!kw) return [];
      const url = `https://api.www.sbir.gov/public/api/awards?keyword=${encodeURIComponent(kw)}&rows=100`;
      const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return [];
      const j: any = await r.json();
      const list: SbirAward[] = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : [];
      const sig = list.map((a) => sbirAwardToSignal(c, a)).filter((s): s is Signal => !!s);
      return sig.slice(0, 1); // one award already = 10 points; keep source total <= 15
    } catch {
      return [];
    }
  },
};
