import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candidate } from "../lib/types.ts";
import { isCompany, crossrefToSignals, capCrossref, source as crossref } from "../lib/sources/crossref.ts";
import { bareOrcid, parseEmployments, parseFundings, orcidToSignals, source as orcid } from "../lib/sources/orcid.ts";
import { epmcQuery, epmcToSignals, source as europepmc } from "../lib/sources/europepmc.ts";
import { cordisDate, cordisToSignals, source as cordis } from "../lib/sources/cordis.ts";
import { acceptEntity, wikidataToSignals, source as wikidata } from "../lib/sources/wikidata.ts";
import { flipName, parseAcademicCommons, parseECommons, thesesToSignals, source as dissertations } from "../lib/sources/dissertations.ts";
import { coreProjectNum, nihProjectToSignal, nihProjectsToSignals, source as nih } from "../lib/sources/nih.ts";

function cand(over: Partial<Candidate> = {}): Candidate {
  return {
    authorId: "https://openalex.org/A1", name: "Carl Vondrick", orcid: null, institutions: ["Columbia"],
    works: [{ id: "W1", title: "Minerva: Evaluating Complex Video Reasoning", year: 2025, doi: "https://doi.org/10.1109/iccv51701.2025.02222",
      url: null, venue: null, citedBy: 5, position: "last", isCorresponding: false }],
    worksCount: 10, citedByCount: 100, firstPubYear: 2015, recentWorksCount: 3, reasons: [], mentions: [], education: [],
    isCurrentStudent: null, score: 0, brief: null, signals: [], ...over,
  };
}
const ctx = { query: "efficient vision transformers", keywords: "vision transformer sparse" };
const sum = (s: { weight: number }[]) => s.reduce((a, x) => a + x.weight, 0);

// ---- Crossref (fixtures trimmed from api.crossref.org/works/10.1109/iccv51701.2025.02222 and 10.1145/3725334)
test("isCompany: corporate allowlist / suffixes vs academic and government funders", () => {
  for (const n of ["Google", "Google PhD fellowship", "Amazon", "Adobe Research", "Celonis Inc.", "Meta Inc.", "Google DeepMind", "Bayer AG"]) assert.ok(isCompany(n), n);
  for (const n of ["NSF (National Science Foundation)", "Alfred P. Sloan Foundation", "DARPA", "AFOSR", "Columbia University", "CAIT", "Sloan", "Simons Foundation", ""]) assert.ok(!isCompany(n), n);
});
test("crossrefToSignals: industry funders + company co-authors, skips the candidate's own affiliation", () => {
  const m = { DOI: "10.1145/3725334", title: ["Physical Visualization Design: Decoupling Interface and System Design"],
    funder: [{ DOI: "10.13039/501100006374", name: "National Science Foundation", award: ["1845638"] }, { DOI: "10.13039/100006785", name: "Google" }, { name: "Amazon" }, { name: "CAIT" }],
    author: [{ given: "Eugene", family: "Wu", affiliation: [{ name: "Columbia University, New York, USA" }] },
      { given: "Subrata", family: "Mitra", affiliation: [{ name: "Adobe Research, Bangalore, India" }] },
      { given: "Lampros", family: "Flokas", affiliation: [{ name: "Celonis Inc., NYC, USA" }] }] };
  const s = crossrefToSignals(cand({ name: "Eugene Wu" }), m, "2025");
  assert.deepEqual(s.map((x) => x.kind), ["industry_funder", "industry_funder", "company_coauthor", "company_coauthor"]);
  assert.equal(s[0].label, "Crossref: funded by Google — Physical Visualization Design: Decoupling Interface and System Design");
  assert.equal(s[0].url, "https://doi.org/10.1145/3725334");
  assert.equal(s[0].weight, 3); assert.equal(s[0].stage, 3);
  assert.match(s[3].label, /co-author at Celonis Inc\./);
  // the candidate's own company affiliation is not a "company co-author"
  const own = crossrefToSignals(cand(), { DOI: "10.1/x", title: ["T"], author: [{ given: "Carl", family: "Vondrick", affiliation: [{ name: "Google DeepMind" }] }] });
  assert.deepEqual(own, []);
});
test("capCrossref: max 3 funders, max 2 co-author orgs, deduped, <= 15", () => {
  const f = (n: string) => ({ source: "crossref" as const, stage: 3 as const, kind: "industry_funder", label: `Crossref: funded by ${n} — P`, url: null, date: null, weight: 3 });
  const a = (n: string) => ({ source: "crossref" as const, stage: 3 as const, kind: "company_coauthor", label: `Crossref: co-author at ${n} — P`, url: null, date: null, weight: 2 });
  const s = capCrossref([f("Google"), f("Google"), f("Amazon"), f("Adobe"), f("Intel"), a("Meta Inc."), a("Adobe Research"), a("Celonis Inc.")]);
  assert.equal(s.filter((x) => x.kind === "industry_funder").length, 3);
  assert.equal(s.filter((x) => x.kind === "company_coauthor").length, 2);
  assert.ok(sum(s) <= 15);
});

