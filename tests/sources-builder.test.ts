import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candidate } from "../lib/types.ts";
import type { Signal } from "../lib/sources/types.ts";
import { findHfUser, hfPaperSignals, hfArtifactSignals, hfToSignals, source as huggingface } from "../lib/sources/huggingface.ts";
import { packageCandidates, pypiOwned, npmOwned, linksRepo, packageSignal, capSignals, source as packages } from "../lib/sources/packages.ts";
import { flipName, zenodoQuery, zenodoMatches, zenodoToSignals, source as zenodo } from "../lib/sources/zenodo.ts";

function cand(over: Partial<Candidate> = {}): Candidate {
  return {
    authorId: "https://openalex.org/A1", name: "Ellis Brown", orcid: null, institutions: ["NYU"],
    works: [{ id: "W1", title: "Cambrian-1: A Fully Open, Vision-Centric Exploration of Multimodal LLMs", year: 2024, doi: null,
      url: null, venue: null, citedBy: 50, position: "middle", isCorresponding: false }],
    worksCount: 10, citedByCount: 100, firstPubYear: 2020, recentWorksCount: 3, reasons: [], mentions: [], education: [],
    isCurrentStudent: true, score: 0, brief: null, signals: [], ...over,
  };
}
const ctx = { query: "multimodal llm", keywords: "multimodal vision" };
const NOW = Date.parse("2026-10-24T00:00:00Z");
const total = (s: Signal[]) => s.reduce((a, x) => a + x.weight, 0);

// ---- Hugging Face (fixtures trimmed from real huggingface.co/api responses)
const PAPERS = [
  { id: "2406.16860", title: "Cambrian-1: A Fully Open, Vision-Centric Exploration of Multimodal LLMs", upvotes: 63, publishedAt: "2024-06-24T17:59:42.000Z",
    authors: [{ name: "Shengbang Tong", user: { user: "tsbpp", fullname: "Peter Tong" } }, { name: "Ellis Brown", user: { user: "ellisbrown", fullname: "Ellis Brown" } }, { name: "Saining Xie" }] },
  { id: "2509.00001", title: "Some Other Paper By A Namesake", upvotes: 40, authors: [{ name: "Ellis Brown", user: { user: "namesake", fullname: "Ellis Brown" } }] },
];
test("findHfUser: username only from a shared paper with a name-matched, linked author", () => {
  assert.equal(findHfUser(cand(), PAPERS), "ellisbrown");
  assert.equal(findHfUser(cand(), [PAPERS[1]]), null);                         // not one of the candidate's works
  assert.equal(findHfUser(cand({ name: "Saining Xie" }), PAPERS), null);       // on the paper but no HF account
});
test("hfPaperSignals: shared works with >=5 upvotes, +2 each, max 2", () => {
  const s = hfPaperSignals(cand(), [...PAPERS, { ...PAPERS[0] }, { ...PAPERS[0], id: "x", upvotes: 2 }]);
  assert.equal(s.length, 1);
  assert.equal(s[0].url, "https://huggingface.co/papers/2406.16860");
  assert.match(s[0].label, /63 upvotes/);
});
test("hfArtifactSignals: thresholds, weights, urls, labels", () => {
  const s = hfArtifactSignals("dataset", [
    { id: "ellisbrown/SIMS-VSI", lastModified: "2025-11-07T20:29:28.000Z", likes: 7, downloads: 869 },
    { id: "ellisbrown/old-empty", lastModified: "2023-01-01T00:00:00.000Z", likes: 0, downloads: 3 },
  ], NOW);
  assert.equal(s.length, 1);
  assert.equal(s[0].weight, 6);
  assert.equal(s[0].url, "https://huggingface.co/datasets/ellisbrown/SIMS-VSI");
  assert.equal(s[0].label, "HF dataset ellisbrown/SIMS-VSI — 869 downloads, 7 likes");
  const m = hfArtifactSignals("model", [{ id: "u/m", downloads: 12300, likes: 45, pipeline_tag: "text-generation" }], NOW);
  assert.equal(m[0].weight, 7);
  assert.equal(m[0].label, "HF model u/m — 12.3k downloads, 45 likes (text-generation)");
  const sp = hfArtifactSignals("space", [{ id: "akhaliq/anycoder", likes: 3320, lastModified: "2026-04-20T16:42:10.000Z" }], NOW);
  assert.equal(sp[0].url, "https://huggingface.co/spaces/akhaliq/anycoder");
  assert.equal(sp[0].weight, 7);
});
test("hfToSignals: profile first with HF url, total capped at 15", () => {
  const arts = hfArtifactSignals("model", Array.from({ length: 6 }, (_, i) => ({ id: `ellisbrown/m${i}`, downloads: 1e6, likes: 50 })), NOW);
  const s = hfToSignals("ellisbrown", arts, [], "Ellis Brown");
  assert.equal(s[0].kind, "profile");
  assert.equal(s[0].url, "https://huggingface.co/ellisbrown");
  assert.ok(total(s) <= 15);
});

