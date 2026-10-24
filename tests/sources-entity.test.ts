import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candidate } from "../lib/types.ts";
import type { Signal } from "../lib/sources/types.ts";
import { capTotal, entityNamesFromSignals, normalizeEntity, personMatch, entityMatchesTitles } from "../lib/sources/entity.ts";
import { nyEntityToSignal, nyEntitiesToSignals, source as nycorp } from "../lib/sources/nycorp.ts";
import { parseFormD, groupHits, formDToSignal, source as edgar } from "../lib/sources/edgar.ts";
import { usaAwardToSignal, usaAwardsToSignals, source as usaspending } from "../lib/sources/usaspending.ts";
import { trialToSignal, trialsToSignals, source as clinicaltrials } from "../lib/sources/clinicaltrials.ts";
import { batchYear, matchYc, parseYcFounders, ycToSignal, _resetYcCache, source as yc } from "../lib/sources/yc.ts";

const NOW = Date.parse("2026-10-24T12:00:00Z");
function cand(name: string, over: Partial<Candidate> = {}): Candidate {
  return { authorId: "A1", name, orcid: null, institutions: ["Columbia"], works: [], worksCount: 1, citedByCount: 0, firstPubYear: 2022,
    recentWorksCount: 1, reasons: [], mentions: [], education: [], isCurrentStudent: true, score: 0, brief: null, signals: [], ...over };
}
const sig = (source: any, kind: string, label: string): Signal => ({ source, stage: 4, kind, label, url: null, date: null, weight: 5 });

// ---- entity.ts
test("personMatch handles 'LAST FIRST' order; normalizeEntity strips legal suffixes", () => {
  assert.ok(personMatch("KORZEN OLIVER", "Oliver Korzen"));
  assert.ok(personMatch("OLIVER KORZEN", "Oliver Korzen"));
  assert.ok(!personMatch("Michael Korzenski", "Oliver Korzen"));
  assert.equal(normalizeEntity("Clasp, Inc."), "clasp");
  assert.equal(normalizeEntity("KITWARE INC"), "kitware");
});
test("capTotal trims to 15", () => {
  const s = [sig("nycorp", "a", "x"), sig("nycorp", "b", "y")].map((x) => ({ ...x, weight: 10 }));
  assert.deepEqual(capTotal(s).map((x) => x.weight), [10, 5]);
});
test("entityNamesFromSignals parses NY entity / Form D / SBIR / ORCID / GitHub labels, drops universities", () => {
  const c = cand("Zach Zhang", { signals: [
    sig("nycorp", "ny_entity", "NY entity: ARCFORMA AI INC. (foreign business corporation, filed 2026-10, New York County) — process agent"),
    sig("edgar", "form_d", "SEC Form D: Clasp, Inc. (filed 2026-10-08, 2 filings, $13.2M sold) names Zach Zhang (Executive Officer/Director)"),
    sig("nsf", "sbir_award", "NSF SBIR Phase I (PI) — Acme Robotics LLC: Soft grippers (275k, 2025)"),
    sig("orcid", "founder_role", "ORCID: Founder at Tire Swing"),
    sig("orcid", "founder_role", "ORCID: Co-founder at Columbia University"),
    { ...sig("github", "profile", "GitHub @zz — Co-founder @Bevel"), stage: 2 },
  ] });
  assert.deepEqual(entityNamesFromSignals(c), ["ARCFORMA AI INC", "Clasp, Inc", "Acme Robotics LLC", "Tire Swing"]);
  assert.deepEqual(entityNamesFromSignals(c, true).slice(-1), ["Bevel"]);
});
test("entityMatchesTitles ignores generic words", () => {
  const c = cand("X", { works: [{ id: "W", title: "Arcforma: learned form fields", year: 2025, doi: null, url: null, venue: null, citedBy: 0, position: "first", isCorresponding: false }] });
  assert.ok(entityMatchesTitles(c, "ARCFORMA AI INC."));
  assert.ok(entityMatchesTitles(c, "Learned Technologies LLC"));                       // "learned" is distinctive
  assert.ok(!entityMatchesTitles(c, "Global Holdings LLC"));
});

// ---- nycorp (rows trimmed from real data.ny.gov n9v6-gdp6 responses)
const ARCFORMA = { dos_id: "8041248", current_entity_name: "ARCFORMA AI INC.", initial_dos_filing_date: "2026-10-06T00:00:00.000",
  county: "New York", jurisdiction: "Delaware", entity_type: "FOREIGN BUSINESS CORPORATION", dos_process_name: "OLIVER KORZEN",
  dos_process_city: "NEW YORK", dos_process_state: "NY" };
