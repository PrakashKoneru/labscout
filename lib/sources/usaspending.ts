// USAspending.gov — early traction (stage 5): federal grants/contracts to a company the candidate is already linked to.
// WAVE 2: the API cannot search by person, so entity names come from wave-1 signals (ny_entity, form_d, sbir_award labels,
// ORCID founder_role). No entity names -> no request.
// Endpoint (verified 200, no key): POST https://api.usaspending.gov/api/v2/search/spending_by_award/
//   {filters:{recipient_search_text:[name], time_period:[{start_date,end_date}], award_type_codes:[...]}, fields:[...], limit}
// Quirk: award_type_codes must come from ONE group (422 otherwise) -> one request for grants ["02","03","04","05"] and one
// for contracts ["A","B","C","D"]. recipient_search_text is fuzzy (substring), so we require the normalized recipient
// name (legal suffixes stripped) to equal the entity name. time_period filters on action date, so Start Date is re-checked.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";
import { UA, capTotal, entityNamesFromSignals, normalizeEntity, within, yearsAgo } from "./entity.ts";

export type UsaAward = { "Award ID"?: string; "Recipient Name"?: string; "Award Amount"?: number; "Start Date"?: string;
  "Awarding Agency"?: string; Description?: string; generated_internal_id?: string };

const FIELDS = ["Award ID", "Recipient Name", "Award Amount", "Start Date", "Awarding Agency", "Description", "generated_internal_id"];
const GROUPS = [["02", "03", "04", "05"], ["A", "B", "C", "D"]];

export function usaAwardToSignal(entity: string, a: UsaAward, now = Date.now()): Signal | null {
  if (!a?.generated_internal_id || normalizeEntity(a["Recipient Name"]) !== normalizeEntity(entity)) return null;
  if (!within(a["Start Date"], 5, now)) return null;
  const n = Number(a["Award Amount"] ?? 0);
  const amt = n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`;
  const desc = (a.Description ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  return {
    source: "usaspending", stage: 5, kind: "federal_award", weight: 5, date: a["Start Date"] ?? null,
    label: `USAspending: ${a["Awarding Agency"] ?? "?"} → ${a["Recipient Name"]} ${amt} (${(a["Start Date"] ?? "").slice(0, 4)}) ${desc}`.trim(),
    url: `https://www.usaspending.gov/award/${encodeURIComponent(a.generated_internal_id)}`,
  };
}

/** Dedupe by award id, largest first, max 3 (= 15). */
export function usaAwardsToSignals(pairs: { entity: string; award: UsaAward }[], now = Date.now()): Signal[] {
  const seen = new Set<string>();
  const out: { s: Signal; amt: number }[] = [];
  for (const { entity, award } of pairs) {
    const id = award?.generated_internal_id;
    if (!id || seen.has(id)) continue;
    const s = usaAwardToSignal(entity, award, now);
    if (s) { seen.add(id); out.push({ s, amt: Number(award["Award Amount"] ?? 0) }); }
  }
  return capTotal(out.sort((a, b) => b.amt - a.amt).slice(0, 3).map((x) => x.s));
}

async function search(name: string, codes: string[]): Promise<UsaAward[]> {
  try {
    const body = { filters: { recipient_search_text: [name], award_type_codes: codes,
      time_period: [{ start_date: yearsAgo(5), end_date: new Date().toISOString().slice(0, 10) }] },
      fields: FIELDS, limit: 10, sort: "Award Amount", order: "desc" };
    const r = await fetch("https://api.usaspending.gov/api/v2/search/spending_by_award/", {
      method: "POST", headers: { "content-type": "application/json", "user-agent": UA }, body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000) });
    if (!r.ok) return [];
    const j: any = await r.json();
    return Array.isArray(j?.results) ? j.results : [];
  } catch {
    return [];
  }
}

export const source: SourceModule = {
  id: "usaspending",
  wave: 2,
  enabled: () => true,
  async enrich(c: Candidate): Promise<Signal[]> {
    try {
      const names = entityNamesFromSignals(c).slice(0, 3);
      if (!names.length) return [];
      const res = await Promise.all(names.flatMap((n) => GROUPS.map(async (g) => (await search(n, g)).map((award) => ({ entity: n, award })))));
      return usaAwardsToSignals(res.flat());
    } catch {
      return [];
    }
  },
};