// ---- ORCID (fixtures trimmed from pub.orcid.org/v3.0/0000-0001-9905-046X/employments and 0000-0002-1978-6598/fundings)
const EMP = { "affiliation-group": [
  { summaries: [{ "employment-summary": { "department-name": null, "role-title": "CEO / Founder", "start-date": { year: { value: "2021" }, month: { value: "07" }, day: { value: "14" } },
    "end-date": null, organization: { name: "MY OVU" }, url: { value: "https://www.linkedin.com/in/alestaniszewska/" } } }] },
  { summaries: [{ "employment-summary": { "role-title": "Software Engineer", "start-date": { year: { value: "2019" }, month: { value: "07" }, day: null }, "end-date": null, organization: { name: "Google LLC" } } }] },
  { summaries: [{ "employment-summary": { "role-title": "Research Intern", "start-date": { year: { value: "2018" } }, "end-date": { year: { value: "2018" } }, organization: { name: "Microsoft Research" } } }] },
  { summaries: [{ "employment-summary": { "role-title": "PhD Student", "start-date": { year: { value: "2022" } }, "end-date": null, organization: { name: "Columbia University" } } }] },
] };
const FUND = { group: [
  { "funding-summary": [{ title: { title: { value: "Graduate Research Fellowship Program (GRFP)" } }, type: "award", "start-date": null, organization: { name: "National Science Foundation" } }] },
  { "funding-summary": [{ title: { title: { value: "Small lab equipment" } }, type: "grant", "start-date": { year: { value: "2024" } }, organization: { name: "Columbia University" } }] },
] };
test("bareOrcid accepts URL or bare id", () => {
  assert.equal(bareOrcid("https://orcid.org/0000-0002-1825-009x"), "0000-0002-1825-009X");
  assert.equal(bareOrcid("0000-0003-1139-9208"), "0000-0003-1139-9208");
  assert.equal(bareOrcid(null), null);
});
test("orcidToSignals: founder role, industry roles (incl. past internships), fellowship, grant", () => {
  const s = orcidToSignals("0000-0001-9905-046X", parseEmployments(EMP), parseFundings(FUND));
  const kinds = s.map((x) => x.kind);
  assert.deepEqual(kinds, ["founder_role", "industry_role", "grant"]); // 10 + 3, next +3s would exceed 15, +2 grant fits
  assert.equal(s[1].label, "ORCID: Software Engineer at Google LLC (2019-07–present)");
  assert.equal(orcidToSignals("x", parseEmployments(EMP), []).filter((x) => x.kind === "industry_role").length, 1);
  assert.equal(s[0].label, "ORCID: CEO / Founder at MY OVU (2021-07–present)");
  assert.equal(s[0].stage, 4); assert.equal(s[0].weight, 10);
  assert.equal(s[0].url, "https://orcid.org/0000-0001-9905-046X");
  assert.ok(sum(s) <= 15);
  const f = orcidToSignals("0000-0002-1978-6598", [], parseFundings(FUND));
  assert.deepEqual(f.map((x) => [x.kind, x.weight]), [["fellowship", 3], ["grant", 2]]);
  assert.match(f[0].label, /GRFP\) — National Science Foundation/);
  assert.deepEqual(orcidToSignals("x", parseEmployments({ "affiliation-group": [] }), parseFundings({ group: [] })), []);
});
test("orcid.enrich skips candidates without an ORCID (no fetch)", async () => {
  const orig = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response("{}"); }) as typeof fetch;
  try { assert.deepEqual(await orcid.enrich(cand({ orcid: null }), ctx), []); assert.equal(called, false); } finally { globalThis.fetch = orig; }
});

