// Shared helpers for entity-formation / money sources (nycorp, edgar, usaspending, clinicaltrials, yc).
import type { Candidate } from "../types.ts";
import type { Signal } from "./types.ts";
import { mentionsInstitution, namesMatch, normalizeName, tokens, topicOverlap } from "./match.ts";

export const UA = "labscout/0.1 (jak@protocogni.com)";
export const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/** ISO date (YYYY-MM-DD) `years` before `now`. */
export function yearsAgo(years: number, now = Date.now()): string {
  return new Date(now - years * YEAR_MS).toISOString().slice(0, 10);
}

/** True when `date` (any Date.parse-able string) is within the last `years` years. */
export function within(date: string | null | undefined, years = 5, now = Date.now()): boolean {
  const t = Date.parse(String(date ?? ""));
  return Number.isFinite(t) && t >= now - years * YEAR_MS && t <= now + 31 * 24 * 3600 * 1000;
}

/** Name match in either order: registries often store "LAST FIRST" or "LAST, FIRST MIDDLE". */
export function personMatch(recordName: string | null | undefined, candidateName: string): boolean {
  const n = normalizeName(recordName ?? "");
  if (!n) return false;
  if (namesMatch(n, candidateName)) return true;
  const p = n.split(" ");
  if (p.length < 2) return false;
  return namesMatch([...p.slice(1), p[0]].join(" "), candidateName);           // "korzen oliver" -> "oliver korzen"
}

const ENTITY_SUFFIX = /\b(inc|incorporated|llc|l l c|ltd|limited|corp|corporation|co|company|pbc|plc|lp|llp|pllc|p c|pc)\b/g;
/** Normalized company name without legal suffixes ("Acme AI, Inc." -> "acme ai"). */
export function normalizeEntity(s: string | null | undefined): string {
  return normalizeName(s ?? "").replace(ENTITY_SUFFIX, " ").replace(/\s+/g, " ").trim();
}

const GENERIC = new Set(["group", "holdings", "holding", "technologies", "technology", "solutions", "services", "consulting",
  "capital", "partners", "systems", "global", "ventures", "management", "international", "enterprises", "labs", "health",
  "therapeutics", "sciences", "bio", "network", "networks", "digital", "media", "design", "research", "foundation", "america", "york", "new"]);

/** Entity name contains a distinctive (non-generic, >3 chars) token from one of the candidate's paper titles. */
export function entityMatchesTitles(c: Candidate, entity: string): boolean {
  const e = [...tokens(normalizeEntity(entity))].filter((t) => !GENERIC.has(t));
  if (!e.length) return false;
  const titles = new Set((c.works ?? []).flatMap((w) => [...tokens(w.title ?? "")]));
  return e.some((t) => titles.has(t));
}

/** Topical corroboration for a company record: keyword/title overlap of name+description, or distinctive title token in the name. */
export function entityCorroborated(c: Candidate, entity: string, description: string, keywords: string): boolean {
  return topicOverlap(c, `${entity} ${description}`, keywords) || entityMatchesTitles(c, entity);
}

// NYC metro counties + Tompkins (Ithaca, Cornell main campus).
export const NYC_COUNTIES = new Set(["new york", "kings", "queens", "bronx", "richmond", "westchester", "tompkins"]);
const NYC_CITIES = /^(new york|nyc|manhattan|brooklyn|queens|bronx|the bronx|staten island|long island city|astoria|flushing|jamaica|white plains|yonkers|new rochelle|scarsdale|ithaca)$/;
export function isNycCity(city: string | null | undefined): boolean { return NYC_CITIES.test(normalizeName(city ?? "")); }

/** Keep signals (assumed sorted by priority) while trimming the last one so the source total stays <= cap. */
export function capTotal(sig: Signal[], cap = 15): Signal[] {
  const out: Signal[] = [];
  let total = 0;
  for (const s of sig) {
    if (total >= cap) break;
    const w = Math.min(s.weight, cap - total);
    out.push(w === s.weight ? s : { ...s, weight: w });
    total += w;
  }
  return out;
}

/** Company names the candidate is linked to, from signals collected in wave 1 (NY entity, Form D, SBIR, ORCID founder role,
 *  GitHub company field). University names are dropped. */
export function entityNamesFromSignals(c: Candidate, includeGithub = false): string[] {
  const out: string[] = [];
  const add = (s: string | undefined) => {
    const n = (s ?? "").replace(/\s+/g, " ").replace(/^[@\s]+|[\s.,;]+$/g, "").trim();
    if (n.length >= 3 && !mentionsInstitution(n, c.institutions) && !/universit|college|institute|school/i.test(n)
      && !out.some((x) => normalizeEntity(x) === normalizeEntity(n))) out.push(n);
  };
  for (const s of c.signals ?? []) {
    const l = s.label ?? "";
    if (s.kind === "ny_entity" || s.kind === "form_d") add(l.match(/^[^:]+:\s*(.+?)\s+\(/)?.[1]);
    else if (s.kind === "sbir_award") add(l.match(/\s—\s(.+?)(?::|\s\()/)?.[1]);
    else if (s.kind === "founder_role") add(l.match(/(?:founder|ceo|cto|owner|president)\b[^@]*?\bat\s+(.+?)(?:\s+\(|\s+—|$)/i)?.[1]);
    else if (includeGithub && s.source === "github" && s.kind === "profile") {
      const snip = l.match(/\s—\s(.+)$/)?.[1] ?? "";
      const m = snip.match(/(?:founder|ceo|cto)\b[^@]*?(?:\b(?:at|of)\b|@)\s*@?([A-Za-z0-9][\w.&' -]{1,40})/i);
      add(m?.[1] ?? (snip.startsWith("@") ? snip.split(/[\s,|]/)[0] : undefined));
    }
  }
  return out;
}