// ---- Packages (wave 2)
const gh = (r: string): Signal => ({ source: "github", stage: 2, kind: "repo", label: `${r} — 12★`, url: `https://github.com/${r}`, date: null, weight: 3 });
test("packages is a wave-2 source; candidates come from GitHub repos and HF artifacts", () => {
  assert.equal(packages.wave, 2);
  const c = cand({ signals: [gh("Ellis/My_Tool"), { source: "github", stage: 2, kind: "profile", label: "GitHub @ellis", url: "https://github.com/ellis", date: null, weight: 2 },
    { source: "huggingface", stage: 2, kind: "model", label: "HF model", url: "https://huggingface.co/ellisbrown/tinymodel", date: null, weight: 2 }] });
  const p = packageCandidates(c);
  assert.deepEqual(p.map((x) => x.name), ["my_tool", "my-tool", "tinymodel"]);
  assert.equal(p[0].repo, "ellis/my_tool");
  assert.equal(p[2].repo, null);
});
test("linksRepo / pypiOwned / npmOwned reject namesake packages", () => {
  assert.ok(linksRepo("git+https://github.com/colinhacks/zod.git", "colinhacks/zod"));
  assert.ok(linksRepo("https://github.com/pytorch/vision/tree/main", "pytorch/vision"));
  assert.ok(!linksRepo("https://github.com/pytorch/vision-extra", "pytorch/vision"));
  const info = { name: "torchvision", author: "PyTorch Core Team", home_page: "https://github.com/pytorch/vision", project_urls: { Homepage: "https://github.com/pytorch/vision" } };
  assert.ok(pypiOwned(cand(), info, "pytorch/vision"));
  assert.ok(!pypiOwned(cand(), info, "someone/torchvision"));
  assert.ok(pypiOwned(cand(), { author: "Ellis Brown, Jane Doe", project_urls: {} }, null));
  assert.ok(!pypiOwned(cand(), { author: "PyTorch Core Team" }, null));
  const npm = { name: "zod", repository: { url: "git+https://github.com/colinhacks/zod.git", type: "git" }, author: { name: "Colin McDonnell" } };
  assert.ok(npmOwned(cand(), npm, "colinhacks/zod"));
  assert.ok(!npmOwned(cand(), npm, "ellis/zod"));
  assert.ok(npmOwned(cand({ name: "Colin McDonnell" }), npm, null));
});
test("packageSignal weights/labels and capSignals <= 15", () => {
  const s = packageSignal("PyPI", "torchvision", 15542455, "2026-09-30T17:56:58Z")!;
  assert.equal(s.weight, 7);
  assert.equal(s.label, "PyPI torchvision — 15.5M downloads/month");
  assert.equal(s.url, "https://pypi.org/project/torchvision/");
  assert.equal(packageSignal("npm", "zod", 1252658568, null)!.label, "npm zod — 1.3B downloads/month");
  assert.equal(packageSignal("npm", "tiny", 0, null), null);
  const capped = capSignals(["a", "b", "c"].map((n) => packageSignal("npm", n, 1e7, null)!));
  assert.equal(capped.length, 2);
  assert.ok(total(capped) <= 15);
});

