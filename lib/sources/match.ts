// Shared name / affiliation / paper matching helpers for founder-signal sources.
// Names are ambiguous: sources only emit signals when the name matches AND there is
// institution evidence or a shared paper (title/DOI) with the candidate's OpenAlex works.
import type { Candidate } from "../types.ts";

export function normalizeName(s: string): string {
  return String(s ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitName(s: string): { first: string; last: string } {
  const parts = normalizeName(s).split(" ").filter(Boolean);
  if (parts.length === 0) return { first: "", last: "" };
  return { first: parts[0], last: parts[parts.length - 1] };
}

/** Exact normalized match, or same first + last name with middle names/initials omitted.
 *  A first-name initial ("C. Vondrick") is NOT accepted — too ambiguous. */
export function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a), nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const pa = na.split(" "), pb = nb.split(" ");
  if (pa.length < 2 || pb.length < 2) return false;
  return pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1] && pa[0].length > 1;
}

const INSTITUTION_PATTERNS: Record<string, RegExp[]> = {
  columbia: [/\bcolumbia\b/],
  nyu: [/\bnyu\b/, /\bnew york university\b/],
  cornell: [/\bcornell\b/],
  "cornell tech": [/\bcornell tech\b/, /\bcornell\b/],
};

function patternsFor(inst: string): RegExp[] {
  const n = normalizeName(inst);
  if (INSTITUTION_PATTERNS[n]) return INSTITUTION_PATTERNS[n];
  if (/new york university|\bnyu\b/.test(n)) return INSTITUTION_PATTERNS.nyu;
  if (/cornell/.test(n)) return INSTITUTION_PATTERNS.cornell; // incl. Weill Cornell, Cornell Tech
  if (/columbia/.test(n)) return INSTITUTION_PATTERNS.columbia;
  return n ? [new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)] : [];
}

/** True if `text` mentions any of the candidate's institutions (Columbia, NYU/New York University, Cornell, Cornell Tech, Weill Cornell). */
export function mentionsInstitution(text: string | null | undefined, institutions: string[]): boolean {
  const t = normalizeName(text ?? "");
  if (!t) return false;
  const list = institutions.length ? institutions : ["Columbia", "NYU", "Cornell"];
  return list.some((i) => patternsFor(i).some((re) => re.test(t)));
}

export function normalizeTitle(s: string): string {
  return normalizeName(s).replace(/\s+/g, " ");
}

export function normalizeDoi(d: string | null | undefined): string | null {
  if (!d) return null;
  const m = String(d).toLowerCase().match(/10\.\d{4,9}\/\S+/);
  return m ? m[0].replace(/[.,;]+$/, "") : null;
}

/** Shares an exact (normalized) paper title or DOI with the candidate's works. */
export function sharesWork(c: Candidate, title: string | null | undefined, doi?: string | null): boolean {
  const d = normalizeDoi(doi);
  const t = title ? normalizeTitle(title) : "";
  return (c.works ?? []).some((w) =>
    (d && normalizeDoi(w.doi) === d) || (t.length > 10 && normalizeTitle(w.title ?? "") === t));
}

const STOP = new Set(["with", "from", "that", "this", "using", "towards", "toward", "via", "learning", "model", "models",
  "based", "data", "analysis", "study", "approach", "method", "methods", "into", "over", "under", "their", "these", "large"]);

export function tokens(s: string): Set<string> {
  return new Set(normalizeName(s).split(" ").filter((w) => w.length > 3 && !STOP.has(w)));
}

/** Topical overlap: >=2 significant tokens shared with any candidate work title, or >=1 keyword token. */
export function topicOverlap(c: Candidate, text: string, keywords: string): boolean {
  const t = tokens(text);
  if (t.size === 0) return false;
  for (const k of tokens(keywords ?? "")) if (t.has(k)) return true;
  for (const w of c.works ?? []) {
    let n = 0;
    for (const x of tokens(w.title ?? "")) if (t.has(x) && ++n >= 2) return true;
  }
  return false;
}