const EAUTERRE = { dos_id: "7551898", current_entity_name: "EAUTERRE CONSULTING LLC", initial_dos_filing_date: "2025-03-06T00:00:00.000",
  county: "Chautauqua", jurisdiction: "New York", entity_type: "DOMESTIC LIMITED LIABILITY COMPANY", dos_process_name: "Michael Korzenski",
  dos_process_city: "Dunkirk", dos_process_state: "NY" };
const ACCESS_AI = { dos_id: "7509112", current_entity_name: "ACCESS AI ORGANIZATION INC.", initial_dos_filing_date: "2025-01-15T00:00:00.000",
  county: "New York", entity_type: "DOMESTIC NOT-FOR-PROFIT CORPORATION", dos_process_name: "Jane Roe", dos_process_city: "NEW YORK" };
test("nycorp: process agent in NYC county -> ny_entity +8", () => {
  const s = nyEntityToSignal(cand("Oliver Korzen"), ARCFORMA, "", NOW)!;
  assert.equal(s.kind, "ny_entity"); assert.equal(s.weight, 8); assert.equal(s.stage, 4);
  assert.match(s.label, /^NY entity: ARCFORMA AI INC\. \(foreign business corporation, filed 2026-10, New York County\) — process agent$/);
  assert.equal(s.url, "https://data.ny.gov/resource/n9v6-gdp6.json?dos_id=8041248");
  assert.ok(nyEntityToSignal(cand("Oliver Korzen"), { ...ARCFORMA, dos_process_name: "KORZEN OLIVER" }, "", NOW));
});
test("nycorp: upstate namesake needs topic corroboration; old / nonprofit / wrong name rejected", () => {
  assert.equal(nyEntityToSignal(cand("Michael Korzenski"), EAUTERRE, "", NOW), null);
  assert.ok(nyEntityToSignal(cand("Michael Korzenski"), EAUTERRE, "eauterre water", NOW));
  assert.equal(nyEntityToSignal(cand("Oliver Korzen"), { ...ARCFORMA, initial_dos_filing_date: "2019-01-01T00:00:00.000" }, "", NOW), null);
  assert.equal(nyEntityToSignal(cand("Jane Roe"), ACCESS_AI, "", NOW), null);
  assert.equal(nyEntityToSignal(cand("Carl Vondrick"), ARCFORMA, "", NOW), null);
});
test("nycorp: dedupe, max 2, total <= 15", () => {
  const rows = [ARCFORMA, ARCFORMA, { ...ARCFORMA, dos_id: "1", initial_dos_filing_date: "2025-01-01T00:00:00.000" },
    { ...ARCFORMA, dos_id: "2", initial_dos_filing_date: "2024-01-01T00:00:00.000" }];
  const s = nyEntitiesToSignals(cand("Oliver Korzen"), rows, "", NOW);
  assert.equal(s.length, 2); assert.ok(s.reduce((a, x) => a + x.weight, 0) <= 15);
});

