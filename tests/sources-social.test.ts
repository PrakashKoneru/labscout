import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candidate } from "../lib/types.ts";
import type { Signal } from "../lib/sources/types.ts";
import { pickActor, bskyToSignals, knownHandles, LAUNCH_RE, HIRING_RE, source as bluesky, type BskyActor, type BskyFeedItem } from "../lib/sources/bluesky.ts";
import { hnEvidence, hnQueries, hitMatches, hnToSignals, source as hackernews, type HnHit } from "../lib/sources/hackernews.ts";

const work = (title: string, doi: string | null = null) => ({ id: "W", title, year: 2024, doi, url: null, venue: null, citedBy: 0, position: "first" as const, isCorresponding: false });
const sig = (source: Signal["source"], kind: string, url: string): Signal => ({ source, stage: 2, kind, label: kind, url, date: null, weight: 1 });
function cand(over: Partial<Candidate> = {}): Candidate {
  return {
    authorId: "A1", name: "Sasha Rush", orcid: null, institutions: ["Cornell Tech"],
    works: [work("The Annotated Transformer"), work("Discrete Diffusion Language Models", "10.48550/arXiv.2406.07524")],
    worksCount: 2, citedByCount: 0, firstPubYear: 2012, recentWorksCount: 1, reasons: [], mentions: [], education: [],
    isCurrentStudent: null, score: 0, brief: null,
    signals: [sig("github", "profile", "https://github.com/srush"), sig("github", "repo", "https://github.com/srush/GPU-Puzzles"),
      sig("huggingface", "profile", "https://huggingface.co/srush")],
    ...over,
  };
}
const KW = "discrete diffusion language";

function mockFetch(impl: () => Promise<Response>) {
  const orig = globalThis.fetch;
  globalThis.fetch = impl as typeof fetch;
  return () => { globalThis.fetch = orig; };
}

// ---- Bluesky (fixtures trimmed from real public.api.bsky.app responses, 2026-10)
const ACTORS: BskyActor[] = [
  { did: "did:plc:cysbeo6jsw46wltluejxdgji", handle: "srushnlp.bsky.social", displayName: "Sasha Rush", description: "Professor, Programmer in NYC.  \nCornell, Hugging Face 🤗" },
  { did: "did:plc:dqga5ezp56bbqrmnzq5kgcs7", handle: "mandarinaw.bsky.social", displayName: "Sasha RushB" },
  { did: "did:plc:e6viblkcsztudabnp56gjh4v", handle: "bobcesca.bsky.social", displayName: "Bob Cesca", description: "Podcaster: The Bob Cesca Show, Trek Politics. Writer, artist, cyclist, Rush fan." },
];
const DID = ACTORS[0].did;
const FEED: BskyFeedItem[] = [
  { // repost of someone else's post — must be ignored
    post: { uri: "at://did:plc:brkj2yocng7vtggmyujy4khq/app.bsky.feed.post/3lcgti7ebnm2q", author: { did: "did:plc:brkj2yocng7vtggmyujy4khq" },
      record: { text: "We're hiring another predoctoral researcher for my team at Ai2/OLMo next year.", createdAt: "2024-12-03T23:52:41.007Z" }, likeCount: 54 },
    reason: { $type: "app.bsky.feed.defs#reasonRepost" } },
  { post: { uri: "at://did:plc:cysbeo6jsw46wltluejxdgji/app.bsky.feed.post/3lbi4eovxqs2l", author: { did: DID },
    record: { text: "Discrete diffusion has become a very hot topic again this year. Dozens of interesting ICLR submissions", createdAt: "2024-11-21T18:39:15.000Z" }, likeCount: 76, repostCount: 12 } },
  { post: { uri: "at://did:plc:cysbeo6jsw46wltluejxdgji/app.bsky.feed.post/3lafiumgck22m", author: { did: DID },
    record: { text: "Heard we are moving NLP twitter over here now. Seems like a good time, I'll try to cross post.", createdAt: "2024-11-08T00:19:42.854Z" }, likeCount: 100 } },
  // text from a real atproto.com post, re-attributed to the actor to exercise the launch path
  { post: { uri: "at://did:plc:cysbeo6jsw46wltluejxdgji/app.bsky.feed.post/3msydg6sd7s2d", author: { did: DID },
    record: { text: "Today we’re launching Bluesky Protocol Services, a new brand and website for the infrastructure Bluesky operates.", createdAt: "2024-12-13T19:02:26.980Z" }, likeCount: 534 } },
  { post: { uri: "at://did:plc:cysbeo6jsw46wltluejxdgji/app.bsky.feed.post/3mnkurkveas2b", author: { did: DID },
    record: { text: "We're changing up the time of the Off Protocol livestreams just a bit, join us next Wednesday at 1p ET.", createdAt: "2024-12-05T19:29:47.896Z" }, likeCount: 55 } },
  { post: { uri: "at://did:plc:cysbeo6jsw46wltluejxdgji/app.bsky.feed.post/3old", author: { did: DID },
    record: { text: "We're hiring a founding engineer!", createdAt: "2023-01-01T00:00:00.000Z" }, likeCount: 5 } },
];
const NOW = Date.parse("2025-03-01T00:00:00Z");

