// NY State Active Corporations (data.ny.gov Socrata, no key) — spinout intent (stage 4): a recent NY corporation/LLC
// where the candidate is chairman/CEO, process agent (frequently the founder) or registered agent.
// Endpoint (verified 200): https://data.ny.gov/resource/n9v6-gdp6.json?$q=<First Last>&$where=initial_dos_filing_date > '<5y>'
// Real columns: dos_id, current_entity_name, initial_dos_filing_date, county, jurisdiction, entity_type, dos_process_name,
// dos_process_city/state, chairman_name/city/state (there is NO ceo_name column), registered_agent_name, location_*.
// $q (full-text) is ~10x faster than `upper(x) like '%LAST%'` and matches either name order. Optional NY_SOCRATA_APP_TOKEN.
// Disambiguation: name match (either order) AND (NYC-area/Tompkins county or person's city in NYC/Ithaca, or topic overlap,
// or a distinctive paper-title token in the entity name). dos_process_state is ~always NY in a NY registry, so it is not used.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule, SourceContext } from "./types.ts";
import { NYC_COUNTIES, UA, capTotal, entityCorroborated, isNycCity, personMatch, within, yearsAgo } from "./entity.ts";
import { normalizeName } from "./match.ts";

export type NyEntity = {
  dos_id: string; current_entity_name?: string; initial_dos_filing_date?: string; county?: string; jurisdiction?: string;
  entity_type?: string; dos_process_name?: string; dos_process_city?: string; dos_process_state?: string;
  chairman_name?: string; chairman_city?: string; registered_agent_name?: string; registered_agent_city?: string;
};

export function nyRole(c: Candidate, e: NyEntity): { role: string; city?: string } | null {
  if (personMatch(e.chairman_name, c.name)) return { role: "CEO/chairman", city: e.chairman_city };
  if (personMatch(e.dos_process_name, c.name)) return { role: "process agent", city: e.dos_process_city };
  if (personMatch(e.registered_agent_name, c.name)) return { role: "registered agent", city: e.registered_agent_city };
  return null;
}

export function nyEntityToSignal(c: Candidate, e: NyEntity, keywords = "", now = Date.now()): Signal | null {
  const type = (e.entity_type ?? "").toUpperCase();
  if (!/CORPORATION|LIMITED LIABILITY/.test(type) || /NOT-FOR-PROFIT|PROFESSIONAL|RELIGIOUS|COOPERATIVE/.test(type)) return null;
  if (!within(e.initial_dos_filing_date, 5, now)) return null;
  const r = nyRole(c, e);
  if (!r) return null;
  const name = e.current_entity_name ?? "";
  const nyc = NYC_COUNTIES.has(normalizeName(e.county ?? "")) || isNycCity(r.city);
  if (!nyc && !entityCorroborated(c, name, "", keywords)) return null;
  const date = (e.initial_dos_filing_date ?? "").slice(0, 10) || null;
  return {
    source: "nycorp", stage: 4, kind: "ny_entity", weight: 8, date,
    label: `NY entity: ${name} (${(e.entity_type ?? "").toLowerCase()}, filed ${date?.slice(0, 7)}, ${e.county ?? "?"} County) — ${r.role}`,
    url: `https://data.ny.gov/resource/n9v6-gdp6.json?dos_id=${encodeURIComponent(e.dos_id)}`,
  };
}

/** Newest first, max 2 entities, total <= 15. */
export function nyEntitiesToSignals(c: Candidate, rows: NyEntity[], keywords = "", now = Date.now()): Signal[] {
  const seen = new Set<string>();
  const sig = rows.filter((e) => e?.dos_id && !seen.has(e.dos_id) && seen.add(e.dos_id))
    .map((e) => nyEntityToSignal(c, e, keywords, now)).filter((s): s is Signal => !!s)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return capTotal(sig.slice(0, 2));
}

export const source: SourceModule = {
  id: "nycorp",
  enabled: () => true,
  async enrich(c: Candidate, ctx: SourceContext): Promise<Signal[]> {
    try {
      if (!c?.name || normalizeName(c.name).split(" ").length < 2) return [];
      const p = new URLSearchParams({ $q: c.name, $where: `initial_dos_filing_date > '${yearsAgo(5)}'`,
        $order: "initial_dos_filing_date DESC", $limit: "50" });
      const headers: Record<string, string> = { "user-agent": UA, accept: "application/json" };
      if (process.env.NY_SOCRATA_APP_TOKEN) headers["X-App-Token"] = process.env.NY_SOCRATA_APP_TOKEN;
      const r = await fetch(`https://data.ny.gov/resource/n9v6-gdp6.json?${p}`, { headers, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return [];
      const rows = await r.json();
      return Array.isArray(rows) ? nyEntitiesToSignals(c, rows, ctx?.keywords ?? "") : [];
    } catch {
      return [];
    }
  },
};