// ---- edgar (hits + primary_doc.xml trimmed from real efts.sec.gov / sec.gov Archives responses)
const CLASP_HITS = [
  { _id: "0002024665-24-000001:primary_doc.xml", _source: { display_names: ["Clasp, Inc.  (CIK 0002024665)"], ciks: ["0002024665"], file_date: "2024-05-28", form: "D", adsh: "0002024665-24-000001", biz_states: ["NY"], biz_locations: ["New York, NY"] } },
  { _id: "0002024665-26-000006:primary_doc.xml", _source: { display_names: ["Clasp, Inc.  (CIK 0002024665)"], ciks: ["0002024665"], file_date: "2026-10-08", form: "D", adsh: "0002024665-26-000006", biz_states: ["NY"], biz_locations: ["New York, NY"] } },
];
const CLASP_XML = `<edgarSubmission><primaryIssuer><cik>0002024665</cik><entityName>Clasp, Inc.</entityName>
<issuerAddress><city>NEW YORK</city><stateOrCountry>NY</stateOrCountry></issuerAddress><entityType>Corporation</entityType>
<yearOfInc><withinFiveYears>true</withinFiveYears><value>2023</value></yearOfInc></primaryIssuer>
<relatedPersonsList><relatedPersonInfo><relatedPersonName><firstName>Amar</firstName><lastName>Jasarbasic</lastName></relatedPersonName>
<relatedPersonAddress><city>New York</city><stateOrCountry>NY</stateOrCountry></relatedPersonAddress>
<relatedPersonRelationshipList><relationship>Executive Officer</relationship><relationship>Director</relationship></relatedPersonRelationshipList></relatedPersonInfo>
<relatedPersonInfo><relatedPersonName><firstName>Zach</firstName><lastName>Zhang</lastName></relatedPersonName>
<relatedPersonAddress><city>New York</city><stateOrCountry>NY</stateOrCountry></relatedPersonAddress>
<relatedPersonRelationshipList><relationship>Executive Officer</relationship><relationship>Director</relationship></relatedPersonRelationshipList></relatedPersonInfo></relatedPersonsList>
<offeringData><industryGroup><industryGroupType>Other Technology</industryGroupType></industryGroup><totalAmountSold>13199983</totalAmountSold></offeringData></edgarSubmission>`;
const FLO_HITS = [
  { _id: "0001798621-20-000001:primary_doc.xml", _source: { display_names: ["Flo Artificial Intelligence, Inc.  (CIK 0001798621)"], ciks: ["0001798621"], file_date: "2020-01-03", form: "D", biz_states: ["CA"] } },
  { _id: "0001798621-26-000003:primary_doc.xml", _source: { display_names: ["Flo Artificial Intelligence, Inc.  (CIK 0001798621)"], ciks: ["0001798621"], file_date: "2026-07-06", form: "D", biz_states: ["CA"] } },
];
const FLO_XML = `<edgarSubmission><primaryIssuer><entityName>Flo Artificial Intelligence, Inc.</entityName><issuerAddress><stateOrCountry>AZ</stateOrCountry></issuerAddress>
<yearOfInc><overFiveYears>true</overFiveYears></yearOfInc></primaryIssuer><relatedPersonsList><relatedPersonInfo><relatedPersonName><firstName>Jatish</firstName><lastName>Patel</lastName></relatedPersonName>
<relatedPersonAddress><stateOrCountry>AZ</stateOrCountry></relatedPersonAddress><relatedPersonRelationshipList><relationship>Executive Officer</relationship></relatedPersonRelationshipList></relatedPersonInfo></relatedPersonsList>
<offeringData><industryGroup><industryGroupType>Other Technology</industryGroupType></industryGroup></offeringData></edgarSubmission>`;
test("edgar: parseFormD reads issuer, yearOfInc, related persons", () => {
  const d = parseFormD(CLASP_XML)!;
  assert.equal(d.entity, "Clasp, Inc."); assert.equal(d.state, "NY"); assert.equal(d.withinFiveYears, true); assert.equal(d.yearOfInc, 2023);
  assert.equal(d.amountSold, 13199983); assert.equal(d.fund, false);
  assert.deepEqual(d.persons[1], { name: "Zach Zhang", state: "NY", relationships: ["Executive Officer", "Director"] });
});
test("edgar: young NY issuer naming the candidate -> form_d 10 + 3 per extra filing", () => {
  const [g] = groupHits(CLASP_HITS as any);
  assert.equal(g.hits[0]._source.file_date, "2026-10-08");
  const s = formDToSignal(cand("Zach Zhang"), g, parseFormD(CLASP_XML), "", NOW)!;
  assert.equal(s.kind, "form_d"); assert.equal(s.weight, 13); assert.equal(s.stage, 4);
  assert.match(s.label, /^SEC Form D: Clasp, Inc\. \(filed 2026-10-08, 2 filings, \$13\.2M sold\) names Zach Zhang \(Executive Officer\/Director\)$/);
  assert.equal(s.url, "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0002024665&type=D");
});
test("edgar: person not in related persons, issuer > 5 y old, or no corroboration -> null", () => {
  const [g] = groupHits(CLASP_HITS as any);
  assert.equal(formDToSignal(cand("Paul Witten"), g, parseFormD(CLASP_XML), "", NOW), null);
  const [f] = groupHits(FLO_HITS as any);
  assert.equal(formDToSignal(cand("Jatish Patel"), f, parseFormD(FLO_XML), "", NOW), null);          // overFiveYears
  assert.equal(formDToSignal(cand("Jatish Patel"), f, null, "", NOW), null);                         // hit-only: 2020 filing
  const young = FLO_XML.replace("<overFiveYears>true</overFiveYears>", "<withinFiveYears>true</withinFiveYears><value>2024</value>");
  assert.equal(formDToSignal(cand("Jatish Patel"), { cik: f.cik, hits: [f.hits[0]] }, parseFormD(young), "", NOW), null); // AZ, no topic
  assert.ok(formDToSignal(cand("Jatish Patel"), { cik: f.cik, hits: [f.hits[0]] }, parseFormD(young), "artificial intelligence", NOW));
});

