import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candidate } from "../lib/types.ts";
import { normalizeName, namesMatch, mentionsInstitution, sharesWork, topicOverlap } from "../lib/sources/match.ts";
import { parseArxivAtom, arxivToSignals, source as arxiv } from "../lib/sources/arxiv.ts";
import { matchS2Author, s2ToSignals, source as s2 } from "../lib/sources/semanticscholar.ts";
import { nsfAwardToSignals, nsfAwardsToSignals, source as nsf } from "../lib/sources/nsf.ts";
import { patentToSignals, buildPatentQuery, source as patentsview } from "../lib/sources/patentsview.ts";
import { sbirAwardToSignal, source as sbir } from "../lib/sources/sbir.ts";

function cand(over: Partial<Candidate> = {}): Candidate {
  return {
    authorId: "https://openalex.org/A1", name: "Carl Vondrick", orcid: null, institutions: ["Columbia"],
    works: [{ id: "W1", title: "4D Gaussian Splatting as a Learned Dynamical System", year: 2025, doi: "https://doi.org/10.48550/arXiv.2512.19648",
      url: null, venue: null, citedBy: 5, position: "last", isCorresponding: false }],
    worksCount: 10, citedByCount: 100, firstPubYear: 2015, recentWorksCount: 3, reasons: [], mentions: [], education: [],
    isCurrentStudent: null, score: 0, brief: null, ...over,
  };
}
const ctx = { query: "efficient vision transformers", keywords: "vision transformer sparse" };

// ---- match.ts
test("normalizeName strips accents, punctuation, case", () => {
  assert.equal(normalizeName("  José  O'Neil-Smith Jr. "), "jose o neil smith jr");
});
test("namesMatch: exact, middle names omitted, initials rejected", () => {
  assert.ok(namesMatch("Carl M Vondrick", "Carl Vondrick"));
  assert.ok(namesMatch("carl vondrick", "Carl Vondrick"));
  assert.ok(namesMatch("Carl Martin Vondrick", "Carl M. Vondrick"));
  assert.ok(!namesMatch("C. Vondrick", "Carl Vondrick"));
  assert.ok(!namesMatch("V. Carl", "Carl Vondrick"));
  assert.ok(!namesMatch("Carl Sagan", "Carl Vondrick"));
  assert.ok(!namesMatch("", "Carl Vondrick"));
});
test("mentionsInstitution: Columbia, NYU, Cornell Tech, Weill Cornell", () => {
  assert.ok(mentionsInstitution("THE TRUSTEES OF COLUMBIA UNIVERSITY IN THE CITY OF NEW YORK", ["Columbia"]));
  assert.ok(mentionsInstitution("New York University", ["NYU"]));
  assert.ok(mentionsInstitution("NYU Tandon", ["New York University"]));
  assert.ok(mentionsInstitution("Weill Cornell Medicine", ["Cornell"]));
  assert.ok(mentionsInstitution("Cornell Tech", ["Cornell Tech"]));
  assert.ok(!mentionsInstitution("Stanford University", ["Columbia", "NYU"]));
  assert.ok(!mentionsInstitution("British Columbia Institute", ["NYU"]));
});
test("sharesWork by DOI or title; topicOverlap by keyword", () => {
  const c = cand();
  assert.ok(sharesWork(c, null, "10.48550/arxiv.2512.19648"));
  assert.ok(sharesWork(c, "4D gaussian splatting as a learned dynamical system!", null));
  assert.ok(!sharesWork(c, "Another paper entirely", null));
  assert.ok(topicOverlap(c, "Sparse vision by reinforced selection", "sparse attention"));
  assert.ok(!topicOverlap(c, "Protein folding", "batteries"));
});

