// NIH RePORTER — fellowships (stage 1), SBIR/STTR (stage 4), research grants (stage 6).
// Endpoint (verified 200, no key): POST https://api.reporter.nih.gov/v2/projects/search
//   {criteria:{pi_names:[{any_name}], fiscal_years:[...]}, include_fields:[ApplId, ProjectNum, ProjectTitle, Organization,
//   PrincipalInvestigators, ActivityCode, AwardAmount, ProjectStartDate, FiscalYear, AgencyIcAdmin], limit:25}
// Real fields: results[] {appl_id, project_num "5R01AI132403-09", activity_code "R01", fiscal_year, award_amount,
// project_start_date "2017-06-01T00:00:00", project_title, organization{org_name "COLUMBIA UNIVERSITY HEALTH SCIENCES" |
// "WEILL MEDICAL COLL OF CORNELL UNIV"}, principal_investigators[{first_name, middle_name, last_name, full_name}],
// agency_ic_admin{abbreviation}}. any_name is fuzzy (returns e.g. "Ryan A Harris; XIAOLING WANG" for "Harris Wang"),
// so the PI name is re-checked. One row per fiscal year/supplement -> deduped by core project number (R01AI132403).
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";
import { mentionsInstitution, namesMatch } from "./match.ts";

const UA = "labscout/0.1 (mailto:jak@protocogni.com)";

export type NihProject = { appl_id?: number; project_num?: string; activity_code?: string; fiscal_year?: number; award_amount?: number;
  project_start_date?: string; project_title?: string; organization?: { org_name?: string };
  principal_investigators?: { first_name?: string; middle_name?: string; last_name?: string; full_name?: string }[];
  agency_ic_admin?: { abbreviation?: string } };

/** "5R01AI132403-09" / "3R01CA272898-05S1" -> "R01AI132403" */
export function coreProjectNum(n?: string): string {
  const m = String(n ?? "").match(/^\d?([A-Z]\d{2}[A-Z]{2}\d{6})/i);
  return m ? m[1].toUpperCase() : String(n ?? "");
}

const isSbir = (code: string) => /^(R4[1-4]|SB1|U4[34])$/i.test(code);
const isFellow = (code: string) => /^(F\d{2}|K99|T32|T90|TL1)$/i.test(code);

function money(n?: number): string {
  if (!n) return "";
  return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`;
}

export function nihProjectToSignal(c: Candidate, p: NihProject): Signal | null {
  const pis = p.principal_investigators ?? [];
  if (!pis.some((x) => namesMatch(x.full_name ?? "", c.name) || namesMatch(`${x.first_name ?? ""} ${x.last_name ?? ""}`, c.name))) return null;
  const code = String(p.activity_code ?? "").toUpperCase();
  const org = p.organization?.org_name ?? "";
  const sbir = isSbir(code);
  if (!sbir && !mentionsInstitution(org, c.institutions)) return null; // grant elsewhere -> likely a namesake
  const date = p.project_start_date?.slice(0, 10) ?? null;
  const url = `https://reporter.nih.gov/project-details/${p.appl_id ?? p.project_num}`;
  const tail = [p.agency_ic_admin?.abbreviation, money(p.award_amount), p.fiscal_year ? `FY${p.fiscal_year}` : ""].filter(Boolean).join(", ");
  const label = `NIH ${code} ${coreProjectNum(p.project_num)} — ${org}: ${p.project_title ?? ""}${tail ? ` (${tail})` : ""}`;
  if (sbir) return { source: "nih", stage: 4, kind: "sbir_award", weight: 10, url, date, label: `${label} [SBIR/STTR]` };
  if (isFellow(code)) return { source: "nih", stage: 1, kind: "fellowship", weight: 4, url, date, label };
  return { source: "nih", stage: 6, kind: "grant", weight: 3, url, date, label };
}

/** Dedupe by core project number (keep latest fiscal year), cap grants at 2, total <= 15. */
export function nihProjectsToSignals(c: Candidate, projects: NihProject[]): Signal[] {
  const latest = new Map<string, NihProject>();
  for (const p of projects) {
    const k = coreProjectNum(p?.project_num);
    if (!k) continue;
    const prev = latest.get(k);
    if (!prev || (p.fiscal_year ?? 0) > (prev.fiscal_year ?? 0)) latest.set(k, p);
  }
  const all = [...latest.values()].map((p) => nihProjectToSignal(c, p)).filter((s): s is Signal => !!s)
    .sort((a, b) => b.weight - a.weight || String(b.date).localeCompare(String(a.date)));
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

export const source: SourceModule = {
  id: "nih",
  enabled: () => true,
  async enrich(c: Candidate): Promise<Signal[]> {
    try {
      if (!c?.name) return [];
      const y = new Date().getFullYear();
      const body = {
        criteria: { pi_names: [{ any_name: c.name }], fiscal_years: [y - 5, y - 4, y - 3, y - 2, y - 1, y] },
        include_fields: ["ApplId", "ProjectNum", "ProjectTitle", "Organization", "PrincipalInvestigators", "ActivityCode",
          "AwardAmount", "ProjectStartDate", "FiscalYear", "AgencyIcAdmin"],
        limit: 25,
      };
      const r = await fetch("https://api.reporter.nih.gov/v2/projects/search", {
        method: "POST", body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
        headers: { "user-agent": UA, Accept: "application/json", "content-type": "application/json" },
      });
      if (!r.ok) return [];
      const j: any = await r.json();
      return nihProjectsToSignals(c, Array.isArray(j?.results) ? j.results : []);
    } catch {
      return [];
    }
  },
};
