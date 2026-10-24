// ClinicalTrials.gov v2 — early traction (stage 5) / commercial pull (stage 3): the candidate runs a trial.
// Endpoint (verified 200, no key): https://clinicaltrials.gov/api/v2/studies?query.term=<First Last>&pageSize=50&fields=...
// Response paths: protocolSection.identificationModule{nctId,briefTitle}, statusModule{overallStatus,startDateStruct.date},
// sponsorCollaboratorsModule{leadSponsor{name,class}, responsibleParty{investigatorFullName,investigatorAffiliation}},
// contactsLocationsModule{overallOfficials[{name,affiliation}], centralContacts[{name}]}. Names carry credentials
// ("David H Chong, MD") -> cut at the first comma. Unquoted query.term ANDs the tokens, so middle initials still hit.
// Match: name is overall official / responsible party / central contact AND (affiliation is the candidate's university,
// or INDUSTRY sponsor with topic overlap). trial_industry (+6, stage 5) only when the candidate is official/responsible
// party of an INDUSTRY-sponsored trial and NOT affiliated with the university (i.e. they are on the company side);
// university site-PIs of industry trials get the weaker "trial" signal (+2, stage 3). Trials starting > 5 y ago are ignored.
import type { Candidate } from "../types.ts";
import type { Signal, SourceModule, SourceContext } from "./types.ts";
import { UA, YEAR_MS, capTotal, entityCorroborated } from "./entity.ts";
import { mentionsInstitution, namesMatch } from "./match.ts";

const FIELDS = "NCTId,BriefTitle,OverallStatus,StartDate,LeadSponsorName,LeadSponsorClass,OverallOfficialName,OverallOfficialAffiliation,"
  + "CentralContactName,ResponsiblePartyInvestigatorFullName,ResponsiblePartyInvestigatorAffiliation,Phase";

const nm = (s?: string) => (s ?? "").split(",")[0].trim();
const atUni = (aff: string | undefined, c: Candidate) => !!aff && !/british columbia/i.test(aff) && mentionsInstitution(aff, c.institutions);

export function trialToSignal(c: Candidate, study: any, keywords = "", now = Date.now()): Signal | null {
  const p = study?.protocolSection;
  const id = p?.identificationModule?.nctId;
  if (!id) return null;
  const start = p.statusModule?.startDateStruct?.date ?? null;
  if (start && Date.parse(start) < now - 5 * YEAR_MS) return null;
  const sp = p.sponsorCollaboratorsModule ?? {};
  const rp = sp.responsibleParty ?? {};
  const officials: { name?: string; affiliation?: string }[] = p.contactsLocationsModule?.overallOfficials ?? [];
  const lead = (officials.find((o) => namesMatch(nm(o.name), c.name))
    ?? (namesMatch(nm(rp.investigatorFullName), c.name) ? { affiliation: rp.investigatorAffiliation } : null));
  const contact = (p.contactsLocationsModule?.centralContacts ?? []).some((x: any) => namesMatch(nm(x?.name), c.name));
  if (!lead && !contact) return null;
  const sponsor = sp.leadSponsor?.name ?? "?";
  const industry = sp.leadSponsor?.class === "INDUSTRY";
  const title = p.identificationModule?.briefTitle ?? "";
  const uni = atUni(lead?.affiliation, c) || atUni(sponsor, c);
  if (!uni && !(industry && entityCorroborated(c, sponsor, title, keywords))) return null;
  const status = String(p.statusModule?.overallStatus ?? "").toLowerCase().replace(/_/g, " ");
  const base = { source: "clinicaltrials" as const, url: `https://clinicaltrials.gov/study/${id}`, date: start,
    label: `ClinicalTrials.gov ${id}: ${title.slice(0, 90)} (${status}, sponsor ${sponsor})` };
  return industry && lead && !atUni(lead.affiliation, c)
    ? { ...base, stage: 5, kind: "trial_industry", weight: 6 }
    : { ...base, stage: 3, kind: "trial", weight: 2 };
}

/** Industry trials first; max 2 of each kind, total <= 15. */
export function trialsToSignals(c: Candidate, studies: any[], keywords = "", now = Date.now()): Signal[] {
  const all = studies.map((s) => trialToSignal(c, s, keywords, now)).filter((s): s is Signal => !!s)
    .sort((a, b) => b.weight - a.weight || String(b.date).localeCompare(String(a.date)));
  const n: Record<string, number> = {};
  return capTotal(all.filter((s) => (n[s.kind] = (n[s.kind] ?? 0) + 1) <= 2));
}

export const source: SourceModule = {
  id: "clinicaltrials",
  enabled: () => true,
  async enrich(c: Candidate, ctx: SourceContext): Promise<Signal[]> {
    try {
      if (!c?.name || c.name.trim().split(/\s+/).length < 2) return [];
      const url = `https://clinicaltrials.gov/api/v2/studies?query.term=${encodeURIComponent(c.name.trim())}&pageSize=50&fields=${FIELDS}`;
      const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      if (!r.ok) return [];
      const j: any = await r.json();
      return trialsToSignals(c, Array.isArray(j?.studies) ? j.studies : [], ctx?.keywords ?? "");
    } catch {
      return [];
    }
  },
};