test("bluesky pickActor: name + institution in bio; rejects lookalikes and missing evidence", () => {
  assert.equal(pickActor(cand(), ACTORS, KW)?.handle, "srushnlp.bsky.social");
  assert.equal(pickActor(cand({ institutions: ["Columbia"], signals: [] }), ACTORS, ""), null); // no evidence
  assert.equal(pickActor(cand({ name: "Bob Cesca" }), ACTORS, ""), null);
  assert.equal(pickActor(cand(), [], KW), null);
});
test("bluesky pickActor: GitHub login in bio is evidence; ties are ambiguous", () => {
  const a = { did: "did:x", handle: "x.bsky.social", displayName: "Sasha Rush", description: "code at github.com/srush" };
  assert.equal(pickActor(cand({ institutions: ["Columbia"] }), [a], "")?.did, "did:x");
  assert.equal(pickActor(cand({ institutions: ["Columbia"], signals: [] }), [a], ""), null);
  assert.equal(pickActor(cand(), [ACTORS[0], { ...ACTORS[0], did: "did:y", handle: "y" }], KW), null);
  assert.deepEqual(knownHandles(cand({ orcid: "https://orcid.org/0000-0002-1825-0097" })), { github: ["srush"], orcid: ["0000-0002-1825-0097"] });
});
test("bluesky regexes", () => {
  assert.ok(LAUNCH_RE.test("Excited to share I'm co-founder of a new startup"));
  assert.ok(LAUNCH_RE.test("We raised our seed round"));
  assert.ok(!LAUNCH_RE.test("Talk: Speculations on Test-Time Scaling"));
  assert.ok(HIRING_RE.test("We're hiring a founding engineer"));
  assert.ok(!HIRING_RE.test("join us next Wednesday at 1p ET"));
});
test("bluesky bskyToSignals: profile, launch, traction; skips reposts, event posts, old posts", () => {
  const s = bskyToSignals(cand(), ACTORS[0], 7422, FEED, KW, NOW);
  assert.deepEqual(s.map((x) => x.kind), ["profile", "traction_post", "launch_post"]);
  assert.equal(s[0].label, "Bluesky @srushnlp.bsky.social — 7422 followers");
  assert.equal(s[0].url, "https://bsky.app/profile/srushnlp.bsky.social");
  assert.equal(s[1].url, "https://bsky.app/profile/srushnlp.bsky.social/post/3lbi4eovxqs2l");
  assert.ok(s[1].label.startsWith("Bluesky post (2024-11-21): Discrete diffusion"));
  assert.equal(s[2].stage, 4);
  assert.equal(s[2].weight, 6);
  assert.ok(s.reduce((n, x) => n + x.weight, 0) <= 15);
});
test("bluesky bskyToSignals: hiring post (not academic), capped total", () => {
  const p = (text: string, rkey: string): BskyFeedItem => ({ post: { uri: `at://${DID}/app.bsky.feed.post/${rkey}`, author: { did: DID }, record: { text, createdAt: "2025-02-01T00:00:00Z" }, likeCount: 900 } });
  const s = bskyToSignals(cand(), ACTORS[0], 10, [p("We're hiring a postdoc in my lab", "a"), p("We're hiring a senior engineer", "b"),
    p("Launching our startup today", "c"), p("discrete diffusion one", "d"), p("discrete diffusion two", "e"), p("discrete diffusion three", "f")], KW, NOW);
  assert.deepEqual(s.map((x) => x.kind), ["profile", "hiring_post", "launch_post", "traction_post", "traction_post"]);
  assert.equal(s.find((x) => x.kind === "hiring_post")!.url!.endsWith("/b"), true);
  assert.equal(s.reduce((n, x) => n + x.weight, 0), 15);
});
test("bluesky enrich returns [] when fetch rejects or HTTP non-OK", async () => {
  let restore = mockFetch(() => Promise.reject(new Error("net")));
  try { assert.deepEqual(await bluesky.enrich(cand(), { query: "", keywords: KW }), []); } finally { restore(); }
  restore = mockFetch(() => Promise.resolve(new Response("rate limited", { status: 429 })));
  try { assert.deepEqual(await bluesky.enrich(cand(), { query: "", keywords: KW }), []); } finally { restore(); }
  assert.equal(bluesky.wave, 2);
});