// ---- Europe PMC (fixture trimmed from rest/search?query=AUTH:"Harris Wang" AND SRC:PPR ...&resultType=core)
const now = new Date("2026-10-24T00:00:00Z");
const PPR = [
  { id: "PPR1295560", source: "PPR", doi: "10.64898/2026.08.04.742805", title: "Directed evolution of the  <i>Drosophila</i>  microbiome improves intestinal health and extends lifespan",
    authorList: { author: [{ firstName: "Timothy", lastName: "Chang", authorId: { type: "ORCID", value: "0009-0008-8079-0837" } }, { firstName: "Harris", lastName: "Wang" }] },
    abstractText: "The gut microbiome and its bacterially derived metabolites...", bookOrReportDetails: { publisher: "bioRxiv" }, firstPublicationDate: "2026-08-09" },
  { id: "PPR1330875", source: "PPR", title: "The Brutal Paradox: A Capabilities Approach to Boxing, MMA, and the Ethics of Violence",
    authorList: { author: [{ firstName: "Harris", lastName: "Wang" }] }, bookOrReportDetails: { publisher: "Preprints.org" }, firstPublicationDate: "2026-09-30" },
  { id: "PPR1", source: "PPR", title: "Old microbiome paper", authorList: { author: [{ firstName: "Harris", lastName: "Wang" }] }, firstPublicationDate: "2024-01-01" },
];
test("epmcQuery uses AUTH full name, AUTHORID when ORCID known, 12-month window", () => {
  assert.equal(epmcQuery(cand({ name: "Harris Wang" }), now), 'AUTH:"Harris Wang" AND SRC:PPR AND FIRST_PDATE:[2025-10-24 TO 2026-10-24]');
  assert.match(epmcQuery(cand({ name: "Timothy Chang", orcid: "https://orcid.org/0009-0008-8079-0837" }), now), /AUTHORID:"0009-0008-8079-0837"/);
});
test("epmcToSignals: on-topic recent preprints only; namesakes off-topic are dropped", () => {
  const c = cand({ name: "Harris Wang", works: [] });
  const s = epmcToSignals(c, PPR, "microbiome", now);
  assert.equal(s.length, 1);
  assert.equal(s[0].label, "bioRxiv: Directed evolution of the Drosophila microbiome improves intestinal health and extends lifespan (2026-08)");
  assert.equal(s[0].url, "https://europepmc.org/article/PPR/PPR1295560");
  assert.equal(s[0].kind, "preprint"); assert.equal(s[0].weight, 2);
  // ORCID equality counts even without topic overlap
  assert.equal(epmcToSignals(cand({ name: "Timothy Chang", orcid: "0009-0008-8079-0837", works: [] }), PPR, "", now).length, 1);
  // velocity at >= 3
  const many = [0, 1, 2, 3].map((i) => ({ ...PPR[0], id: `P${i}`, title: `Microbiome study number ${i}` }));
  const v = epmcToSignals(c, many, "microbiome", now);
  assert.deepEqual(v.map((x) => x.kind), ["preprint", "preprint", "preprint", "velocity"]);
  assert.equal(sum(v), 9);
});

// ---- CORDIS (fixture trimmed from cordis.europa.eu/api/search/results?q='Philipp Brandt'&format=json)
const CORDIS = [
  { authors: "Duncan J. Watts, Philipp Brandt", title: "Craft, Curiosity, and Knowledge: Duncan Watts in Conversation with Philipp Brandt", doi: "10.60923/ISSN.1971-8853/24939",
    journalTitle: "Sociologica", publishedYear: "2026", contentType: "result", pseudoContentType: "projectPublication", relatedProjectReference: "101117844", relatedProjectAcronym: "ReWORCS" },
  { authors: "Philipp Brandt", title: "Inside Data Science", doi: "10.7312/BRAN21408", journalTitle: "", publishedYear: "2026",
    contentType: "result", pseudoContentType: "projectPublication", relatedProjectReference: "101117844", relatedProjectAcronym: "ReWORCS" },
  { reference: "101117844", id: "101117844", acronym: "ReWORCS", programme: [{ title: "European Research Council (ERC)" }], startDate: "1 {{month_01}} 2024",
    teaser: "The rise of platforms and remote work has refashioned concerns about work security...", contentType: "project", pseudoContentType: "project",
    title: "Returns to Work in Occupational, Relational, and Corporate Settings" },
];
test("cordisDate parses CORDIS month placeholders", () => {
  assert.equal(cordisDate("1 {{month_09}} 2025"), "2025-09-01");
  assert.equal(cordisDate(""), null);
});
test("cordisToSignals: named author on project publication + shared work -> one signal per project", () => {
  const c = cand({ name: "Philipp Brandt", works: [{ ...cand().works[0], title: "Inside Data Science", doi: "10.7312/bran21408" }] });
  const s = cordisToSignals(c, CORDIS, "");
  assert.equal(s.length, 1);
  assert.equal(s[0].kind, "eu_grant"); assert.equal(s[0].weight, 3); assert.equal(s[0].stage, 6);
  assert.equal(s[0].url, "https://cordis.europa.eu/project/id/101117844");
  assert.equal(s[0].date, "2024-01-01");
  assert.match(s[0].label, /ReWORCS — Returns to Work .* \(European Research Council \(ERC\)\)/);
  // name match without any shared work / institution / topic -> namesake, nothing
  assert.deepEqual(cordisToSignals(cand({ name: "Philipp Brandt", works: [] }), CORDIS, "protein folding"), []);
  // project text alone (no named author) is never enough
  assert.deepEqual(cordisToSignals(cand({ name: "Jane Doe" }), CORDIS, "work"), []);
});