// ---- arXiv (fixture trimmed from a real export.arxiv.org response)
const ATOM = `<?xml version='1.0' encoding='UTF-8'?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2609.04698v1</id>
    <title>LookThere! Sparse Vision by
      Reinforced Selection</title>
    <updated>2026-09-04T04:00:43Z</updated>
    <link href="https://arxiv.org/abs/2609.04698v1" rel="alternate" type="text/html"/>
    <summary>Vision transformers typically treat every image token as equally important &amp; more.</summary>
    <published>2026-09-04T04:00:43Z</published>
    <author><name>Jane Doe</name></author>
    <author><name>Carl Vondrick</name></author>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2001.00001v1</id><title>Old Sparse Vision Paper</title>
    <link href="https://arxiv.org/abs/2001.00001v1" rel="alternate" type="text/html"/>
    <summary>vision</summary><published>2020-01-01T00:00:00Z</published>
    <author><name>Carl Vondrick</name></author>
  </entry>
</feed>`;
test("parseArxivAtom extracts title/url/authors/published", () => {
  const e = parseArxivAtom(ATOM);
  assert.equal(e.length, 2);
  assert.equal(e[0].title, "LookThere! Sparse Vision by Reinforced Selection");
  assert.equal(e[0].url, "https://arxiv.org/abs/2609.04698v1");
  assert.deepEqual(e[0].authors, ["Jane Doe", "Carl Vondrick"]);
  assert.ok(e[0].summary.includes("& more"));
});
test("arxivToSignals: recent on-topic preprints only, velocity at >=3", () => {
  const now = new Date("2026-10-24T00:00:00Z");
  const s = arxivToSignals(cand(), parseArxivAtom(ATOM), ctx.keywords, now);
  assert.equal(s.length, 1);
  assert.equal(s[0].kind, "preprint");
  assert.equal(s[0].label, "arXiv: LookThere! Sparse Vision by Reinforced Selection (2026-09)");
  const e = parseArxivAtom(ATOM)[0];
  const many = arxivToSignals(cand(), [e, { ...e, url: "u2" }, { ...e, url: "u3" }, { ...e, url: "u4" }], ctx.keywords, now);
  assert.equal(many.filter((x) => x.kind === "preprint").length, 3);
  assert.equal(many.find((x) => x.kind === "velocity")?.weight, 3);
  assert.ok(many.reduce((a, b) => a + b.weight, 0) <= 15);
  assert.equal(arxivToSignals(cand({ name: "Someone Else" }), [e], ctx.keywords, now).length, 0);
});

// ---- Semantic Scholar (fixture from a real author/search response)
const S2 = [
  { authorId: "148281620", url: "https://www.semanticscholar.org/author/148281620", name: "V. Carl", affiliations: [], paperCount: 3, citationCount: 0, hIndex: 0, papers: [] },
  { authorId: "2252069989", url: "https://www.semanticscholar.org/author/2252069989", name: "Carl Vondrick", affiliations: [], paperCount: 5, citationCount: 86, hIndex: 3,
    papers: [
      { title: "4D Gaussian Splatting as a Learned Dynamical System", year: 2025, citationCount: 5, externalIds: { ArXiv: "2512.19648", DOI: "10.48550/arXiv.2512.19648" } },
      { title: "MIRACLE: An Online, Explainable Multimodal Interactive Concept Learning System", year: 2024, citationCount: 3, externalIds: { DOI: "10.1145/3664647.3684993" } },
      { title: "Old", year: 2019, citationCount: 50, externalIds: {} },
    ] },
  { authorId: "999", url: "https://www.semanticscholar.org/author/999", name: "Carl Vondrick", affiliations: [], paperCount: 1, citationCount: 1, hIndex: 1,
    papers: [{ title: "Unrelated namesake", year: 2025, citationCount: 1, externalIds: {} }] },
];
test("matchS2Author requires name + shared paper or affiliation", () => {
  assert.equal(matchS2Author(cand(), S2 as any)?.authorId, "2252069989");
  assert.equal(matchS2Author(cand({ works: [] }), S2 as any), null);
  const aff = [{ ...S2[2], affiliations: ["Columbia University"] }];
  assert.equal(matchS2Author(cand({ works: [] }), aff as any)?.authorId, "999");
});
test("s2ToSignals counts citations to last-2-year papers, capped weight", () => {
  const s = s2ToSignals(S2[1] as any, new Date("2026-10-24"));
  assert.equal(s.length, 1);
  assert.equal(s[0].kind, "citation_velocity");
  assert.equal(s[0].label, "S2: 8 citations to 2024-26 papers, h-index 3");
  assert.ok(s[0].weight >= 1 && s[0].weight <= 8);
  const big = s2ToSignals({ ...S2[1], papers: [{ title: "x", year: 2026, citationCount: 100000 }] } as any, new Date("2026-10-24"));
  assert.equal(big[0].weight, 8);
});