// ---- Hacker News (fixtures trimmed from real hn.algolia.com responses, 2026-10)
const HITS: HnHit[] = [
  { objectID: "41579268", title: "GPU Puzzles", url: "https://github.com/srush/GPU-Puzzles", author: "x", points: 356, num_comments: 40, created_at: "2024-09-18T13:08:37Z" },
  { objectID: "45002896", title: "The Annotated Transformer (2022)", url: "https://nlp.seas.harvard.edu/annotated-transformer/", points: 208, num_comments: 12, created_at: "2025-08-24T09:58:13Z" },
  { objectID: "31771900", title: "The Annotated Transformer", url: "http://nlp.seas.harvard.edu/annotated-transformer/", points: 3, num_comments: 0, created_at: "2022-06-16T22:41:29Z" },
  // fuzzy-match noise Algolia really returns
  { objectID: "44904993", title: "DINOv3", url: "https://github.com/facebookresearch/dinov3", points: 179, num_comments: 31, created_at: "2025-08-14T20:02:46Z" },
  { objectID: "49731455", title: "Show HN: In-Browser Sanskrit ASR Model", url: "https://huggingface.co/gnumanth/sushrota-sanskrit-asr-onnx", points: 3, num_comments: 0, created_at: "2026-09-16T19:04:33Z" },
  { objectID: "47628238", title: "ARCHE3-7B – Sparse Moe with SmartRouter", url: null, points: 1, num_comments: 0, created_at: "2026-04-03T15:54:02Z" },
  { objectID: "1", title: "Show HN: GPU puzzles in the browser", url: "https://github.com/srush/gpu-puzzles#readme", points: 12, num_comments: 2, created_at: "2024-10-01T00:00:00Z" },
  { objectID: "2", title: "Paper", url: "https://arxiv.org/abs/2406.07524v2", points: 30, num_comments: 1, created_at: "2024-06-12T00:00:00Z" },
];

test("hackernews evidence + queries come from wave-1 signals and works, never the bare name", () => {
  const e = hnEvidence(cand());
  assert.deepEqual(e.repos, ["github.com/srush/gpu-puzzles"]);
  assert.deepEqual(e.hf, ["huggingface.co/srush"]);
  assert.deepEqual(e.arxiv, ["2406.07524"]);
  const q = hnQueries(e);
  assert.ok(q.includes('"The Annotated Transformer"') && q.includes("github.com/srush/gpu-puzzles"));
  assert.ok(!q.some((x) => /sasha/i.test(x)));
  assert.deepEqual(hnQueries(hnEvidence(cand({ signals: [], works: [] }))), []);
});
test("hackernews hitMatches: exact repo/HF/arXiv URL or work title; rejects fuzzy noise", () => {
  const c = cand(), e = hnEvidence(c);
  const ok = HITS.filter((h) => hitMatches(h, e, c)).map((h) => h.objectID);
  assert.deepEqual(ok, ["41579268", "45002896", "31771900", "1", "2"]);
});
test("hackernews hnToSignals: show_hn vs hn_story weights, dedupe by URL, max 3, cap 15", () => {
  const c = cand(), e = hnEvidence(c);
  const s = hnToSignals(HITS.filter((h) => hitMatches(h, e, c)));
  assert.equal(s.length, 3);
  assert.equal(s[0].label, "HN: GPU Puzzles — 356 points, 40 comments (2024-09)");
  assert.equal(s[0].url, "https://news.ycombinator.com/item?id=41579268");
  assert.equal(s[0].kind, "hn_story");
  assert.equal(s[0].weight, 5);
  assert.ok(!s.some((x) => x.url!.endsWith("31771900"))); // same URL as 45002896 (http/https), lower points
  const show = hnToSignals([1, 2, 3].map((i) => ({ objectID: String(i), title: `Show HN: thing ${i}`, url: `https://x/${i}`, points: 1, num_comments: 0, created_at: "2025-01-01T00:00:00Z" })));
  assert.deepEqual(show.map((x) => [x.kind, x.weight]), [["show_hn", 6], ["show_hn", 6], ["show_hn", 3]]);
  assert.equal(hnToSignals([{ ...HITS[5], points: 0 }])[0].weight, 1);
});
test("hackernews enrich: no evidence → no request; [] on fetch reject / non-OK", async () => {
  let calls = 0;
  let restore = mockFetch(() => { calls++; return Promise.reject(new Error("net")); });
  try {
    assert.deepEqual(await hackernews.enrich(cand({ signals: [], works: [] }), { query: "", keywords: "" }), []);
    assert.equal(calls, 0);
    assert.deepEqual(await hackernews.enrich(cand(), { query: "", keywords: "" }), []);
  } finally { restore(); }
  restore = mockFetch(() => Promise.resolve(new Response("{}", { status: 503 })));
  try { assert.deepEqual(await hackernews.enrich(cand(), { query: "", keywords: "" }), []); } finally { restore(); }
  assert.equal(hackernews.wave, 2);
});