// ---- Wikidata (fixtures trimmed from wbgetentities for Q131177170 / Q16490)
const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
const VONDRICK = { id: "Q131177170", claims: { P31: [claim({ id: "Q5" })], P496: [claim("0000-0003-1139-9208")] }, sitelinks: {} };
const WING = { id: "Q16490", claims: { P31: [claim({ id: "Q5" })], P496: [claim("0000-0002-1013-1990")], P108: [claim({ id: "Q49088" })],
  P166: [claim({ id: "Q1" }), claim({ id: "Q2" }), claim({ id: "Q3" }), claim({ id: "Q4" })], P2037: [claim("jwing")], P2002: [claim("jeannettewing")],
  P856: [claim("http://www.cs.cmu.edu/~wing/")] }, sitelinks: { enwiki: {}, dewiki: {}, commonswiki: {} } };
test("acceptEntity: human + ORCID equality or institution QID; different ORCID rejected", () => {
  assert.ok(acceptEntity(cand({ orcid: "https://orcid.org/0000-0003-1139-9208" }), VONDRICK));
  assert.ok(!acceptEntity(cand({ orcid: null }), VONDRICK)); // no institution evidence
  assert.ok(acceptEntity(cand({ name: "Jeannette Wing" }), WING)); // P108 Columbia Q49088
  assert.ok(!acceptEntity(cand({ name: "Jeannette Wing", orcid: "0000-0000-0000-0001" }), WING));
  assert.ok(acceptEntity(cand({ institutions: ["Cornell"] }), { id: "Q9", claims: { P31: [claim({ id: "Q5" })], P69: [claim({ id: "Q77" })] } }, { Q77: "Weill Cornell Graduate School" }));
  assert.ok(!acceptEntity(cand(), { id: "Q9", claims: { P31: [claim({ id: "Q4167410" })], P108: [claim({ id: "Q49088" })] } }));
});
test("wikidataToSignals: notable needs a Wikipedia sitelink; awards max 3; identity handles at weight 0", () => {
  const s = wikidataToSignals(cand(), WING, { Q1: "ACM Fellow", Q2: "AAAS Fellow" });
  assert.deepEqual(s.map((x) => [x.kind, x.weight]), [["notable", 3], ["award", 2], ["award", 2], ["award", 2], ["identity", 0]]);
  assert.equal(s[1].label, "Wikidata: award — ACM Fellow");
  assert.equal(s[3].label, "Wikidata: award — Q3");
  assert.equal(s[4].label, "Wikidata: github=jwing, twitter=jeannettewing, orcid=0000-0002-1013-1990, website=http://www.cs.cmu.edu/~wing/");
  assert.equal(s[0].url, "https://www.wikidata.org/wiki/Q16490");
  assert.ok(sum(s) <= 15);
  assert.deepEqual(wikidataToSignals(cand(), VONDRICK).map((x) => [x.kind, x.weight, x.label]), [["identity", 0, "Wikidata: orcid=0000-0003-1139-9208"]]);
});