// ---- NSF (fields from real awards.json responses)
const AWARD = { id: "2435757", title: "AI framework for environmental hypotheses", awardeeName: "Columbia University", piFirstName: "Carl", piLastName: "Vondrick",
  pdPIName: "Carl M Vondrick", startDate: "06/10/2025", fundsObligatedAmt: "100000", fundProgramName: "Cross-BIO Activities" };
test("nsfAwardToSignals: grant at our institution as PI", () => {
  const [s] = nsfAwardToSignals(cand(), AWARD);
  assert.equal(s.stage, 6); assert.equal(s.kind, "grant"); assert.equal(s.weight, 3);
  assert.equal(s.url, "https://www.nsf.gov/awardsearch/showAward?AWD_ID=2435757");
  assert.equal(s.date, "2025-06-10");
  assert.match(s.label, /\$100k, 2025/);
});
test("nsfAwardToSignals: co-PI, I-Corps, SBIR, namesake elsewhere", () => {
  const co = { ...AWARD, id: "2429672", pdPIName: "Rachel Cummings", piFirstName: "Rachel", piLastName: "Cummings",
    coPDPI: ["Rachel Cummings rac2239@columbia.edu", "Carl M Vondrick cv2428@columbia.edu"] };
  assert.match(nsfAwardToSignals(cand(), co)[0].label, /co-PI/);
  const ic = { ...AWARD, title: "I-Corps: GenAI evaluation", fundProgramName: "I-Corps" };
  assert.deepEqual([nsfAwardToSignals(cand(), ic)[0].kind, nsfAwardToSignals(cand(), ic)[0].weight, nsfAwardToSignals(cand(), ic)[0].stage], ["icorps", 8, 4]);
  const sb = { ...AWARD, awardeeName: "LAB2701 LLC", fundProgramName: "SBIR Phase I", fundsObligatedAmt: "304526" };
  const [x] = nsfAwardToSignals(cand(), sb);
  assert.equal(x.kind, "sbir_award"); assert.equal(x.weight, 10); assert.match(x.label, /LAB2701 LLC/);
  assert.equal(nsfAwardToSignals(cand(), { ...AWARD, awardeeName: "Stanford University" }).length, 0);
  assert.equal(nsfAwardToSignals(cand({ name: "Jane Doe" }), AWARD).length, 0);
});
test("nsfAwardsToSignals dedupes, caps grants at 2 and total at 15", () => {
  const list = [AWARD, AWARD, { ...AWARD, id: "2" }, { ...AWARD, id: "3" }, { ...AWARD, id: "4", fundProgramName: "SBIR Phase II", awardeeName: "X Inc" }];
  const s = nsfAwardsToSignals(cand(), list);
  assert.equal(s.filter((x) => x.kind === "grant").length, 1); // 10 + 3 = 13; second grant would be 16 > 15
  assert.ok(s.reduce((a, b) => a + b.weight, 0) <= 15);
});