// ---- usaspending (results trimmed from a real spending_by_award response)
const KITWARE = { "Award ID": "FA865023C7316", "Recipient Name": "KITWARE INC", "Award Amount": 9389430, "Start Date": "2023-03-01",
  "Awarding Agency": "Department of Defense", Description: "ALIGNED MORAL LANGUAGE MODELS WITH INTERPRETABLE AND GRAPH-BASED KNOWLEDGE",
  generated_internal_id: "CONT_AWD_FA865023C7316_9700_-NONE-_-NONE-" };
const KITWARE_OLD = { "Award ID": "R01EB014955", "Recipient Name": "KITWARE INC", "Award Amount": 6575069.6, "Start Date": "2013-05-01",
  "Awarding Agency": "Department of Health and Human Services", Description: "ACCELERATING COMMUNITY-DRIVEN MEDICAL INNOVATION WITH VTK",
  generated_internal_id: "ASST_NON_R01EB014955_075" };
test("usaspending: exact recipient (suffix-insensitive), recent -> federal_award +5", () => {
  const s = usaAwardToSignal("Kitware, Inc.", KITWARE, NOW)!;
  assert.equal(s.kind, "federal_award"); assert.equal(s.weight, 5); assert.equal(s.stage, 5);
  assert.equal(s.label, "USAspending: Department of Defense → KITWARE INC $9.4M (2023) ALIGNED MORAL LANGUAGE MODELS WITH INTERPRETABLE AND GRAPH-B");
  assert.equal(s.url, "https://www.usaspending.gov/award/CONT_AWD_FA865023C7316_9700_-NONE-_-NONE-");
  assert.equal(usaAwardToSignal("Kitware Medical", KITWARE, NOW), null);
  assert.equal(usaAwardToSignal("Kitware Inc", KITWARE_OLD, NOW), null);
  const many = [1, 2, 3, 4].map((i) => ({ entity: "Kitware", award: { ...KITWARE, generated_internal_id: `X${i}` } }));
  assert.equal(usaAwardsToSignals([...many, many[0]], NOW).length, 3);
});
test("usaspending: no entity names in signals -> [] without any request", async () => {
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("{}"); }) as typeof fetch;
  try { assert.deepEqual(await usaspending.enrich(cand("Zach Zhang"), { query: "", keywords: "" }), []); assert.equal(calls, 0); }
  finally { globalThis.fetch = orig; }
});

// ---- clinicaltrials (studies trimmed from real clinicaltrials.gov v2 responses)
const ACOTEC = { protocolSection: { identificationModule: { nctId: "NCT06330493", briefTitle: "AcoArt Litos PCB Below-the-knee Global Trial" },
  statusModule: { overallStatus: "TERMINATED", startDateStruct: { date: "2025-10-10" } },
  sponsorCollaboratorsModule: { responsibleParty: {}, leadSponsor: { name: "Acotec Scientific Co., Ltd", class: "INDUSTRY" } },
  contactsLocationsModule: { overallOfficials: [{ name: "Peter Schneider, MD, PhD", affiliation: "University of California, San Francisco" },
    { name: "Sahil Parikh, MD, PhD", affiliation: "Columbia University" }] } } };
const UBC = { protocolSection: { identificationModule: { nctId: "NCT06717477", briefTitle: "Streamlining Care for Patients With Compression Neuropathies: The Carpal Tunnel Plus Pathway" },
  statusModule: { overallStatus: "ENROLLING_BY_INVITATION", startDateStruct: { date: "2025-02-18" } },
  sponsorCollaboratorsModule: { responsibleParty: { investigatorFullName: "Kristine Chapman", investigatorAffiliation: "University of British Columbia" },
    leadSponsor: { name: "University of British Columbia", class: "OTHER" } },
  contactsLocationsModule: { overallOfficials: [{ name: "Kristine Chapman", affiliation: "University of British Columbia" }] } } };