// ---- Dissertations (fixtures trimmed from Academic Commons api/v1/search and eCommons discover/search/objects)
const AC = { records: [
  { id: "10.7916/qj8d-0f36", title: "Intersections of Machine Learning and Decision Making", author: ["Cai, Tianhui"], abstract: "We study sequential decision making...",
    date: "2026", department: ["Statistics"], type: ["Theses"], persistent_url: "https://doi.org/10.7916/qj8d-0f36", created_at: "2026-09-09T17:13:32Z" },
  { id: "10.7916/old", title: "An older thesis on sparse vision", author: ["Cai, Tianhui"], date: "2019", type: ["Theses"], persistent_url: "https://doi.org/10.7916/old", created_at: "2019-05-01T00:00:00Z" },
  { id: "10.7916/art", title: "An article", author: ["Cai, Tianhui"], date: "2026", type: ["Articles"], persistent_url: "https://doi.org/10.7916/art", created_at: "2026-01-01T00:00:00Z" },
] };
const EC = { _embedded: { searchResult: { _embedded: { objects: [{ _embedded: { indexableObject: { uuid: "990115c5-e89f-4f78-85ff-04505257c0e4", handle: "1813/122799",
  name: "URBAN CORRIDOR DEVELOPMENT IN ADDIS ABABA: IMPACTS AND PUBLIC PERCEPTION",
  metadata: { "dc.contributor.author": [{ value: "Yang, Jinpeng" }], "dc.date.issued": [{ value: "2026-05-18" }], "dc.type": [{ value: "dissertation or thesis" }],
    "dc.description.abstract": [{ value: "Urban corridors..." }] } } } }] } } } };
test("flipName and repository parsers", () => {
  assert.equal(flipName("Barkoulis Gavris, Georgios"), "Georgios Barkoulis Gavris");
  assert.equal(flipName("Jane Doe"), "Jane Doe");
  const a = parseAcademicCommons(AC);
  assert.equal(a[0].authors[0], "Tianhui Cai"); assert.equal(a[0].date, "2026-09-09"); assert.equal(a[0].repo, "Columbia Academic Commons");
  const e = parseECommons(EC);
  assert.equal(e[0].url, "https://hdl.handle.net/1813/122799"); assert.equal(e[0].type, "dissertation or thesis"); assert.equal(e[0].authors[0], "Jinpeng Yang");
  assert.deepEqual(parseAcademicCommons(null), []); assert.deepEqual(parseECommons({}), []);
});
test("thesesToSignals: recent thesis by the candidate -> dissertation +6 (+2 on-topic), capped at 8", () => {
  const s = thesesToSignals(cand({ name: "Tianhui Cai", works: [] }), parseAcademicCommons(AC), "decision making", now);
  assert.deepEqual(s.map((x) => [x.kind, x.weight, x.stage]), [["dissertation", 6, 4], ["thesis_topic_match", 2, 1]]);
  assert.equal(s[0].label, "Dissertation deposited 2026-09: Intersections of Machine Learning and Decision Making (Columbia Academic Commons)");
  assert.ok(sum(s) <= 8);
  // old thesis counts only when on-topic; other names never count
  assert.deepEqual(thesesToSignals(cand({ name: "Tianhui Cai", works: [] }), parseAcademicCommons({ records: [AC.records[1]] }), "sparse", now).map((x) => x.kind), ["thesis_topic_match"]);
  assert.deepEqual(thesesToSignals(cand({ name: "Jane Cai", works: [] }), parseAcademicCommons(AC), "decision", now), []);
  assert.equal(thesesToSignals(cand({ name: "Jinpeng Yang", works: [] }), parseECommons(EC), "", now)[0].label,
    "Dissertation deposited 2026-05: URBAN CORRIDOR DEVELOPMENT IN ADDIS ABABA: IMPACTS AND PUBLIC PERCEPTION (Cornell eCommons)");
});
test("dissertations.enrich: NYU-only candidates query nothing", async () => {
  const orig = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => { called = true; return new Response("{}"); }) as typeof fetch;
  try { assert.deepEqual(await dissertations.enrich(cand({ institutions: ["NYU"] }), ctx), []); assert.equal(called, false); } finally { globalThis.fetch = orig; }
});