// ---- PatentsView
test("buildPatentQuery uses documented inventors.* fields", () => {
  const { q } = buildPatentQuery("carl vondrick");
  assert.deepEqual(JSON.parse(q), { _and: [{ "inventors.inventor_name_first": "Carl" }, { "inventors.inventor_name_last": "Vondrick" }] });
});
test("patentToSignals: university patent vs company assignee vs namesake", () => {
  const inv = [{ inventor_name_first: "Carl", inventor_name_last: "Vondrick", inventor_state: "NY" }];
  const uni = patentToSignals(cand(), { patent_id: "11000001", patent_title: "Video prediction", patent_date: "2024-03-01", inventors: inv,
    assignees: [{ assignee_organization: "The Trustees of Columbia University in the City of New York" }] });
  assert.equal(uni[0].kind, "patent"); assert.equal(uni[0].weight, 4);
  assert.equal(uni[0].url, "https://patents.google.com/patent/US11000001");
  const co = patentToSignals(cand(), { patent_id: "11000002", patent_title: "Robot", patent_date: "2025-01-01", inventors: inv,
    assignees: [{ assignee_organization: "Acme Robotics Inc." }] });
  assert.equal(co[0].kind, "ip_movement"); assert.equal(co[0].weight, 8);
  const far = patentToSignals(cand(), { patent_id: "3", inventors: [{ inventor_name_first: "Carl", inventor_name_last: "Vondrick", inventor_state: "CA" }],
    assignees: [{ assignee_organization: "Acme Inc." }] });
  assert.equal(far.length, 0);
});
test("patentsview disabled without key", () => {
  const k = process.env.PATENTSVIEW_API_KEY; delete process.env.PATENTSVIEW_API_KEY;
  assert.equal(patentsview.enabled(), false);
  if (k) process.env.PATENTSVIEW_API_KEY = k;
});

// ---- SBIR.gov
test("sbirAwardToSignal matches pi_name", () => {
  const a = { firm: "Acme Vision LLC", award_title: "Sparse vision chips", agency: "DOD", phase: "Phase I", program: "SBIR", award_year: "2025", award_amount: "150000", pi_name: "Carl M. Vondrick" };
  const s = sbirAwardToSignal(cand(), a)!;
  assert.equal(s.stage, 4); assert.equal(s.kind, "sbir_award"); assert.equal(s.weight, 10);
  assert.match(s.label, /Acme Vision LLC \(DOD, 2025\) \$150k/);
  assert.equal(sbirAwardToSignal(cand(), { ...a, pi_name: "Someone Else" }), null);
});
test("sbir disabled by default (API returns 403)", () => {
  const v = process.env.SBIR_API_ENABLED; delete process.env.SBIR_API_ENABLED;
  assert.equal(sbir.enabled(), false);
  if (v) process.env.SBIR_API_ENABLED = v;
});

// ---- every module: enrich never throws when fetch rejects
for (const mod of [arxiv, s2, nsf, patentsview, sbir]) {
  test(`${mod.id}.enrich returns [] when fetch rejects`, async () => {
    const orig = globalThis.fetch;
    const env = { ...process.env };
    process.env.PATENTSVIEW_API_KEY = "test"; process.env.SBIR_API_ENABLED = "1";
    globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
    try {
      assert.deepEqual(await mod.enrich(cand(), ctx), []);
    } finally {
      globalThis.fetch = orig;
      if (env.PATENTSVIEW_API_KEY === undefined) delete process.env.PATENTSVIEW_API_KEY; else process.env.PATENTSVIEW_API_KEY = env.PATENTSVIEW_API_KEY;
      if (env.SBIR_API_ENABLED === undefined) delete process.env.SBIR_API_ENABLED; else process.env.SBIR_API_ENABLED = env.SBIR_API_ENABLED;
    }
  });
  test(`${mod.id}.enrich returns [] on non-OK HTTP (e.g. 429)`, async () => {
    const orig = globalThis.fetch;
    process.env.PATENTSVIEW_API_KEY ??= "test";
    globalThis.fetch = (async () => new Response("{}", { status: 429 })) as typeof fetch;
    try { assert.deepEqual(await mod.enrich(cand(), ctx), []); } finally { globalThis.fetch = orig; }
  });
}
