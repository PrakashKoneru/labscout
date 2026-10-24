// NSF Awards — spinout intent (stage 4) + track record (stage 6): I-Corps, SBIR/STTR, PI/co-PI grants.
// Endpoint (verified 200, no key): https://api.nsf.gov/services/v1/awards.json?pdPIName=... and ?coPDPI=...
// Real fields: id, title, awardeeName, piFirstName, piLastName, pdPIName, coPDPI ["Name email", ...],
// startDate "MM/DD/YYYY", fundsObligatedAmt "100000", fundProgramName "SBIR Phase I" | "I-Corps" | ...
// GRFP: fellowships are awarded to the institution with the campus coordinator as PI, so fellows
// do NOT appear by name in this API — GRFP is not detectable here (see docs/SOURCES.md).
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";
import { mentionsInstitution, namesMatch } from "./match.ts";

export type NsfAward = {
  id: string; title?: string; awardeeName?: string; piFirstName?: string; piLastName?: string; pdPIName?: string;
  coPDPI?: string[] | string; startDate?: string; fundsObligatedAmt?: string; fundProgramName?: string | string[];
};

const FIELDS = "id,title,awardeeName,piFirstName,piLastName,pdPIName,coPDPI,startDate,expDate,fundsObligatedAmt,fundProgramName";

function stripEmail(s: string): string { return s.replace(/\s+\S+@\S+\s*$/, "").trim(); }

export function nsfRole(c: Candidate, a: NsfAward): "PI" | "co-PI" | null {
  const pi = a.pdPIName || `${a.piFirstName ?? ""} ${a.piLastName ?? ""}`;
  if (namesMatch(pi, c.name) || namesMatch(`${a.piFirstName ?? ""} ${a.piLastName ?? ""}`, c.name)) return "PI";
  const co = Array.isArray(a.coPDPI) ? a.coPDPI : a.coPDPI ? [a.coPDPI] : [];
  return co.some((x) => namesMatch(stripEmail(x), c.name)) ? "co-PI" : null;
}

function isoDate(mdY?: string): string | null {
  const m = mdY?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

function money(a?: string): string {
  const n = Number(a ?? 0);
  if (!n) return "";
  return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`;
}

/** Signals for one award (empty if the candidate is not on it or institution evidence is missing). */
export function nsfAwardToSignals(c: Candidate, a: NsfAward): Signal[] {
  const role = nsfRole(c, a);
  if (!role) return [];
  const prog = (Array.isArray(a.fundProgramName) ? a.fundProgramName.join(" ") : a.fundProgramName) ?? "";
  const text = `${a.title ?? ""} ${prog}`;
  const icorps = /i-?corps/i.test(text);
  const sbir = /\b(sbir|sttr)\b/i.test(prog) || /\b(sbir|sttr)\b/i.test(a.title ?? "");
  const atOurs = mentionsInstitution(a.awardeeName, c.institutions);
  if (!atOurs && !sbir && !icorps) return []; // generic grant elsewhere -> likely a namesake
  const date = isoDate(a.startDate);
  const year = date?.slice(0, 4) ?? "";
  const amt = money(a.fundsObligatedAmt);
  const url = `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${a.id}`;
  const tail = [amt, year].filter(Boolean).join(", ");
  const base = { source: "nsf" as const, url, date };
  if (sbir) return [{ ...base, stage: 4, kind: "sbir_award", weight: 10,
    label: `NSF ${prog || "SBIR/STTR"} (${role}) — ${a.awardeeName ?? "?"}: ${a.title ?? ""}${tail ? ` (${tail})` : ""}` }];
  if (icorps) return [{ ...base, stage: 4, kind: "icorps", weight: 8,
    label: `NSF I-Corps (${role}): ${a.title ?? ""}${tail ? ` (${tail})` : ""}` }];
  return [{ ...base, stage: 6, kind: "grant", weight: 3,
    label: `NSF grant (${role}, ${a.awardeeName}): ${a.title ?? ""}${tail ? ` (${tail})` : ""}` }];
}

/** Dedupe by award id, cap generic grants at 2, keep total <= 15. */
export function nsfAwardsToSignals(c: Candidate, awards: NsfAward[]): Signal[] {
  const seen = new Set<string>();
  const all: Signal[] = [];
  for (const a of awards) {
    if (!a?.id || seen.has(a.id)) continue;
    seen.add(a.id);
    all.push(...nsfAwardToSignals(c, a));
  }
  all.sort((x, y) => y.weight - x.weight || String(y.date).localeCompare(String(x.date)));
  const out: Signal[] = [];
  let grants = 0, total = 0;
  for (const s of all) {
    if (s.kind === "grant" && grants >= 2) continue;
    if (total + s.weight > 15) continue;
    if (s.kind === "grant") grants++;
    total += s.weight;
    out.push(s);
  }
  return out;
}

async function query(param: string, name: string): Promise<NsfAward[]> {
  try {
    const url = `https://api.nsf.gov/services/v1/awards.json?${param}=${encodeURIComponent(name)}&printFields=${FIELDS}&rpp=25`;
    const r = await fetch(url, { headers: { "user-agent": "labscout/0.1" }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) return [];
    const j: any = await r.json();
    return Array.isArray(j?.response?.award) ? j.response.award : [];
  } catch {
    return [];
  }
}

export const source: SourceModule = {
  id: "nsf",
  enabled: () => true,
  async enrich(c: Candidate): Promise<Signal[]> {
    try {
      if (!c?.name) return [];
      const [pi, co] = await Promise.all([query("pdPIName", c.name), query("coPDPI", c.name)]);
      return nsfAwardsToSignals(c, [...pi, ...co]);
    } catch {
      return [];
    }
  },
};