// ---- NIH RePORTER (fixture trimmed from POST api.reporter.nih.gov/v2/projects/search, pi any_name)
const NIH = [
  { appl_id: 11296827, project_num: "5F30CA298520-02", activity_code: "F30", fiscal_year: 2026, award_amount: 55000, project_start_date: "2025-03-01T00:00:00",
    project_title: "Investigating the chromatin landscape of ALT telomeres", organization: { org_name: "WEILL MEDICAL COLL OF CORNELL UNIV" },
    principal_investigators: [{ first_name: "Madison", middle_name: "", last_name: "Rex", full_name: "Madison  Rex" }], agency_ic_admin: { abbreviation: "NCI" } },
  { appl_id: 11378286, project_num: "5R01AI132403-09", activity_code: "R01", fiscal_year: 2026, award_amount: 713513, project_start_date: "2017-06-01T00:00:00",
    project_title: "Micron-scale Spatial Metagenomic Mapping", organization: { org_name: "COLUMBIA UNIVERSITY HEALTH SCIENCES" },
    principal_investigators: [{ first_name: "Harris", middle_name: "H", last_name: "Wang", full_name: "Harris H Wang" }], agency_ic_admin: { abbreviation: "NIAID" } },
  { appl_id: 11085956, project_num: "5R01AI132403-08", activity_code: "R01", fiscal_year: 2025, project_start_date: "2017-06-01T00:00:00",
    project_title: "Micron-scale Spatial Metagenomic Mapping", organization: { org_name: "COLUMBIA UNIVERSITY HEALTH SCIENCES" },
    principal_investigators: [{ first_name: "Harris", last_name: "Wang", full_name: "Harris H Wang" }] },
  { appl_id: 10475714, project_num: "5R01DK117365-05", activity_code: "R01", fiscal_year: 2022, project_title: "Skeletal Muscle", organization: { org_name: "AUGUSTA UNIVERSITY" },
    principal_investigators: [{ first_name: "Ryan", last_name: "Harris", full_name: "Ryan A Harris" }, { first_name: "XIAOLING", last_name: "WANG", full_name: "XIAOLING  WANG" }] },
  { appl_id: 1, project_num: "1R43GM000001-01", activity_code: "R43", fiscal_year: 2025, project_title: "Microbiome therapeutics", organization: { org_name: "ACME BIO INC" },
    principal_investigators: [{ first_name: "Harris", last_name: "Wang", full_name: "Harris Wang" }] },
  { appl_id: 2, project_num: "1R01XX000002-01", activity_code: "R01", fiscal_year: 2025, project_title: "Elsewhere", organization: { org_name: "STANFORD UNIVERSITY" },
    principal_investigators: [{ first_name: "Harris", last_name: "Wang", full_name: "Harris Wang" }] },
];
test("coreProjectNum strips type prefix and year/supplement suffix", () => {
  assert.equal(coreProjectNum("3R01CA272898-05S1"), "R01CA272898");
  assert.equal(coreProjectNum("5F30CA298520-02"), "F30CA298520");
});
test("nihProjectToSignal: F30 fellowship at Weill Cornell", () => {
  const s = nihProjectToSignal(cand({ name: "Madison Rex", institutions: ["Weill Cornell"] }), NIH[0])!;
  assert.equal(s.kind, "fellowship"); assert.equal(s.weight, 4); assert.equal(s.stage, 1);
  assert.equal(s.url, "https://reporter.nih.gov/project-details/11296827");
  assert.equal(s.label, "NIH F30 F30CA298520 — WEILL MEDICAL COLL OF CORNELL UNIV: Investigating the chromatin landscape of ALT telomeres (NCI, $55k, FY2026)");
});
test("nihProjectsToSignals: dedupe by core number, SBIR anywhere, namesakes and other-institution grants dropped", () => {
  const s = nihProjectsToSignals(cand({ name: "Harris Wang" }), NIH);
  assert.deepEqual(s.map((x) => [x.kind, x.weight]), [["sbir_award", 10], ["grant", 3]]);
  assert.match(s[0].label, /ACME BIO INC.*\[SBIR\/STTR\]/);
  assert.match(s[1].label, /R01AI132403 .*FY2026/);
  assert.ok(sum(s) <= 15);
});

// ---- every module: enrich never throws when fetch rejects / returns non-OK
const withOrcid = cand({ orcid: "https://orcid.org/0000-0003-1139-9208" });
for (const mod of [crossref, orcid, europepmc, cordis, wikidata, dissertations, nih]) {
  test(`${mod.id}.enrich returns [] when fetch rejects`, async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
    try { assert.deepEqual(await mod.enrich(withOrcid, ctx), []); } finally { globalThis.fetch = orig; }
  });
  test(`${mod.id}.enrich returns [] on non-OK HTTP (e.g. 429)`, async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 429 })) as typeof fetch;
    try { assert.deepEqual(await mod.enrich(withOrcid, ctx), []); } finally { globalThis.fetch = orig; }
  });
  test(`${mod.id}.enrich returns [] on malformed JSON`, async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response("<html>oops</html>", { status: 200 })) as typeof fetch;
    try { assert.deepEqual(await mod.enrich(withOrcid, ctx), []); } finally { globalThis.fetch = orig; }
  });
  test(`${mod.id} is enabled without keys`, () => assert.equal(mod.enabled(), true));
}
