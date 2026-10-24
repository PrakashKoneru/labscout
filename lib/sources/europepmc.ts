// Europe PMC — life-science preprint velocity (stage 1): bioRxiv / medRxiv / Research Square / Preprints.org.
// Endpoint (verified 200, no key): https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=AUTH:"First Last" AND SRC:PPR
//   AND FIRST_PDATE:[yyyy-mm-dd TO yyyy-mm-dd]&format=json&pageSize=25&resultType=core
// AUTH accepts "First Last" as well as "Last FI"; AUTHOR_FULL returns 0 hits. resultType=core adds authorList.author[]
// {firstName, lastName, authorId{type:"ORCID",value}} and abstractText. Preprint records carry NO affiliations, so
// disambiguation = full-name match AND (author ORCID == candidate ORCID OR shared DOI/title OR topic overlap).
// Namesakes are common (e.g. "Harris Wang" returns ~20 unrelated Preprints.org essays besides the Columbia biologist).
// Grist (grant finder) API was tried and is broken (HTTP/2 stream reset / curl exit 92) — skipped.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule, SourceContext } from "./types.ts";
import { namesMatch, sharesWork, topicOverlap } from "./match.ts";
import { bareOrcid } from "./orcid.ts";

const UA = "labscout/0.1 (mailto:jak@protocogni.com)";

export type EpmcAuthor = { firstName?: string; lastName?: string; fullName?: string; authorId?: { type?: string; value?: string } };
export type EpmcRecord = { id: string; source?: string; title?: string; doi?: string; firstPublicationDate?: string; abstractText?: string;
  authorString?: string; authorList?: { author?: EpmcAuthor[] }; bookOrReportDetails?: { publisher?: string } };

const strip = (s: string) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function epmcQuery(c: Candidate, now = new Date()): string {
  const from = new Date(now.getTime() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const name = c.name.replace(/"/g, "");
  const id = bareOrcid(c.orcid);
  const who = id ? `(AUTH:"${name}" OR AUTHORID:"${id}")` : `AUTH:"${name}"`;
  return `${who} AND SRC:PPR AND FIRST_PDATE:[${from} TO ${now.toISOString().slice(0, 10)}]`;
}

/** Candidate's author entry on the record, if the full name (or ORCID) matches. */
export function epmcAuthor(c: Candidate, r: EpmcRecord): EpmcAuthor | null {
  const id = bareOrcid(c.orcid);
  return (r.authorList?.author ?? []).find((a) =>
    (id && a.authorId?.type === "ORCID" && bareOrcid(a.authorId.value) === id) ||
    namesMatch(`${a.firstName ?? ""} ${a.lastName ?? ""}`, c.name)) ?? null;
}

export function epmcToSignals(c: Candidate, records: EpmcRecord[], keywords: string, now = new Date()): Signal[] {
  const cutoff = now.getTime() - 365 * 24 * 3600 * 1000;
  const id = bareOrcid(c.orcid);
  const seen = new Set<string>();
  const recent = records.filter((r) => {
    const t = Date.parse(r.firstPublicationDate ?? "");
    const title = strip(r.title ?? "");
    if (!r.id || !Number.isFinite(t) || t < cutoff || seen.has(title.toLowerCase())) return false;
    const a = epmcAuthor(c, r);
    if (!a) return false;
    const ok = (id && bareOrcid(a.authorId?.value) === id) || sharesWork(c, title, r.doi) ||
      topicOverlap(c, `${title} ${strip(r.abstractText ?? "")}`, keywords);
    if (ok) seen.add(title.toLowerCase());
    return ok;
  }).sort((a, b) => String(b.firstPublicationDate).localeCompare(String(a.firstPublicationDate)));
  const signals: Signal[] = recent.slice(0, 3).map((r) => ({
    source: "europepmc", stage: 1, kind: "preprint", weight: 2,
    label: `${r.bookOrReportDetails?.publisher ?? "Preprint"}: ${strip(r.title ?? "")} (${(r.firstPublicationDate ?? "").slice(0, 7)})`,
    url: `https://europepmc.org/article/PPR/${r.id}`, date: r.firstPublicationDate ?? null,
  }));
  if (recent.length >= 3) signals.push({
    source: "europepmc", stage: 1, kind: "velocity", weight: 3,
    label: `Europe PMC: ${recent.length}${recent.length >= 25 ? "+" : ""} on-topic life-science preprints in the last 12 months`,
    url: `https://europepmc.org/search?query=${encodeURIComponent(`AUTH:"${c.name}" AND SRC:PPR`)}`,
    date: recent[0].firstPublicationDate ?? null,
  });
  return signals;
}

export const source: SourceModule = {
  id: "europepmc",
  enabled: () => true,
  async enrich(c: Candidate, ctx: SourceContext): Promise<Signal[]> {
    try {
      if (!c?.name) return [];
      const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(epmcQuery(c))}&format=json&pageSize=25&resultType=core`;
      const r = await fetch(url, { headers: { "user-agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return [];
      const j: any = await r.json();
      return epmcToSignals(c, Array.isArray(j?.resultList?.result) ? j.resultList.result : [], ctx?.keywords ?? "");
    } catch {
      return [];
    }
  },
};