test("clinicaltrials: Columbia site PI of an industry trial -> trial +2 (stage 3)", () => {
  const s = trialToSignal(cand("Sahil Parikh"), ACOTEC, "", NOW)!;
  assert.equal(s.kind, "trial"); assert.equal(s.weight, 2); assert.equal(s.stage, 3);
  assert.equal(s.label, "ClinicalTrials.gov NCT06330493: AcoArt Litos PCB Below-the-knee Global Trial (terminated, sponsor Acotec Scientific Co., Ltd)");
  assert.equal(s.url, "https://clinicaltrials.gov/study/NCT06330493");
  assert.equal(trialToSignal(cand("Peter Schneider"), ACOTEC, "", NOW), null);          // UCSF, no topic overlap
  assert.equal(trialToSignal(cand("Kristine Chapman"), UBC, "", NOW), null);             // British Columbia != Columbia
});
test("clinicaltrials: company-side official of an industry trial with topic overlap -> trial_industry +6", () => {
  const study = structuredClone(ACOTEC);
  study.protocolSection.contactsLocationsModule.overallOfficials = [{ name: "Jane Doe, PhD", affiliation: "Acotec Scientific Co., Ltd" }];
  const s = trialToSignal(cand("Jane Doe"), study, "below-the-knee balloon", NOW)!;
  assert.equal(s.kind, "trial_industry"); assert.equal(s.weight, 6); assert.equal(s.stage, 5);
  assert.equal(trialToSignal(cand("Jane Doe"), study, "", NOW), null);
  const old = structuredClone(ACOTEC); old.protocolSection.statusModule.startDateStruct.date = "2016-09";
  assert.equal(trialToSignal(cand("Sahil Parikh"), old, "", NOW), null);
  assert.equal(trialsToSignals(cand("Sahil Parikh"), [ACOTEC, ACOTEC, ACOTEC], "", NOW).length, 2);
});

// ---- yc (company trimmed from real yc-oss all.json; founders from the real ycombinator.com data-page JSON)
const TIRE_SWING = { name: "Tire Swing", slug: "tire-swing", batch: "Fall 2026", one_liner: "AI Compliance for Affordable Housing", former_names: "[]" };
const OLD_YC = { name: "CircuitHub", slug: "circuithub", batch: "Winter 2012", one_liner: "On-Demand Electronics Manufacturing", former_names: [] };
const PAGE = `<div id="app" data-page="{&quot;props&quot;:{&quot;company&quot;:{&quot;name&quot;:&quot;Tire Swing&quot;,&quot;founders&quot;:[{&quot;full_name&quot;:&quot;Paul Witten&quot;,&quot;title&quot;:&quot;Founder/CEO&quot;,&quot;founder_bio&quot;:&quot;Graduated from Princeton&quot;}]}}}"></div>`;
test("yc: batchYear, matchYc (recent batch, suffix-insensitive), parseYcFounders", () => {
  assert.equal(batchYear("Fall 2026"), 2026); assert.equal(batchYear("W24"), 2024); assert.equal(batchYear(""), null);
  assert.deepEqual(matchYc([TIRE_SWING, OLD_YC], ["Tire Swing, Inc."], NOW).map((x) => x.slug), ["tire-swing"]);
  assert.deepEqual(matchYc([TIRE_SWING, OLD_YC], ["CircuitHub"], NOW), []);
  assert.deepEqual(matchYc([{ ...TIRE_SWING, former_names: "['Swingset']" }], ["Swingset"], NOW).length, 1);
  assert.equal(parseYcFounders(PAGE)[0].full_name, "Paul Witten");
});
test("yc: verified founder -> yc_company +12; namesake -> null", () => {
  const f = parseYcFounders(PAGE);
  const s = ycToSignal(cand("Paul Witten"), TIRE_SWING, f)!;
  assert.equal(s.kind, "yc_company"); assert.equal(s.weight, 12); assert.equal(s.stage, 5);
  assert.equal(s.label, "YC Fall 2026: Tire Swing — AI Compliance for Affordable Housing (Founder/CEO)");
  assert.equal(s.url, "https://www.ycombinator.com/companies/tire-swing");
  assert.equal(ycToSignal(cand("Paul Smith"), TIRE_SWING, f), null);
});

// ---- every module: enrich never throws on network failure / HTTP 429
const withEntity = (name: string) => cand(name, { signals: [sig("orcid", "founder_role", "ORCID: Founder at Tire Swing")] });
for (const mod of [nycorp, edgar, usaspending, clinicaltrials, yc]) {
  test(`${mod.id}.enrich returns [] when fetch rejects`, async () => {
    _resetYcCache();
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
    try { assert.deepEqual(await mod.enrich(withEntity("Paul Witten"), { query: "x", keywords: "y" }), []); }
    finally { globalThis.fetch = orig; }
  });
  test(`${mod.id}.enrich returns [] on HTTP 429`, async () => {
    _resetYcCache();
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 429 })) as typeof fetch;
    try { assert.deepEqual(await mod.enrich(withEntity("Paul Witten"), { query: "x", keywords: "y" }), []); }
    finally { globalThis.fetch = orig; }
  });
}
test("wave: usaspending and yc run in wave 2, others wave 1", () => {
  assert.equal(usaspending.wave, 2); assert.equal(yc.wave, 2);
  for (const m of [nycorp, edgar, clinicaltrials]) assert.ok(!m.wave || m.wave === 1);
  for (const m of [nycorp, edgar, usaspending, clinicaltrials, yc]) assert.equal(m.enabled(), true);
});
