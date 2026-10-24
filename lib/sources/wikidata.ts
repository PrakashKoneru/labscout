// Wikidata — notability + identity (stage 6). Finds the candidate's Wikidata item and extracts awards and handles.
// Endpoints (verified 200, no key): w/api.php?action=wbsearchentities&search=<name>&type=item&limit=5, then
// w/api.php?action=wbgetentities&ids=Q1|Q2&props=claims|sitelinks (same data as Special:EntityData/<Q>.json, batched),
// then wbgetentities&props=labels for award/employer QIDs. Claims used: P31 (Q5 human), P496 ORCID, P2037 GitHub,
// P1960 Google Scholar, P108 employer, P69 educated at, P166 award, P856 website, P2002 X/Twitter.
// Disambiguation: human AND name match AND (P496 == candidate ORCID OR P108/P69 is one of our institutions — known QIDs or
// a label that mentions the institution). Many researchers have bot-created items (ORCID/Scholia imports), so "notable"
// (+3) requires a Wikipedia sitelink; otherwise only the weight-0 identity signal is emitted.
// QIDs verified live: Columbia Q49088, NYU Q49210, Cornell Q49115, Cornell Tech Q5171546 (not Q16909424), Weill Cornell
// Medicine Q3567094 (not Q7980342), Weill Cornell Grad School Q7980201, CUIMC Q2415975, Columbia SEAS Q5149833,
// NYU Tandon Q75478, NYU Grossman Q3100195, Courant Q946028.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule } from "./types.ts";
import { mentionsInstitution, namesMatch } from "./match.ts";
import { bareOrcid } from "./orcid.ts";

const UA = "labscout/0.1 (mailto:jak@protocogni.com)";
const API = "https://www.wikidata.org/w/api.php";
export const INSTITUTION_QIDS: Record<string, string> = {
  Q49088: "Columbia", Q2415975: "Columbia", Q5149833: "Columbia",
  Q49210: "NYU", Q75478: "NYU", Q3100195: "NYU", Q946028: "NYU",
  Q49115: "Cornell", Q5171546: "Cornell Tech", Q3567094: "Cornell", Q7980201: "Cornell",
};

type Claim = { mainsnak?: { datavalue?: { value?: any } } };
export type WdEntity = { id: string; labels?: Record<string, { value: string }>; claims?: Record<string, Claim[]>; sitelinks?: Record<string, unknown> };

function vals(e: WdEntity, p: string): any[] {
  return (e.claims?.[p] ?? []).map((c) => c?.mainsnak?.datavalue?.value).filter((v) => v != null);
}
const qids = (e: WdEntity, p: string): string[] => vals(e, p).map((v) => v?.id).filter(Boolean);

/** True if the entity is a human whose ORCID equals the candidate's or who is affiliated with one of our institutions. */
export function acceptEntity(c: Candidate, e: WdEntity, labels: Record<string, string> = {}): boolean {
  if (!qids(e, "P31").includes("Q5")) return false;
  const id = bareOrcid(c.orcid);
  if (id && vals(e, "P496").some((v) => bareOrcid(v) === id)) return true;
  if (id && vals(e, "P496").length) return false; // has a different ORCID -> namesake
  return [...qids(e, "P108"), ...qids(e, "P69")].some((q) => INSTITUTION_QIDS[q] || mentionsInstitution(labels[q], c.institutions));
}

export function wikidataToSignals(c: Candidate, e: WdEntity, labels: Record<string, string> = {}): Signal[] {
  const url = `https://www.wikidata.org/wiki/${e.id}`;
  const out: Signal[] = [];
  const wiki = Object.keys(e.sitelinks ?? {}).filter((k) => /wiki$/.test(k) && !/^(commons|species|meta)wiki$/.test(k));
  if (wiki.length) out.push({ source: "wikidata", stage: 6, kind: "notable", weight: 3, url, date: null,
    label: `Wikidata: ${e.id} with ${wiki.length} Wikipedia article${wiki.length > 1 ? "s" : ""}${wiki.includes("enwiki") ? " (incl. English)" : ""}` });
  for (const q of qids(e, "P166").slice(0, 3)) out.push({ source: "wikidata", stage: 6, kind: "award", weight: 2, url, date: null,
    label: `Wikidata: award — ${labels[q] ?? q}` });
  const ids: string[] = [];
  const gh = vals(e, "P2037")[0], tw = vals(e, "P2002")[0], gs = vals(e, "P1960")[0], web = vals(e, "P856")[0], orcid = vals(e, "P496")[0];
  if (gh) ids.push(`github=${gh}`);
  if (tw) ids.push(`twitter=${tw}`);
  if (gs) ids.push(`scholar=${gs}`);
  if (orcid) ids.push(`orcid=${orcid}`);
  if (web) ids.push(`website=${web}`);
  out.push({ source: "wikidata", stage: 6, kind: "identity", weight: 0, url, date: null,
    label: `Wikidata: ${ids.length ? ids.join(", ") : e.id}` });
  return out;
}

async function api(params: string): Promise<any> {
  const r = await fetch(`${API}?${params}&format=json`, { headers: { "user-agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`wikidata ${r.status}`);
  return r.json();
}

export const source: SourceModule = {
  id: "wikidata",
  enabled: () => true,
  async enrich(c: Candidate): Promise<Signal[]> {
    try {
      if (!c?.name) return [];
      const s = await api(`action=wbsearchentities&search=${encodeURIComponent(c.name)}&language=en&limit=5&type=item`);
      const ids = (s?.search ?? []).filter((x: any) => namesMatch(x.label ?? "", c.name)).map((x: any) => x.id).slice(0, 5);
      if (!ids.length) return [];
      const d = await api(`action=wbgetentities&ids=${ids.join("|")}&props=claims|sitelinks`);
      const ents: WdEntity[] = ids.map((q: string) => d?.entities?.[q]).filter((e: any) => e && qids(e, "P31").includes("Q5"));
      if (!ents.length) return [];
      const refs = [...new Set(ents.flatMap((e) => [...qids(e, "P108"), ...qids(e, "P69"), ...qids(e, "P166").slice(0, 3)]))].slice(0, 50);
      const labels: Record<string, string> = {};
      if (refs.length) {
        const l = await api(`action=wbgetentities&ids=${refs.join("|")}&props=labels&languages=en`).catch(() => null);
        for (const [q, v] of Object.entries<any>(l?.entities ?? {})) if (v?.labels?.en?.value) labels[q] = v.labels.en.value;
      }
      const e = ents.find((x) => acceptEntity(c, x, labels));
      return e ? wikidataToSignals(c, e, labels) : [];
    } catch {
      return [];
    }
  },
};