// ---- Zenodo (fixture trimmed from a real zenodo.org/api/records response)
const HITS = [
  { id: 23468475, conceptrecid: "23468474", doi: "10.5281/zenodo.23468475",
    metadata: { title: "Code supplement to \"Curating research assets\"", publication_date: "2026-10-19", resource_type: { type: "software" },
      creators: [{ name: "Vuorre, Matti", affiliation: "Columbia University", orcid: "0000-0001-5052-066X" }] },
    stats: { downloads: 33, unique_downloads: 32, views: 120 }, links: { self_html: "https://zenodo.org/records/23468475" } },
  { id: 23468470, conceptrecid: "23468474", metadata: { title: "Code supplement to \"Curating research assets\"", resource_type: { type: "software" },
      creators: [{ name: "Vuorre, Matti", affiliation: "Columbia University" }] }, stats: { downloads: 5 }, links: { self_html: "https://zenodo.org/records/23468470" } },
  { id: 11147583, metadata: { title: "LEAP Operations Manual", resource_type: { type: "publication" }, creators: [{ name: "Vuorre, Matti", affiliation: "Columbia" }] }, stats: { downloads: 155 } },
  { id: 1, metadata: { title: "Unrelated soil dataset", resource_type: { type: "dataset" }, creators: [{ name: "Matti Vuorre", affiliation: "Stanford" }] }, stats: { downloads: 9000 } },
];
test("zenodo query uses both name orders and restricts to software/dataset", () => {
  assert.equal(flipName("Vuorre, Matti"), "Matti Vuorre");
  assert.equal(zenodoQuery("Matti J Vuorre"), '(creators.name:"Vuorre, Matti" OR creators.name:"Matti Vuorre") AND (resource_type.type:software OR resource_type.type:dataset)');
  assert.equal(zenodoQuery("Madonna"), "");
});
test("zenodoMatches: name AND (orcid | institution | shared work); topic alone rejected", () => {
  const c = cand({ name: "Matti Vuorre", institutions: ["Columbia"] });
  assert.ok(zenodoMatches(c, HITS[0], ""));
  assert.ok(!zenodoMatches(c, HITS[3], "")); // namesake elsewhere, no evidence
  assert.ok(zenodoMatches(cand({ name: "Matti Vuorre", institutions: ["NYU"], orcid: "https://orcid.org/0000-0001-5052-066X" }), HITS[0], ""));
  assert.ok(!zenodoMatches(cand({ name: "Matti Vuorre", institutions: ["NYU"] }), HITS[3], "soil"));
});
test("zenodoToSignals: dedupe versions, skip non-software/dataset, weight and label", () => {
  const s = zenodoToSignals(cand({ name: "Matti Vuorre", institutions: ["Columbia"] }), HITS, "");
  assert.equal(s.length, 1);
  assert.equal(s[0].kind, "software");
  assert.equal(s[0].weight, 3);
  assert.equal(s[0].url, "https://zenodo.org/records/23468475");
  assert.equal(s[0].label, "Zenodo software: Code supplement to \"Curating research assets\" — 33 downloads");
  const many = Array.from({ length: 8 }, (_, i) => ({ ...HITS[0], id: i, conceptrecid: String(i), stats: { downloads: 1e6 } }));
  const m = zenodoToSignals(cand({ name: "Matti Vuorre", institutions: ["Columbia"] }), many, "");
  assert.equal(m.length, 3);
  assert.ok(total(m) <= 15);
});

// ---- every module: enrich never throws
const withGh = cand({ signals: [gh("colinhacks/zod")] });
for (const mod of [huggingface, packages, zenodo]) {
  test(`${mod.id}.enrich returns [] when fetch rejects`, async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
    try { assert.deepEqual(await mod.enrich(withGh, ctx), []); } finally { globalThis.fetch = orig; }
  });
  test(`${mod.id}.enrich returns [] on HTTP 429`, async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 429 })) as typeof fetch;
    try { assert.deepEqual(await mod.enrich(withGh, ctx), []); } finally { globalThis.fetch = orig; }
  });
}
